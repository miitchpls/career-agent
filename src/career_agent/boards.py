"""The job boards, through JobSpy's scrapers, counting every request.

`jobspy.scrape_jobs()` opens the page of every LinkedIn result up front: one more request per
posting, including the ones we would throw away. Here a LinkedIn search reads the list page
(one request, up to 10 postings), then opens a posting's page only if `wants` asks for it, with
a short pause before each one, and stops at the request budget or the first sign of throttling.
Indeed returns descriptions with the list, so a single request is enough.

This drives JobSpy's scraper classes directly and reuses `LinkedIn._fetch_details`, which is
not public API: the dependency is pinned to a minor version in pyproject.toml.
"""

import json
import logging
import random
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from urllib.parse import urlparse

from bs4 import BeautifulSoup
from jobspy.indeed import Indeed
from jobspy.indeed.constant import country_codes as INDEED_COUNTRIES
from jobspy.indeed.constant import headers as INDEED_HEADERS
from jobspy.indeed.constant import job_search_query as INDEED_SEARCH_QUERY
from jobspy.indeed.constant import languages as INDEED_LANGUAGES
from jobspy.indeed.constant import subdomains as INDEED_SUBDOMAINS
from jobspy.linkedin import LinkedIn
from jobspy.linkedin.constant import headers as LINKEDIN_HEADERS
from jobspy.linkedin.util import is_job_remote, parse_location
from jobspy.model import Country, JobPost, Location, ScraperInput
from jobspy.util import RequestsRotating, create_session

from .query import Site

# Outcomes are logged by the scraper; JobSpy's own logs would repeat them.
logging.getLogger("jobspy").setLevel(logging.ERROR)
log = logging.getLogger(__name__)

# 403/429 are the usual throttles; LinkedIn answers 999 to clients it takes for bots.
BLOCKED_STATUS = frozenset({403, 429, 999})
# Where LinkedIn sends anonymous visitors it wants to stop.
_LOGIN_PATHS = ("/authwall", "/login", "/checkpoint", "/uas/login")
DETAIL_PAUSE_SECONDS = (1.5, 4.0)

Row = dict[str, object]


@dataclass
class Result:
    rows: list[Row] = field(default_factory=list)
    """One per posting, with JobSpy's DataFrame columns; salaries annualised."""
    detailed: set[str] = field(default_factory=set)
    """`job_url` of the LinkedIn rows whose page was read (description, type, pay)."""
    requests: int = 0
    """HTTP requests made, redirects included."""
    error: str | None = None
    blocked: bool = False
    """The board throttled us: stop asking it for a while."""


class _Counted:
    """Counts a JobSpy scraper's HTTP requests and spots throttling.

    JobSpy builds its session inside `scrape()`; the property hooks it as it's assigned.
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
    pass


class _Indeed(_Counted, Indeed):
    pass


def to_row(post: JobPost) -> Row:
    row = post.annualised().model_dump()
    if row["date_posted"] is not None:
        row["date_posted"] = row["date_posted"].isoformat()
    return row


def search(
    site: Site,
    args: dict,
    *,
    results: int,
    wants: Callable[[Row], bool],
    wait: Callable[[float], bool],
    max_requests: int | None = None,
) -> Result:
    """One board search.

    `args`: ScraperInput fields (search_term, location, …). `wants(row)`: whether a LinkedIn
    posting is worth opening. `wait(seconds)`: sleeps, True if the run was cancelled meanwhile.
    `max_requests`: LinkedIn budget for this search, list page included.
    """
    scraper_input = ScraperInput.model_validate(
        {
            **args,
            "site_name": [site],
            "results_wanted": results,
            "fetch_description": False,  # LinkedIn pages are opened below, selectively
            "description_format": "markdown",
        }
    )
    scraper = _LinkedIn() if site == "linkedin" else _Indeed()
    posts = scraper.scrape(scraper_input)
    result = Result(error=scraper.error)

    for post in posts:
        row = to_row(post)
        if site == "linkedin" and _may_open(scraper, wants(row), wait, max_requests):
            details = scraper._fetch_details(str(post.id).removeprefix("li-"))
            if details:  # empty when the page couldn't be read
                row = to_row(post.model_copy(update=details))
                result.detailed.add(post.job_url)
        result.rows.append(row)

    result.requests = scraper.requests
    result.blocked = scraper.blocked or "blocked" in (scraper.error or "")
    return result


def _may_open(
    scraper: _Counted,
    wanted: bool,
    wait: Callable[[float], bool],
    max_requests: int | None,
) -> bool:
    if not wanted or scraper.blocked:
        return False
    if max_requests is not None and scraper.requests >= max_requests:
        return False
    return not wait(random.uniform(*DETAIL_PAUSE_SECONDS))


# --- One posting from its link ----------------------------------------------------------------


def open_linkedin(job_id: str) -> Result:
    """A LinkedIn posting read from its own page: one request (more only on redirects).

    Title, company, place and date come from the page's JobPosting data (JSON-LD), or its top
    card when that's missing; description, type and pay from JobSpy's own parsing of the same
    page, so a posting opened from a link is stored exactly like one found by a search.
    `rows` is empty when the page isn't a readable posting (removed, or a login wall).
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
