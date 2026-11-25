"""Paced board searches on top of JobSpy, feeding the in-memory results (feed.py).

A Query is expanded into planned searches (site × place × keyword). A run reads one list page
of each: the first, or with "more" the next one. Requests go strictly one after another, the
searches of the two boards taking turns; before each one the run waits until that board's last
request is a few seconds old, so a board never sees a burst. Postings outside the searched
country or with a title that can't match are dropped; the other filters apply to what's kept.

Guards against blocks:
  - a search is one request per page; a posting's own page is read only when it's opened;
  - a page read recently comes from the cache (feed.py), not the board;
  - every request counts against rolling budgets: per day, and on LinkedIn per hour too;
  - a board that throttles us is paused (persisted, so a restart doesn't reset it), longer each
    time it happens again within a day.
"""

import contextvars
import logging
import random
import re
import threading
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from itertools import zip_longest
from typing import Literal

from . import boards, db, feed
from .boards import Order
from .i18n import t
from .query import PlannedQuery, Query, Site, plan, title_matches

log = logging.getLogger(__name__)

SITE_NAME: dict[Site, str] = {"linkedin": "LinkedIn", "indeed": "Indeed"}

# Before each request, the time since the board's last one: LinkedIn at most ~12 a minute,
# under the ~20 a minute reported to trip it (and the pause JobSpy keeps between its pages).
REQUEST_PAUSE: dict[Site, tuple[float, float]] = {
    "linkedin": (3.0, 7.0),
    "indeed": (2.0, 4.0),
}
# Requests per board in any 24 hours (list pages and posting pages). Conservative: the
# community reports LinkedIn throttling a single IP after ~100 results in a burst.
DAILY_REQUESTS: dict[Site, int] = {"linkedin": 150, "indeed": 100}
# LinkedIn's limits are about bursts: the daily budget alone would let 150 go out in minutes.
HOURLY_REQUESTS: dict[Site, int] = {"linkedin": 70}
# A pause after each sign of throttling; a new one within a day of the last takes the next step.
BLOCK_PAUSES = (timedelta(minutes=45), timedelta(hours=6), timedelta(hours=24))
STRIKE_MEMORY = timedelta(hours=24)
SECONDS_PER_PAGE: dict[Site, int] = {
    "linkedin": 7,
    "indeed": 5,
}  # rough ETA, pause included

# Order matters: "hybrid" texts often also contain "remote", so test it first.
_MODE_PATTERNS = [
    (
        "hybrid",
        r"\bhybrid\b|\bibrid[oa]\b|smart[ -]?working|lavoro agile|\d\s*giorni? (in sede|in ufficio)",
    ),
    (
        "remote",
        r"full[ -]?remote|fully remote|100\s?% remot|\bremote\b|\bremot[oa]\b|da remoto|telelavoro|work from home",
    ),
    ("onsite", r"\bon[ -]?site\b|in sede|in presenza|in ufficio|\boffice[- ]based\b"),
]


def classify_work_mode(
    title: str, location: str, description: str, is_remote: bool
) -> str:
    # Title and location are explicit signals; the description is noisier.
    for text in (f"{title} {location}", description):
        text = text.lower()
        for mode, pattern in _MODE_PATTERNS:
            if re.search(pattern, text):
                return mode
    return "remote" if is_remote else "unknown"


def _board_args(pq: PlannedQuery, hours_old: int | None) -> dict:
    """ScraperInput fields for one planned search."""
    keyword = pq.keyword
    if pq.board is None:
        location, country = "Worldwide", "usa"
    else:
        b = pq.board
        # LinkedIn geocodes bare names loosely ("Milano" -> Milano, Texas): give it city, region, country.
        location = b.linkedin if pq.site == "linkedin" else b.city
        country = b.indeed_country or "usa"
    if pq.remote_only and pq.site == "linkedin":
        keyword += " remote"  # the guest API ignores work-type filters
    return {
        "search_term": keyword,
        "location": location,
        "country_indeed": country,
        "is_remote": pq.remote_only and pq.site == "indeed",
        "job_type": pq.job_type,
        "hours_old": hours_old,
    }


# JobSpy job types -> ours; "other" and unknown values are dropped.
_JOB_TYPES = {
    "fulltime": "fulltime",
    "parttime": "parttime",
    "contract": "contract",
    "temporary": "contract",
    "perdiem": "contract",
    "internship": "internship",
    "volunteer": "volunteer",
}


def normalize_job_type(value: object) -> str | None:
    """JobSpy's "fulltime, contract" -> ",fulltime,contract," (None if nothing usable)."""
    if not value:
        return None
    types = dict.fromkeys(
        _JOB_TYPES[t]
        for t in (p.strip().lower() for p in str(value).split(","))
        if t in _JOB_TYPES
    )
    return f",{','.join(types)}," if types else None


def _in_country(pq: PlannedQuery, location: str) -> bool:
    if pq.board is None or pq.site != "linkedin":
        return True  # Indeed searches are already scoped to the country's domain
    return pq.board.matches(location)


def job_row(site: Site, row: boards.Row) -> dict:
    """A board row as a `jobs` row (db.JOB_COLUMNS)."""
    title = str(row["title"] or "")
    location = str(row["location"] or "")
    description = str(row["description"] or "")
    return {
        "url": row["job_url"],
        "site": site,
        "title": title,
        "company": row["company"],
        "location": location,
        "work_mode": classify_work_mode(
            title, location, description, bool(row["is_remote"])
        ),
        "job_type": normalize_job_type(row["job_type"]),
        "date_posted": row["date_posted"],
        "min_amount": row["min_amount"],
        "max_amount": row["max_amount"],
        "currency": row["currency"],
        "description": description,
    }


def _local_time(t: datetime) -> str:
    return t.astimezone().strftime("%H:%M")


def paused_message(site: Site, until: datetime) -> str:
    return t("paused", site=SITE_NAME[site], time=_local_time(until))


def _budgets(site: Site) -> list[tuple[str, int, timedelta]]:
    """(message key, requests, window) of each budget `site` has."""
    budgets = []
    if site in DAILY_REQUESTS:
        budgets.append(("budget", DAILY_REQUESTS[site], timedelta(hours=24)))
    if site in HOURLY_REQUESTS:
        budgets.append(("budget_hour", HOURLY_REQUESTS[site], timedelta(hours=1)))
    return budgets


def board_state(site: Site) -> tuple[int | None, str | None]:
    """Requests `site` may still get under all its rolling budgets (None: no budget), and
    why it must be left alone right now (for the UI; None if it may be asked)."""
    now = datetime.now(UTC)
    used = [
        (key, n, db.requests_since(site, now - window))
        for key, n, window in _budgets(site)
    ]
    left = min((max(n - u, 0) for _, n, u in used), default=None)
    until = db.board_paused_until(site)
    if until:
        return left, paused_message(site, until)
    spent = (t(key, n=n, site=SITE_NAME[site]) for key, n, u in used if u >= n)
    return left, next(spent, None)


def requests_left(site: Site) -> int | None:
    return board_state(site)[0]


def hold_reason(site: Site) -> str | None:
    return board_state(site)[1]


def block(site: Site) -> datetime:
    """Pause `site` after a sign of throttling; returns when the pause ends.

    A block soon after the last pause means the board still distrusts us: wait longer.
    """
    now = datetime.now(UTC)
    last = db.last_pause(site)
    strikes = last[1] + 1 if last and now - last[0] < STRIKE_MEMORY else 1
    until = now + BLOCK_PAUSES[min(strikes, len(BLOCK_PAUSES)) - 1]
    db.pause_board(site, until, strikes)
    return until


Phase = Literal["idle", "searching", "pausing", "done", "cancelled"]
StepStatus = Literal["pending", "running", "done", "error", "recent", "skipped"]


@dataclass
class Step:
    """One board search, as shown to the user."""

    site: Site
    keyword: str
    place: str  # display name: "Basel", "Ovunque"
    status: StepStatus = "pending"
    found: int = 0  # on the page read and matching the query (title, country)
    new: int = 0  # of those, never opened
    abroad: int = 0  # discarded: outside the searched country
    off_title: int = 0  # discarded: the title can't match the query
    error: str | None = (
        None  # user-facing, in the UI's language: why it failed or was skipped
    )
    note: str | None = None  # user-facing caveat on a "done" step
    ran_at: str | None = None  # for "recent": when its cached first page was read


@dataclass
class RunState:
    """Polled by the UI (~1.5s) while running: structured, so it can phrase progress."""

    running: bool = False
    started: str | None = None
    finished: str | None = None
    phase: Phase = "idle"
    current: int | None = None  # index into steps
    pause_seconds: int | None = None  # length of the current pause
    steps: list[Step] = field(default_factory=list)
    found: int = 0
    new: int = 0

    @property
    def done_steps(self) -> int:
        return sum(st.status in ("done", "error") for st in self.steps)

    @property
    def total_steps(self) -> int:
        """Searches this run actually makes (cached and held ones are only listed)."""
        return sum(st.status not in ("recent", "skipped") for st in self.steps)


# When each board was last asked (monotonic), by a search or by opening a posting.
_last_request: dict[Site, float] = {}
# Held while waiting for a board's turn and asking it: a run and postings being opened at the
# same time take turns instead of all reading the same `_last_request`.
_board_locks: dict[Site, threading.Lock] = {
    site: threading.Lock() for site in SITE_NAME
}


def board_lock(site: Site) -> threading.Lock:
    return _board_locks[site]


def turn_wait(site: Site) -> float:
    """Seconds to wait before `site` may be asked again: its pause since the last request."""
    last = _last_request.get(site)
    if last is None:
        return 0.0
    return max(last + random.uniform(*REQUEST_PAUSE[site]) - time.monotonic(), 0.0)


def asked(site: Site) -> None:
    _last_request[site] = time.monotonic()


def _friendly_error(message: str) -> str:
    m = message.lower()
    if "429" in m or "too many" in m or "blocked" in m or "rate" in m:
        return t("throttled")
    if "timed out" in m or "timeout" in m:
        return t("timeout")
    return t("board_error")


def _taking_turns(queries: list[PlannedQuery]) -> list[PlannedQuery]:
    """LinkedIn, Indeed, LinkedIn…: a board's pause passes while the other one is asked."""
    by_site = [[pq for pq in queries if pq.site == site] for site in SITE_NAME]
    return [pq for turn in zip_longest(*by_site) for pq in turn if pq]


@dataclass
class _Todo:
    index: int  # into state.steps
    pq: PlannedQuery
    key: str  # feed.key
    start: boards.Cursor  # None: the first page


class Runner:
    def __init__(self) -> None:
        self.state = RunState()
        self._cancel = threading.Event()
        self._lock = threading.Lock()

    def start(
        self,
        q: Query,
        order: Order = "relevant",
        *,
        more: bool = False,
        force: bool = False,
    ) -> dict:
        """Plan and start a run in the background. Returns a summary for the UI.

        Reads each search's first page, unless it's cached. `more`: the next page of each
        search instead; if one of them is no longer fresh, the whole query is read again from
        its first pages (a lone new first page would reshuffle what's shown). `force`: read
        the first pages again even when cached («Aggiorna»); budgets and pauses still apply.
        """
        if self.state.running:  # fail fast, before plan() possibly hits the geocoder
            raise RuntimeError(t("busy"))
        queries, skipped, errors = plan(q)
        if errors:
            raise ValueError(" ".join(errors))
        if not queries:
            raise ValueError(t("nothing_to_run"))

        if more and any(feed.get(feed.key(pq, q, order)) is None for pq in queries):
            log.info(
                "show more over an expired search: reading the query from the start"
            )
            more, force = False, True
        holds = {site: hold_reason(site) for site in {pq.site for pq in queries}}
        steps, todo = [], []
        for pq in _taking_turns(queries):
            k = feed.key(pq, q, order)
            stream = None if force else feed.get(k)
            if more and stream and stream.next is None:
                continue  # that search has no more pages
            step = Step(pq.site, pq.keyword, pq.place_display)
            if stream and not more:
                step.status, step.ran_at = "recent", stream.started.isoformat()
            elif holds[pq.site]:
                step.status, step.error = "skipped", holds[pq.site]
            else:
                start = stream.next if more and stream else None
                todo.append(_Todo(len(steps), pq, k, start))
            steps.append(step)
        summary = {
            "queries": len(todo),
            "recent": sum(st.status == "recent" for st in steps),
            "held": sum(st.status == "skipped" for st in steps),
            "held_reasons": sorted(
                {st.error for st in steps if st.status == "skipped"}
            ),
            "skipped": len(skipped),
            "skip_reasons": sorted({s["reason"] for s in skipped}),
            "eta_seconds": 0,
        }
        if (
            not todo
        ):  # everything is cached, finished or on hold: nothing to ask the boards
            return summary

        with self._lock:
            if self.state.running:
                raise RuntimeError(t("busy"))
            self._cancel.clear()
            self.state = RunState(
                running=True,
                started=datetime.now().isoformat(timespec="seconds"),
                phase="searching",
                steps=steps,
            )
        # The thread keeps this request's context, so its messages stay in the user's language.
        ctx = contextvars.copy_context()
        threading.Thread(
            target=ctx.run, args=(self._run, todo, q, order), daemon=True
        ).start()
        summary["eta_seconds"] = sum(SECONDS_PER_PAGE[td.pq.site] for td in todo)
        return summary

    def cancel(self) -> None:
        self._cancel.set()

    def _wait_for(self, site: Site) -> bool:
        """Wait until `site`'s last request is a pause old. True if the run was cancelled."""
        left = turn_wait(site)
        if left <= 0:
            return False
        self.state.phase, self.state.pause_seconds = "pausing", round(left)
        return self._cancel.wait(left)

    def _run(self, todo: list[_Todo], q: Query, order: Order) -> None:
        s = self.state
        try:
            for td in todo:
                if self._cancel.is_set():
                    break
                step = s.steps[td.index]
                with board_lock(td.pq.site):
                    # A board can go on hold mid-run: it throttled us (here, or while a
                    # posting was being opened), or a budget ran out.
                    if reason := hold_reason(td.pq.site):
                        step.status, step.error = "skipped", reason
                        continue
                    if self._wait_for(td.pq.site):
                        break
                    s.phase, s.current, s.pause_seconds = "searching", td.index, None
                    step.status = "running"
                    self._search(td, step, q, order)
                    asked(td.pq.site)
                s.found += step.found
                s.new += step.new
            s.phase = "cancelled" if self._cancel.is_set() else "done"
        except Exception:
            log.exception("run crashed")
            s.phase = "done"
            raise
        finally:
            s.running = False
            s.current = None
            s.finished = datetime.now().isoformat(timespec="seconds")

    def _search(self, td: _Todo, step: Step, q: Query, order: Order) -> None:
        """One list page: fills `step` and adds what it finds to the cache."""
        pq = td.pq
        tag = (
            f"[{pq.site}] {pq.keyword!r} @ {pq.place_label} ({order}, from {td.start})"
        )
        t0 = time.monotonic()
        try:
            result = boards.page(
                pq.site, _board_args(pq, q.posted_within), order, td.start
            )
        except Exception as e:  # noqa: BLE001 - one board failing must not end the run
            log.warning("%s failed: %s", tag, e)
            step.status, step.error = "error", _friendly_error(str(e))
            return
        db.record_requests(pq.site, result.requests)
        if result.error:
            log.warning("%s board error: %s", tag, result.error)

        # Kept whatever the title: the cache is shared by every query with this search, and
        # their title filters differ (the view applies each one's).
        jobs = []
        for row in result.rows:
            if _in_country(pq, str(row["location"] or "")):
                jobs.append(job_row(pq.site, row))
            else:
                step.abroad += 1
        shown = [j for j in jobs if title_matches(q, str(j["title"] or ""))]
        step.off_title = len(jobs) - len(shown)
        step.found = len(shown)
        step.new = step.found - db.count_opened([j["url"] for j in shown])
        failed = result.blocked or (result.error and not result.rows)
        added = failed or feed.add_page(
            td.key, pq, order, jobs, result.detailed, result.next, td.start is None
        )

        if not added:  # its search was dropped meanwhile: the page has nowhere to go
            step.status, step.error = "error", t("expired")
        elif result.blocked:
            until = block(pq.site)
            step.status, step.error = "error", paused_message(pq.site, until)
        elif result.error and not result.rows:
            step.status, step.error = "error", _friendly_error(result.error)
        else:
            step.status = "done"
        log.info(
            "%s: %d found, %d new, %d abroad, %d off-title, %d requests in %.0fs%s",
            tag,
            step.found,
            step.new,
            step.abroad,
            step.off_title,
            result.requests,
            time.monotonic() - t0,
            " (blocked)" if result.blocked else "",
        )
