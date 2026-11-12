"""Composable job query: one model drives both the DB filter (SQL) and the scrape plan.

Semantics (mirrors a SQL WHERE):
  - different filters are AND-ed
  - `scopes` are OR-ed; inside a scope: (place IN places) AND (work_mode IN modes)
  - `title_any` is OR-ed; every word of a phrase must appear in the title
  - `title_none` excludes titles containing any of the phrases
"""

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from . import fx, geo

WorkMode = Literal["onsite", "hybrid", "remote", "unknown"]
# Employment type, normalised from JobSpy's (temporary/per diem count as contract).
JobType = Literal["fulltime", "parttime", "contract", "internship", "volunteer"]
Site = Literal["linkedin", "indeed"]
SITES: tuple[Site, ...] = ("linkedin", "indeed")


@dataclass
class BoardPlace:
    """How a place is spelled for the job boards (English, as they geocode it)."""

    city: str
    region: str | None
    country: str | None  # English country name
    indeed_country: str | None  # JobSpy Country value, None if Indeed doesn't cover it

    @property
    def linkedin(self) -> str:
        return ", ".join(p for p in (self.city, self.region, self.country) if p)

    def matches(self, location: str) -> bool:
        """Can a LinkedIn result be in this place's country?

        Results naming the country pass. So do locations without a "City, State[, Country]"
        shape, like "Greater Milan Metropolitan Area" or "Switzerland". What gets rejected is an
        explicit elsewhere, e.g. "Milano, TX" or "Bastrop, TX, USA" for a search in Italy.
        """
        if not self.country or not location:
            return True
        loc = location.lower()
        names = {self.country.lower(), (self.indeed_country or "").lower()} - {""}
        if any(n in loc for n in names):
            return True
        return location.count(",") == 0


def _indeed_country(english_name: str | None) -> str | None:
    from jobspy.model import Country

    if not english_name:
        return None
    try:
        return Country(english_name).value
    except ValueError:
        return None


class Place(BaseModel):
    city: str = Field(min_length=1, max_length=80)
    country: str = Field(
        "it", pattern=r"^[a-z]{2}$"
    )  # ISO 3166-1 alpha-2, inherited from the pick
    region: str | None = Field(None, max_length=80)
    geo_id: int | None = None  # GeoNames id from the autocomplete

    @property
    def legacy_key(self) -> str:
        return f"{self.city.strip().lower()}|{self.country}"

    @property
    def key(self) -> str:
        """Stored on hits; geo id when known, so two "Naples" don't collide."""
        return f"geo:{self.geo_id}" if self.geo_id else self.legacy_key

    @property
    def keys(self) -> list[str]:
        """Keys to match in SQL (also the pre-geocoding key, for older hits)."""
        return list(dict.fromkeys([self.key, self.legacy_key]))

    @property
    def label(self) -> str:
        region = f" ({self.region})" if self.region else ""
        return f"{self.city.strip()}{region}, {self.country.upper()}"

    def board(self) -> BoardPlace:
        """English spelling for the boards. May hit the network: call once per place."""
        en = geo.english(self.geo_id) if self.geo_id else None
        if en and en.get("city"):
            return BoardPlace(
                en["city"],
                en.get("region"),
                en.get("country"),
                _indeed_country(en.get("country")),
            )
        # Places without a GeoNames id (offline catalogue, old links) or a failed lookup.
        _, english, indeed = geo.COUNTRIES.get(self.country, (None, None, None))
        city = geo.EXONYMS.get(self.city.strip().lower(), self.city.strip())
        return BoardPlace(city, None, english, indeed)


ANYWHERE_KEY = "*"


class Scope(BaseModel):
    anywhere: bool = False
    places: list[Place] = Field(default_factory=list, max_length=10)
    modes: list[WorkMode] = Field(default_factory=list)  # empty = any mode


class Query(BaseModel):
    scopes: list[Scope] = Field(default_factory=list, max_length=6)
    title_any: list[str] = Field(default_factory=list, max_length=10)
    title_none: list[str] = Field(default_factory=list, max_length=20)
    salary_min: int | None = Field(None, ge=0, le=10_000)  # thousands per year
    salary_currency: str = Field(
        "CHF", pattern=r"^[A-Z]{3}$"
    )  # salaries are converted to this
    salary_unknown: bool = (
        True  # keep postings that don't state a salary (or in an unknown currency)
    )
    posted_within: int | None = Field(None, ge=1, le=24 * 365)  # hours
    job_types: list[JobType] = Field(default_factory=list)  # empty = any
    job_type_unknown: bool = True  # keep postings that don't state their type
    sites: list[Site] = Field(default_factory=list)  # empty = all
    search: str = Field("", max_length=200)

    @field_validator("title_any", "title_none")
    @classmethod
    def clean_phrases(cls, v: list[str]) -> list[str]:
        return list(dict.fromkeys(p.strip().lower() for p in v if p.strip()))

    @property
    def active_sites(self) -> list[Site]:
        return list(self.sites) or list(SITES)


# --------------------------------------------------------------------------- SQL


@dataclass
class Sql:
    text: str
    params: list

    def inline(self) -> str:
        """Human-readable SQL with literals substituted (display only, never executed)."""
        out, it = [], iter(self.params)
        for ch in self.text:
            if ch == "?":
                v = next(it)
                out.append(
                    str(v)
                    if isinstance(v, (int, float))
                    else "'" + str(v).replace("'", "''") + "'"
                )
            else:
                out.append(ch)
        return "".join(out)


def _like_all(column: str, phrase: str) -> Sql:
    words = phrase.split()
    return Sql(
        " AND ".join(f"lower({column}) LIKE ?" for _ in words),
        [f"%{w}%" for w in words],
    )


def title_matches(q: Query, title: str) -> bool:
    """The title filters of `conditions()`, in Python: decides which postings are worth keeping
    before they reach the DB."""
    t = title.lower()

    def has(phrase: str) -> bool:
        return all(w in t for w in phrase.lower().split())

    return (not q.title_any or any(map(has, q.title_any))) and not any(
        map(has, q.title_none)
    )


def _join(parts: list[Sql], op: str) -> Sql:
    if len(parts) == 1:
        return parts[0]
    return Sql(
        f" {op} ".join(f"({p.text})" for p in parts),
        [x for p in parts for x in p.params],
    )


def _in(column: str, values: list) -> Sql:
    return Sql(f"{column} IN ({', '.join('?' * len(values))})", list(values))


def salary_in(currency: str, rates: dict[str, float]) -> Sql:
    """SQL for a posting's salary (top of the range) converted to `currency`.

    NULL when the posting has no salary or its currency isn't in `rates`.
    """
    cases = " ".join("WHEN ? THEN ?" for _ in rates)
    return Sql(
        f"(COALESCE(max_amount, min_amount) * ? / CASE upper(currency) {cases} END)",
        [rates.get(currency, 1.0), *(x for pair in rates.items() for x in pair)],
    )


def conditions(q: Query, rates: dict[str, float] | None = None) -> list[Sql]:
    """WHERE predicates, AND-ed by the caller. Each one is only present if its filter is set."""
    conds: list[Sql] = []

    scope_parts = []
    for s in q.scopes:
        parts = []
        if not s.anywhere and s.places:
            keys = [k for p in s.places for k in p.keys]
            parts.append(
                Sql(
                    f"EXISTS (SELECT 1 FROM hits h WHERE h.url = jobs.url AND h.place IN ({', '.join('?' * len(keys))}))",
                    keys,
                )
            )
        if s.modes:
            parts.append(_in("work_mode", s.modes))
        scope_parts.append(_join(parts, "AND") if parts else Sql("1 = 1", []))
    if scope_parts:
        conds.append(_join(scope_parts, "OR"))

    if q.title_any:
        conds.append(_join([_like_all("title", p) for p in q.title_any], "OR"))
    for p in q.title_none:
        c = _like_all("title", p)
        conds.append(Sql(f"NOT ({c.text})", c.params))

    if q.salary_min is not None:
        amount = salary_in(q.salary_currency, rates or fx.FALLBACK)
        c = Sql(f"{amount.text} >= ?", [*amount.params, q.salary_min * 1000])
        if q.salary_unknown:
            c = Sql(
                f"({c.text}) OR ({amount.text} IS NULL)", [*c.params, *amount.params]
            )
        conds.append(c)

    if q.job_types:
        # Stored as ",fulltime,contract,": match whole tokens.
        c = _join([Sql("job_type LIKE ?", [f"%,{t},%"]) for t in q.job_types], "OR")
        if q.job_type_unknown:
            c = Sql(f"({c.text}) OR (job_type IS NULL)", c.params)
        conds.append(c)

    if q.posted_within:
        cutoff = (date.today() - timedelta(hours=q.posted_within)).isoformat()
        conds.append(Sql("(date_posted IS NULL OR date_posted >= ?)", [cutoff]))

    if q.sites:
        conds.append(_in("site", q.sites))

    if q.search.strip():
        term = f"%{q.search.strip().lower()}%"
        conds.append(
            Sql(
                "(lower(title) LIKE ? OR lower(company) LIKE ? OR lower(description) LIKE ?)",
                [term] * 3,
            )
        )
    return conds


def _wrapped(text: str) -> bool:
    """True if the whole expression is enclosed in one pair of parentheses."""
    if not (text.startswith("(") and text.endswith(")")):
        return False
    depth = 0
    for i, ch in enumerate(text):
        depth += ch == "("
        depth -= ch == ")"
        if depth == 0 and i < len(text) - 1:
            return False
    return True


def where(q: Query, rates: dict[str, float] | None = None) -> Sql:
    conds = conditions(q, rates)
    if not conds:
        return Sql("", [])
    texts = [
        f"({c.text})" if " OR " in c.text and not _wrapped(c.text) else c.text
        for c in conds
    ]
    return Sql("WHERE " + "\n  AND ".join(texts), [x for c in conds for x in c.params])


# --------------------------------------------------------------------------- scrape plan

MAX_QUERIES = 16


@dataclass
class PlannedQuery:
    site: Site
    keyword: str
    place: Place | None  # None = anywhere
    remote_only: bool
    board: BoardPlace | None = None  # resolved once in plan(), reused by the scraper
    job_type: JobType | None = (
        None  # board-side filter (Indeed), when a single type is asked
    )

    @property
    def place_key(self) -> str:
        return self.place.key if self.place else ANYWHERE_KEY

    @property
    def place_label(self) -> str:
        return self.place.label if self.place else "Ovunque"

    @property
    def place_display(self) -> str:
        """Short name stored with each hit, shown in the UI ("trovata con …")."""
        return self.place.city if self.place else "Ovunque"

    def fingerprint(self, hours_old: int | None) -> str:
        """Identity of the board request: same fingerprint, same results (for a while)."""
        parts = [
            self.site,
            self.keyword,
            self.place_key,
            str(int(self.remote_only)),
            str(hours_old or ""),
        ]
        if self.job_type:
            parts.append(self.job_type)
        return "|".join(parts)

    def to_dict(self) -> dict:
        return {
            "site": self.site,
            "keyword": self.keyword,
            "place": self.place_label,
            "remote_only": self.remote_only,
        }


def plan(q: Query) -> tuple[list[PlannedQuery], list[dict], list[str]]:
    """Expand the query into board searches. Returns (queries, skipped, errors)."""
    errors = []
    if not q.scopes:
        errors.append("Aggiungi almeno un filtro «Dove» per sapere dove cercare.")
    if not q.title_any:
        errors.append(
            "Aggiungi almeno una keyword in «Titolo contiene»: è il termine di ricerca sui portali."
        )
    if errors:
        return [], [], errors

    queries: list[PlannedQuery] = []
    skipped: list[dict] = []
    seen = set()
    boards: dict[str, BoardPlace] = {}
    for s in q.scopes:
        # "unknown" means "also keep postings that don't say"; it doesn't widen the board search.
        remote_only = set(s.modes) - {"unknown"} == {"remote"}
        places: list[Place | None] = (
            [None] if s.anywhere or not s.places else list(s.places)
        )
        for place in places:
            board = None
            if place is not None:
                if place.key not in boards:
                    boards[place.key] = place.board()
                board = boards[place.key]
            for kw in q.title_any:
                for site in q.active_sites:
                    # Indeed filters by one type per request; with several we filter locally.
                    one_type = (
                        q.job_types[0]
                        if len(q.job_types) == 1 and site == "indeed"
                        else None
                    )
                    pq = PlannedQuery(site, kw, place, remote_only, board, one_type)
                    ident = (site, kw, pq.place_key, remote_only)
                    if ident in seen:
                        continue
                    seen.add(ident)
                    if site == "indeed" and place is None:
                        skipped.append(
                            {
                                **pq.to_dict(),
                                "reason": "Indeed cerca solo dentro un paese",
                            }
                        )
                        continue
                    if (
                        site == "indeed"
                        and board is not None
                        and not board.indeed_country
                    ):
                        skipped.append(
                            {
                                **pq.to_dict(),
                                "reason": f"Indeed non copre {place.country.upper()}",
                            }
                        )
                        continue
                    queries.append(pq)
    if len(queries) > MAX_QUERIES:
        errors.append(
            f"La query genera {len(queries)} ricerche: il massimo nella POC è {MAX_QUERIES}."
        )
    return queries, skipped, errors
