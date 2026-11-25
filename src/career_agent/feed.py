"""What a search shows: the boards' list pages, kept in memory for a short while.

Each board search (site, keyword, place, remote flag, date window, order) is a `Stream`: the
pages read so far, in the board's order, and where the next one starts. Nothing here goes to
the database; a posting is stored only when the user opens it (job_link.py).

How long a stream is kept (from its first page, so its pages always belong to one snapshot:
a page read hours after the one before would repeat or skip postings that moved meanwhile):
  - by relevance, 3 hours: the ranking barely moves in a few hours;
  - newest first, 1 hour: whoever asks for the newest wants this morning's postings.
Everything a user repeats by accident (a reload, back and forth between pages, flipping the
order and back) happens well within that, and those repeats are what looks like a bot. The
"refresh" button reads a search again whenever the user wants. A restart empties the cache.
"""

import threading
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from itertools import chain, zip_longest

from . import db, fx
from .boards import Cursor, Order
from .query import PlannedQuery, Query, passes, plan, unmet

TTL: dict[Order, timedelta] = {
    "relevant": timedelta(hours=3),
    "recent": timedelta(hours=1),
}


@dataclass
class Stream:
    site: str
    keyword: str
    place_key: str
    place_label: str
    order: Order
    started: datetime
    pages: list[list[dict]] = field(default_factory=list)
    """Postings per list page (`db.JOB_COLUMNS`), in the board's order."""
    detailed: set[str] = field(default_factory=set)
    """Urls of the postings that came with their text (Indeed)."""
    next: Cursor = None
    """Where the following page starts; None = no more pages."""

    def fresh(self, now: datetime) -> bool:
        return now - self.started < TTL[self.order]

    def hit(self) -> dict:
        return {
            "place": self.place_key,
            "label": self.place_label,
            "keyword": self.keyword,
        }


_streams: dict[str, Stream] = {}
_lock = threading.Lock()


def key(pq: PlannedQuery, q: Query, order: Order) -> str:
    return f"{pq.fingerprint(q.posted_within)}|{order}"


def get(k: str) -> Stream | None:
    """The stream under `k`, if it's still fresh."""
    with _lock:
        stream = _streams.get(k)
        if stream and not stream.fresh(datetime.now(UTC)):
            del _streams[k]
            return None
        return stream


def add_page(
    k: str,
    pq: PlannedQuery,
    order: Order,
    jobs: list[dict],
    detailed: set[str],
    following: Cursor,
    first: bool,
) -> Stream | None:
    """Record a list page read for `k`; the first page starts the stream over. A later page
    whose stream expired meanwhile is dropped (None): it belongs to a snapshot that's gone."""
    with _lock:
        stream = None if first else _streams.get(k)
        if not first and (stream is None or not stream.fresh(datetime.now(UTC))):
            return None
        if stream is None:
            stream = Stream(
                pq.site,
                pq.keyword,
                pq.place_key,
                pq.place_display,
                order,
                datetime.now(UTC),
            )
            _streams[k] = stream
        stream.pages.append(jobs)
        stream.detailed |= detailed
        stream.next = following
        return stream


def clear() -> None:
    with _lock:
        _streams.clear()


def cached(url: str) -> tuple[dict, bool] | None:
    """A posting some cached search returned, and whether its text came with it."""
    with _lock:
        for stream in _streams.values():
            for job in chain.from_iterable(stream.pages):
                if job["url"] == url:
                    return job, url in stream.detailed
    return None


def places(url: str) -> list[str]:
    """The place keys of the cached searches that returned a posting."""
    with _lock:
        return sorted(
            {
                s.place_key
                for s in _streams.values()
                if any(j["url"] == url for j in chain.from_iterable(s.pages))
            }
        )


def _merged(streams: list[Stream], order: Order) -> list[tuple[dict, Stream]]:
    """The streams' postings as one list. Page by page, so what's shown never moves when the
    next pages arrive: newest first within a page, else the searches take turns, each in its
    board's own order (relevance can't be compared across searches)."""
    out = []
    for depth in range(max((len(s.pages) for s in streams), default=0)):
        batch = [
            [(j, s) for j in s.pages[depth]] for s in streams if depth < len(s.pages)
        ]
        if order == "recent":
            rows = sorted(
                chain.from_iterable(batch),
                key=lambda js: js[0].get("date_posted") or "",
                reverse=True,
            )
        else:
            rows = [js for turn in zip_longest(*batch) for js in turn if js]
        out.extend(rows)
    return out


def view(q: Query, order: Order) -> dict:
    """What the search shows now, from the cache only: never asks a board."""
    queries, _, errors = plan(q)
    if errors:
        queries = []
    streams = [get(key(pq, q, order)) for pq in queries]
    loaded = [s for s in streams if s]
    fx_date, rates = fx.rates()

    rows: dict[str, dict] = {}
    found_in: dict[str, list[Stream]] = {}
    for job, stream in _merged(loaded, order):
        if job["url"] not in rows:
            rows[job["url"]] = job
        found_in.setdefault(job["url"], []).append(stream)

    saved = db.opened(list(rows), q.salary_currency, rates)
    items = []
    for url, job in rows.items():
        hits = [s.hit() for s in found_in[url]]
        keys = [h["place"] for h in hits]
        opened = saved.get(url)
        listed_with_text = any(url in s.detailed for s in found_in[url])
        live = {**_live(job, q.salary_currency, rates), "hits": hits}
        if opened and not listed_with_text:
            # A LinkedIn card the user opened: it showed by what the card says, and stays.
            # What its page then said against the filters goes along, for the warning.
            card = {
                **live,
                "description": opened.get("description"),
            }  # for the free text
            if passes(q, card, keys, rates, detailed=False):
                miss = unmet(q, opened, keys, rates, detailed=True)
                items.append({**opened, "hits": hits, "unmet": miss})
            continue
        item = {**opened, "hits": hits} if opened else live
        if passes(q, item, keys, rates, detailed=bool(opened) or listed_with_text):
            items.append({**item, "unmet": []})
    return {
        "items": items,
        "loaded": len(rows),
        "searches": len(queries),
        "missing": len(queries) - len(loaded),
        "more": any(s.next is not None for s in loaded),
        "fetched_at": min((s.started for s in loaded), default=None),
        "fx_date": fx_date,
    }


def _live(job: dict, currency: str, rates: dict[str, float]) -> dict:
    """A posting not opened yet, as a list item."""
    return {
        **job,
        "first_seen": None,
        "salary_converted": db.converted(job, currency, rates),
        "score": None,
        "has_cv": False,
        "opened": False,
    }
