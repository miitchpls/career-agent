"""The job boards, through JobSpy's scrapers, counting every request.

`jobspy.scrape_jobs()` opens the page of every LinkedIn result up front: one more request per
posting, including the ones we would throw away. Here a LinkedIn search reads the list page
(one request, up to 10 postings), then opens a posting's page only if `wants` asks for it, with
a short pause before each one, and stops at the request budget or the first sign of throttling.
Indeed returns descriptions with the list, so a single request is enough.

This drives JobSpy's scraper classes directly and reuses `LinkedIn._fetch_details`, which is
not public API: the dependency is pinned to a minor version in pyproject.toml.
"""

import logging
import random
from collections.abc import Callable
from dataclasses import dataclass, field
from urllib.parse import urlparse

from jobspy.indeed import Indeed
from jobspy.linkedin import LinkedIn
from jobspy.model import JobPost, ScraperInput

from .query import Site

# Outcomes are logged by the scraper; JobSpy's own logs would repeat them.
logging.getLogger("jobspy").setLevel(logging.ERROR)

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
