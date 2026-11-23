"""Paced job search on top of JobSpy.

A Query is expanded into planned searches (site × place × keyword). They run strictly
one after another with a random pause in between, so we never burst requests at a
job board. Postings that can't match the query (title, country) are dropped; the rest
are stored, and the other filters apply later in SQL.

Guards against blocks:
  - LinkedIn: one list page per search; a posting's page is opened only when it's new and
    can match (boards.py), and every request counts against a rolling daily budget;
  - a board that throttles us is paused for a while (persisted, so a restart doesn't reset it);
  - an identical search that succeeded in the last hours isn't repeated.
"""

import contextvars
import logging
import random
import re
import threading
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Literal

from . import boards, db
from .i18n import t
from .query import PlannedQuery, Query, Site, plan, title_matches

log = logging.getLogger(__name__)

SITE_NAME: dict[Site, str] = {"linkedin": "LinkedIn", "indeed": "Indeed"}

# Postings asked per search. LinkedIn: its list page holds 10. Indeed: up to 100 come in one
# request with their descriptions, so asking for 50 costs nothing more.
RESULTS: dict[Site, int] = {"linkedin": 10, "indeed": 50}
PAUSE_SECONDS = (10, 20)  # between two searches
# Requests per board in any 24 hours (list pages and posting pages). Conservative: the
# community reports LinkedIn throttling a single IP after ~100 results in a burst.
DAILY_REQUESTS: dict[Site, int] = {"linkedin": 150}
BLOCK_PAUSE = timedelta(minutes=45)
SECONDS_PER_SEARCH: dict[Site, int] = {"linkedin": 30, "indeed": 8}  # rough ETA

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


Verdict = Literal["new", "known", "abroad", "off_title"]


def _verdict(pq: PlannedQuery, q: Query, row: boards.Row) -> Verdict:
    """What to do with a posting from a board's list, before opening its page."""
    if not _in_country(pq, str(row["location"] or "")):
        return "abroad"
    if not title_matches(q, str(row["title"] or "")):
        return "off_title"  # the query could never show it
    return "known" if db.is_known(str(row["job_url"])) else "new"


def _job(pq: PlannedQuery, row: boards.Row) -> dict:
    """A board row as a `jobs` row (db.JOB_COLUMNS)."""
    title = str(row["title"] or "")
    location = str(row["location"] or "")
    description = str(row["description"] or "")
    return {
        "url": row["job_url"],
        "site": pq.site,
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


def _paused_message(site: Site, until: datetime) -> str:
    return t("paused", site=SITE_NAME[site], time=_local_time(until))


def _requests_left(site: Site) -> int | None:
    """Requests `site` may still get in the rolling 24 h window; None = no budget."""
    budget = DAILY_REQUESTS.get(site)
    if budget is None:
        return None
    used = db.requests_since(site, datetime.now(UTC) - timedelta(hours=24))
    return max(budget - used, 0)


def _hold_reason(site: Site) -> str | None:
    """Why `site` must be left alone right now (for the UI); None if it may be asked."""
    until = db.board_paused_until(site)
    if until:
        return _paused_message(site, until)
    if _requests_left(site) == 0:
        return t("budget", n=DAILY_REQUESTS[site], site=SITE_NAME[site])
    return None


Phase = Literal["idle", "searching", "pausing", "done", "cancelled"]
StepStatus = Literal["pending", "running", "done", "error", "recent", "skipped"]

# An identical board search that succeeded this recently is skipped: postings don't
# change that fast, and it spares the boards a request.
RECENT_HOURS = 6


@dataclass
class Step:
    """One board search, as shown to the user."""

    site: Site
    keyword: str
    place: str  # display name: "Lugano", "Ovunque"
    status: StepStatus = "pending"
    found: int = 0  # matching the query (title, country), new or already saved
    new: int = 0
    abroad: int = 0  # discarded: outside the searched country
    off_title: int = 0  # discarded: the title can't match the query
    missed: int = 0  # matching, but their page wasn't read (budget, block, cancel)
    error: str | None = (
        None  # user-facing, in the UI's language: why it failed or was skipped
    )
    note: str | None = None  # user-facing caveat on a "done" step
    ran_at: str | None = None  # for "recent": when the identical search last ran


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
        """Searches this run actually makes (recent and held ones are only listed)."""
        return sum(st.status not in ("recent", "skipped") for st in self.steps)


def _friendly_error(message: str) -> str:
    m = message.lower()
    if "429" in m or "too many" in m or "blocked" in m or "rate" in m:
        return t("throttled")
    if "timed out" in m or "timeout" in m:
        return t("timeout")
    return t("board_error")


class Runner:
    def __init__(self) -> None:
        self.state = RunState()
        self._cancel = threading.Event()
        self._lock = threading.Lock()

    def start(self, q: Query, *, force: bool = False) -> dict:
        """Plan and start a run in the background. Returns a summary for the UI.

        `force` reruns identical searches made in the last RECENT_HOURS too; the request
        budget and the pauses still apply.
        """
        if self.state.running:  # fail fast, before plan() possibly hits the geocoder
            raise RuntimeError(t("busy"))
        queries, skipped, errors = plan(q)
        if errors:
            raise ValueError(" ".join(errors))
        if not queries:
            raise ValueError(t("nothing_to_run"))

        now = datetime.now(UTC)
        holds = {site: _hold_reason(site) for site in {pq.site for pq in queries}}
        steps, todo = [], []
        for pq in queries:
            step = Step(pq.site, pq.keyword, pq.place_display)
            ran = db.last_board_search(pq.fingerprint(q.posted_within))
            if not force and ran and now - ran < timedelta(hours=RECENT_HOURS):
                step.status, step.ran_at = "recent", ran.isoformat()
            elif holds[pq.site]:
                step.status, step.error = "skipped", holds[pq.site]
            else:
                todo.append((len(steps), pq))
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
        if not todo:  # everything is fresh or on hold: nothing to ask the boards
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
        threading.Thread(target=ctx.run, args=(self._run, todo, q), daemon=True).start()
        summary["eta_seconds"] = round(
            sum(SECONDS_PER_SEARCH[pq.site] for _, pq in todo)
            + (len(todo) - 1) * sum(PAUSE_SECONDS) / 2
        )
        return summary

    def cancel(self) -> None:
        self._cancel.set()

    def _run(self, todo: list[tuple[int, PlannedQuery]], q: Query) -> None:
        """`todo`: (index into state.steps, query) for the searches to actually make."""
        s = self.state
        try:
            asked = False  # pause only between two searches that reach a board
            for i, pq in todo:
                if self._cancel.is_set():
                    break
                step = s.steps[i]
                # A board can go on hold mid-run: it throttled us, or the budget ran out.
                if reason := _hold_reason(pq.site):
                    step.status, step.error = "skipped", reason
                    continue
                if asked:
                    pause = random.uniform(*PAUSE_SECONDS)
                    s.phase, s.pause_seconds = "pausing", round(pause)
                    if self._cancel.wait(pause):
                        break
                s.phase, s.current, s.pause_seconds = "searching", i, None
                step.status = "running"
                self._search(pq, step, q)
                asked = True
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

    def _search(self, pq: PlannedQuery, step: Step, q: Query) -> None:
        """One board search: fills `step` and stores what it finds."""
        tag = f"[{pq.site}] {pq.keyword!r} @ {pq.place_label}"
        t0 = time.monotonic()
        verdicts: dict[object, Verdict] = {}

        def verdict(row: boards.Row) -> Verdict:
            url = row["job_url"]
            if url not in verdicts:
                verdicts[url] = _verdict(pq, q, row)
            return verdicts[url]

        budget = _requests_left(pq.site)
        try:
            result = boards.search(
                pq.site,
                _board_args(pq, q.posted_within),
                results=RESULTS[pq.site],
                wants=lambda row: verdict(row) == "new",
                wait=self._cancel.wait,
                max_requests=budget,
            )
        except Exception as e:  # noqa: BLE001 - any board failure (block, layout change) must not end the run
            log.warning("%s failed: %s", tag, e)
            step.status, step.error = "error", _friendly_error(str(e))
            return
        db.record_requests(pq.site, result.requests)
        if result.error:
            log.warning("%s board error: %s", tag, result.error)

        jobs = []
        for row in result.rows:
            v = verdict(row)
            if v == "abroad":
                step.abroad += 1
            elif v == "off_title":
                step.off_title += 1
            elif (
                v == "new"
                and pq.site == "linkedin"
                and row["job_url"] not in result.detailed
            ):
                step.missed += 1  # incomplete without its page: next search retries it
            else:
                jobs.append(_job(pq, row))
        step.found = len(jobs)
        step.new = db.save_many(jobs, pq.place_key, pq.place_display, pq.keyword)

        if result.blocked:
            until = datetime.now(UTC) + BLOCK_PAUSE
            db.pause_board(pq.site, until)
            message = _paused_message(pq.site, until)
            if jobs:
                step.status, step.note = "done", message
            else:
                step.status, step.error = "error", message
        elif result.error and not result.rows:
            step.status, step.error = "error", _friendly_error(result.error)
        else:
            step.status = "done"
            if step.missed and not self._cancel.is_set():
                why = t(
                    "missed_budget"
                    if budget is not None and result.requests >= budget
                    else "missed_page"
                )
                step.note = t("missed", n=step.missed, why=why)
            if not step.missed:  # complete: an identical search can wait a few hours
                db.record_board_search(pq.fingerprint(q.posted_within))
        log.info(
            "%s: %d found, %d new, %d abroad, %d off-title, %d missed, %d requests in %.0fs%s",
            tag,
            step.found,
            step.new,
            step.abroad,
            step.off_title,
            step.missed,
            result.requests,
            time.monotonic() - t0,
            " (blocked)" if result.blocked else "",
        )
