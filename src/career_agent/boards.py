"""The job boards, through JobSpy's scrapers, counting every request.

A search reads one list page per call: one request, nothing else. `jobspy.scrape_jobs()` would
loop over pages and open every LinkedIn posting up front; here the caller asks for each page
(the user's "show more"), and a posting's own page is read only when the user opens it
(`open_linkedin`). Indeed returns descriptions with the list, so an Indeed posting needs no
second request at all.

Both boards are asked by relevance or newest first. Indeed's app API isn't documented: if it
refuses the date sort, the same page is asked by relevance and the date sort dropped until a
restart.

This drives JobSpy's scraper classes directly and reuses their parsers (`_process_job`,
`_fetch_details`, `_build_query`…), which are not public API: the dependency is pinned to a
minor version in pyproject.toml.
"""

import json
import logging
import time
from dataclasses import dataclass, field
from datetime import date
from typing import Literal
from urllib.parse import urlparse

from bs4 import BeautifulSoup
from jobspy.indeed import Indeed
from jobspy.indeed.constant import country_codes as INDEED_COUNTRIES
from jobspy.indeed.constant import headers as INDEED_HEADERS
from jobspy.indeed.constant import job_search_query as INDEED_SEARCH_QUERY
from jobspy.indeed.constant import jobs_per_page as JOBSPY_INDEED_PAGE
from jobspy.indeed.constant import languages as INDEED_LANGUAGES
from jobspy.indeed.constant import subdomains as INDEED_SUBDOMAINS
from jobspy.indeed.model import JobSearch
from jobspy.linkedin import LinkedIn
from jobspy.linkedin.constant import empty_page as LINKEDIN_EMPTY_PAGE
from jobspy.linkedin.constant import headers as LINKEDIN_HEADERS
from jobspy.linkedin.constant import max_results as LINKEDIN_MAX_RESULTS
from jobspy.linkedin.util import is_job_remote, parse_location
from jobspy.model import Country, JobPost, Location, ScraperInput
from jobspy.util import RequestsRotating, check_status, create_session

from .query import Site

# Outcomes are logged by the scraper; JobSpy's own logs would repeat them.
logging.getLogger("jobspy").setLevel(logging.ERROR)
log = logging.getLogger(__name__)

Order = Literal["relevant", "recent"]

# 403/429 are the usual throttles; LinkedIn answers 999 to clients it takes for bots.
BLOCKED_STATUS = frozenset({403, 429, 999})
# Where LinkedIn sends anonymous visitors it wants to stop.
_LOGIN_PATHS = ("/authwall", "/login", "/checkpoint", "/uas/login")
LINKEDIN_PAGE = 10  # postings on a LinkedIn list page (fixed by LinkedIn)
# Postings asked per Indeed page. One request could bring 100, but then one Indeed page would
# bury LinkedIn's 10 in the merged list; 25 keeps the boards side by side.
INDEED_PAGE = 25
# Posting pages that answer 200 without the posting: a throttle that doesn't say so. One can
# be a removed posting; two in a row within half an hour count as a block.
EMPTY_PAGES_BLOCK = 2
EMPTY_PAGES_WINDOW = 30 * 60  # seconds
_empty_pages: list[
    float
] = []  # monotonic times of the text-less pages since the last good one

Row = dict[str, object]
Cursor = int | str | None
"""Where the next list page starts: LinkedIn's offset, Indeed's cursor; None = no more."""


@dataclass
class Result:
    rows: list[Row] = field(default_factory=list)
    """One per posting, with JobSpy's DataFrame columns; salaries annualised."""
    detailed: set[str] = field(default_factory=set)
    """`job_url` of the rows read with their description (Indeed rows, opened postings)."""
    requests: int = 0
    """HTTP requests made, redirects included."""
    error: str | None = None
    blocked: bool = False
    """The board throttled us: stop asking it for a while."""
    next: Cursor = None
    """Where the following list page starts (search pages only)."""


class _Counted:
    """Counts a JobSpy scraper's HTTP requests and spots throttling.

    The property hooks every session as it's assigned, JobSpy's or ours.
    """

    def __init__(self) -> None:
        super().__init__()
        self.requests = 0
        self.blocked = False

    @property
    def session(self):
        return self._session

    @session.setter
    def session(self, value) -> None:
        value.hooks["response"].append(self._on_response)
        self._session = value

    def _on_response(self, response, **_) -> None:
        self.requests += 1
        if response.status_code in BLOCKED_STATUS or urlparse(
            response.url
        ).path.startswith(_LOGIN_PATHS):
            self.blocked = True


class _LinkedIn(_Counted, LinkedIn):
    order: Order = "relevant"

    def _search_params(self) -> dict[str, str | int]:
        # LinkedIn's two sort buttons: "Most relevant" (R) and "Most recent" (DD).
        sort = "DD" if self.order == "recent" else "R"
        return {**super()._search_params(), "sortBy": sort}


# Whether Indeed takes "sort: DATE" isn't documented: if a page by date fails and the same page
# by relevance works, the date sort is dropped until a restart.
_indeed_by_date = True


class _Indeed(_Counted, Indeed):
    by_date = False

    def _build_query(self, filters: str, cursor: str | None) -> str:
        query = (
            super()
            ._build_query(filters, cursor)
            .replace(f"limit: {JOBSPY_INDEED_PAGE}", f"limit: {INDEED_PAGE}", 1)
        )
        return query.replace("sort: RELEVANCE", "sort: DATE") if self.by_date else query


def to_row(post: JobPost) -> Row:
    row = post.annualised().model_dump()
    if row["date_posted"] is not None:
        row["date_posted"] = row["date_posted"].isoformat()
    return row


def _input(site: Site, args: dict) -> ScraperInput:
    return ScraperInput.model_validate(
        {
            **args,
            "site_name": [site],
            "fetch_description": False,  # a LinkedIn posting is read when it's opened
            "description_format": "markdown",
        }
    )


def page(site: Site, args: dict, order: Order, start: Cursor) -> Result:
    """One list page of a board search: exactly one request (two if Indeed refuses the date
    sort). `args`: ScraperInput fields (search_term, location, …). `start`: None for the first
    page, else the `next` of the page before."""
    scraper = _LinkedIn() if site == "linkedin" else _Indeed()
    scraper.scraper_input = _input(site, args)
    result = Result()
    try:
        if site == "linkedin":
            scraper.order = order
            posts, result.next = _linkedin_page(scraper, int(start or 0))
        else:
            posts, result.next = _indeed_page(scraper, order, start)
        result.rows = [to_row(p) for p in posts]
    except Exception as e:  # noqa: BLE001 - a board failure must still count its requests
        log.warning("%s page failed: %s", site, e)
        result.error = str(e)
    if site == "indeed":
        result.detailed = {str(r["job_url"]) for r in result.rows}
    result.requests = scraper.requests
    result.blocked = scraper.blocked or "blocked" in (result.error or "")
    return result


def _linkedin_page(scraper: _LinkedIn, start: int) -> tuple[list[JobPost], Cursor]:
    scraper.session = create_session(
        RequestsRotating(None, clear_cookies=True),
        scraper.scraper_input,
        LINKEDIN_HEADERS,
    )
    response = scraper.session.get(
        f"{scraper.base_url}/jobs-guest/jobs/api/seeMoreJobPostings/search",
        params={**scraper._search_params(), "start": start},
    )
    check_status(response)
    cards = BeautifulSoup(response.text, "html.parser").find_all(
        class_="base-search-card"
    )
    if not cards:
        if response.text.strip() != LINKEDIN_EMPTY_PAGE:
            raise ValueError("unexpected page with no jobs (blocked?)")
        return [], None  # the end of the results
    posts = []
    for card in cards:
        job_id = str(card.get("data-entity-urn", "")).split(":")[-1]
        if not job_id:
            continue
        try:
            posts.append(scraper._process_job(card, job_id))
        except Exception as e:  # noqa: BLE001 - one odd card shouldn't lose the page
            log.warning("linkedin card %s skipped: %s", job_id, e)
    following = start + LINKEDIN_PAGE
    full = len(cards) >= LINKEDIN_PAGE and following < LINKEDIN_MAX_RESULTS
    return posts, following if full else None


def _empty_page_is_a_block() -> bool:
    now = time.monotonic()
    _empty_pages[:] = [t for t in _empty_pages if now - t < EMPTY_PAGES_WINDOW] + [now]
    if len(_empty_pages) < EMPTY_PAGES_BLOCK:
        return False
    _empty_pages.clear()  # the pause takes it from here
    return True


class _Refused(ValueError):
    """Indeed rejected the query itself (HTTP 400, or errors and no data): not an outage."""


INDEED_RETRY_PAUSE = 2.0  # before asking the same page by relevance


def _indeed_page(
    scraper: _Indeed, order: Order, cursor: Cursor
) -> tuple[list[JobPost], Cursor]:
    """Only a first page that Indeed refuses by date is asked again by relevance: an outage
    says nothing about the sort. A later page is asked the way its search's first page was:
    the cursor says so ("date:…" / "relevance:…"), since a cursor belongs to one sort's list."""
    global _indeed_by_date
    if cursor:
        sort, _, raw = str(cursor).partition(":")
        return _indeed_ask(scraper, sort == "date", raw)
    by_date = order == "recent" and _indeed_by_date
    try:
        return _indeed_ask(scraper, by_date, None)
    except _Refused as e:
        if not by_date or scraper.blocked:
            raise
        log.warning("indeed refused the date sort (%s): asking by relevance", e)
    time.sleep(INDEED_RETRY_PAUSE)
    posts = _indeed_ask(scraper, False, None)
    log.warning("indeed refuses the date sort: asking by relevance from now on")
    _indeed_by_date = False
    return posts


def _indeed_ask(
    scraper: _Indeed, by_date: bool, cursor: Cursor
) -> tuple[list[JobPost], Cursor]:
    inp = scraper.scraper_input
    code = INDEED_COUNTRIES[inp.country_indeed]
    domain = INDEED_SUBDOMAINS.get(inp.country_indeed, code.lower())
    scraper.base_url = f"https://{domain}.indeed.com"
    scraper.session = create_session(
        RequestsRotating(None),
        inp,
        INDEED_HEADERS
        | {
            "indeed-co": code,
            "indeed-locale": f"{INDEED_LANGUAGES.get(code, 'en')}-{code}",
        },
    )
    scraper.by_date = by_date
    query = scraper._build_query(
        scraper._build_filters(), str(cursor) if cursor else None
    )
    response = scraper.session.post(Indeed.api_url, json={"query": query})
    if response.status_code == 400:
        raise _Refused("response status code 400")
    check_status(response)
    data = response.json()
    found = (data.get("data") or {}).get("jobSearch")
    if not found:
        error = f"API error: {data.get('errors')}"
        raise _Refused(error) if data.get("errors") else ValueError(error)
    search = JobSearch.model_validate(found)
    posts = []
    for r in search.results:
        if not r.job:
            continue
        try:
            posts.append(scraper._process_job(r.job))
        except Exception as e:  # noqa: BLE001 - one odd posting shouldn't lose the page
            log.warning("indeed posting skipped: %s", e)
    following = search.nextCursor if search.results else None
    sort = "date" if by_date else "relevance"
    return posts, f"{sort}:{following}" if following else None


# --- One posting from its link ----------------------------------------------------------------


def open_linkedin(job_id: str) -> Result:
    """A LinkedIn posting read from its own page: one request (more only on redirects).

    Title, company, place and date come from the page's JobPosting data (JSON-LD), or its top
    card when that's missing; description, type and pay from JobSpy's own parsing of the same
    page, so a posting opened from a link is stored exactly like one found by a search.
    `rows` is empty when the page isn't a readable posting (removed, or a login wall). A page
    that loads without the posting's text is no posting either; two of those in a row are a
    block, since that's how LinkedIn throttles without saying so.
    """
    scraper = _LinkedIn()
    scraper.scraper_input = ScraperInput(
        site_name=["linkedin"], description_format="markdown"
    )
    scraper.session = create_session(
        RequestsRotating(None, clear_cookies=True),
        scraper.scraper_input,
        LINKEDIN_HEADERS,
    )
    url = f"{scraper.base_url}/jobs/view/{job_id}"
    result = Result()
    try:
        response = scraper.session.get(url)
    except Exception as e:  # noqa: BLE001 - network failures are reported, never raised
        result.error = str(e)
    else:
        if scraper.blocked or response.status_code != 200:
            log.warning(
                "linkedin posting %s: HTTP %s, ended at %s",
                job_id,
                response.status_code,
                urlparse(response.url).path,
            )
        top = (
            _top_card(response.text)
            if response.status_code == 200
            and urlparse(response.url).path.startswith("/jobs/view/")
            else None
        )
        if top:
            # JobSpy's parser asks for the same page again: hand it the one we have.
            fetch = scraper.session.get
            scraper.session.get = lambda u, *a, **k: (
                response if u == url else fetch(u, *a, **k)
            )
            details = scraper._fetch_details(job_id)
            if not details.get("description"):
                log.warning("linkedin posting %s: page without its text", job_id)
                result.requests = scraper.requests
                result.blocked = scraper.blocked or _empty_page_is_a_block()
                return result
            _empty_pages.clear()
            location = top["location"]
            post = JobPost(
                id=f"li-{job_id}",
                title=top["title"],
                company=top["company"],
                location=location,
                is_remote=is_job_remote(top["title"], location),
                date_posted=top["date_posted"],
                job_url=url,
            ).model_copy(update=details)
            result.rows.append(to_row(post))
            result.detailed.add(url)
    result.requests = scraper.requests
    result.blocked = scraper.blocked
    return result


def _top_card(page: str) -> dict | None:
    """Title, company, place and posting date of a LinkedIn job page; None without a title."""
    soup = BeautifulSoup(page, "html.parser")
    ld = _job_posting_ld(soup)

    def text(selector: str) -> str | None:
        tag = soup.select_one(selector)
        return tag.get_text(" ", strip=True) if tag else None

    title = ld.get("title") or text(
        "h1.top-card-layout__title, h1.topcard__title, h2.top-card-layout__title"
    )
    if not title:
        return None
    org = ld.get("hiringOrganization")
    company = (org.get("name") if isinstance(org, dict) else None) or text(
        "a.topcard__org-name-link, span.topcard__flavor a"
    )
    place = text("span.topcard__flavor--bullet") or _ld_place(ld)
    try:
        posted = date.fromisoformat(str(ld.get("datePosted", ""))[:10])
    except ValueError:
        posted = None
    return {
        "title": title,
        "company": company,
        "location": parse_location(place) if place else Location(),
        "date_posted": posted,
    }


def _job_posting_ld(soup: BeautifulSoup) -> dict:
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
        except ValueError:
            continue
        for item in data if isinstance(data, list) else [data]:
            if isinstance(item, dict) and item.get("@type") == "JobPosting":
                return item
    return {}


def _ld_place(ld: dict) -> str | None:
    where = ld.get("jobLocation")
    where = where[0] if isinstance(where, list) and where else where
    address = where.get("address") if isinstance(where, dict) else None
    if not isinstance(address, dict):
        return None
    parts = [
        address.get(k) for k in ("addressLocality", "addressRegion", "addressCountry")
    ]
    return ", ".join(str(p) for p in parts if p) or None


def indeed_country(host: str) -> Country | None:
    """The country an Indeed domain serves: it.indeed.com is Italy, www (or none) the US."""
    host = host.lower()
    if host == "indeed.com":
        return Country.USA
    for country, code in INDEED_COUNTRIES.items():
        if host == f"{INDEED_SUBDOMAINS.get(country, code.lower())}.indeed.com":
            return country
    return None


def _indeed_job_fields() -> str:
    """The `job { ... }` selection of JobSpy's search query, so a posting opened by its key
    carries exactly the fields JobSpy's parser reads."""
    query = INDEED_SEARCH_QUERY.replace("{{", "{").replace("}}", "}")
    start = query.index("job {")
    depth = 0
    for i in range(start, len(query)):
        depth += {"{": 1, "}": -1}.get(query[i], 0)
        if query[i] == "}" and depth == 0:
            return query[start : i + 1]
    raise ValueError("unexpected JobSpy query layout")


# Indeed's app API reads postings by key with `jobData`; its argument has had two shapes.
_INDEED_BY_KEY = (
    'query GetJob {{ jobData(input: {{jobKeys: ["{key}"]}}) {{ results {{ {fields} }} }} }}',
    'query GetJob {{ jobData(jobKeys: ["{key}"]) {{ results {{ {fields} }} }} }}',
)


def open_indeed(host: str, key: str) -> Result:
    """An Indeed posting read by its key through the app API JobSpy searches with (the web
    pages sit behind a bot check). One request, two if the API wants the other query shape.
    `rows` is empty when Indeed doesn't return the posting (expired, or a wrong key)."""
    country = indeed_country(host)
    result = Result()
    if country is None:
        result.error = f"unknown Indeed domain {host}"
        return result
    code = INDEED_COUNTRIES[country]
    scraper = _Indeed()
    scraper.scraper_input = ScraperInput(
        site_name=["indeed"], country_indeed=country, description_format="markdown"
    )
    scraper.base_url = (
        f"https://{INDEED_SUBDOMAINS.get(country, code.lower())}.indeed.com"
    )
    scraper.session = create_session(
        RequestsRotating(None),
        scraper.scraper_input,
        INDEED_HEADERS
        | {
            "indeed-co": code,
            "indeed-locale": f"{INDEED_LANGUAGES.get(code, 'en')}-{code}",
        },
    )
    fields = _indeed_job_fields()
    for shape in _INDEED_BY_KEY:
        try:
            response = scraper.session.post(
                Indeed.api_url, json={"query": shape.format(key=key, fields=fields)}
            )
            data = response.json() if response.status_code == 200 else {}
        except Exception as e:  # noqa: BLE001 - network failures are reported, never raised
            result.error = str(e)
            break
        if scraper.blocked or response.status_code != 200:
            log.warning("indeed posting %s: HTTP %s", key, response.status_code)
        if response.status_code != 200 and not scraper.blocked:
            # Down or erroring: the board didn't answer, which says nothing about the posting.
            result.error = f"HTTP {response.status_code}"
            break
        found = (data.get("data") or {}).get("jobData")
        if found is None and data.get("errors") and not scraper.blocked:
            result.error = str(data["errors"])[:300]
            continue  # the other shape of the query
        result.error = None
        jobs = [
            r.get("job") for r in (found or {}).get("results") or [] if r.get("job")
        ]
        if jobs:
            try:
                result.rows.append(to_row(scraper._process_job(jobs[0])))
            except Exception as e:  # noqa: BLE001 - an answer JobSpy can't parse is unreadable
                result.error = f"unreadable posting: {e}"[:300]
        break
    result.requests = scraper.requests
    result.blocked = scraper.blocked
    return result
