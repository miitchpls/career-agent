from datetime import UTC, datetime, timedelta

import pytest

from career_agent import boards, db, feed, scraper
from career_agent.query import Query

ZURICH = [{"places": [{"city": "Zurigo", "country": "ch"}]}]
BASEL = {"city": "Basilea", "country": "ch"}


def row(url, title="Python dev", location="Zurich, Switzerland", **extra):
    """A board row as boards.page returns it (JobSpy's columns)."""
    return {
        "job_url": url,
        "title": title,
        "location": location,
        "company": None,
        "is_remote": False,
        "job_type": None,
        "date_posted": None,
        "min_amount": None,
        "max_amount": None,
        "currency": None,
        "description": "",
        **extra,
    }


def page(*rows, requests=1, next=None, **kw):
    return boards.Result(rows=list(rows), requests=requests, next=next, **kw)


@pytest.fixture
def boards_answer(monkeypatch):
    """boards.page answers with the pages given, in turn; returns the calls it got.

    Runs start synchronously and without pauses between requests.
    """
    calls, answers = [], []

    def fake_page(site, args, order, start):
        calls.append({"site": site, "start": start, "order": order, "args": args})
        answer = answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    class Now:
        def __init__(self, target, args, daemon):
            self.target, self.args = target, args

        def start(self):
            self.target(*self.args)

    monkeypatch.setattr(boards, "page", fake_page)
    monkeypatch.setattr(scraper.threading, "Thread", Now)
    monkeypatch.setattr(
        scraper, "REQUEST_PAUSE", {"linkedin": (0, 0), "indeed": (0, 0)}
    )

    def give(*pages):
        answers.extend(pages)
        return calls

    return give


def query(scopes=ZURICH, titles=("python",), **kw):
    return Query.model_validate({"scopes": scopes, "title_any": list(titles), **kw})


def test_a_run_reads_one_page_per_search_and_caches_it(boards_answer):
    calls = boards_answer(
        page(
            row("u1"),
            row("u2", location="Austin, TX, USA"),
            row("u3", title="Java developer"),
            next=10,
        ),
        page(row("i1", description="Python, ibrido"), detailed={"i1"}),
    )
    r = scraper.Runner()
    summary = r.start(query())
    assert summary["queries"] == 2 and summary["recent"] == 0
    assert [(c["site"], c["start"], c["order"]) for c in calls] == [
        ("linkedin", None, "relevant"),
        ("indeed", None, "relevant"),
    ]
    li, ind = r.state.steps
    assert (li.status, li.found, li.new, li.abroad, li.off_title) == (
        "done",
        1,
        1,
        1,
        1,
    )
    assert (ind.status, ind.found) == ("done", 1)
    assert (r.state.phase, r.state.found) == ("done", 2)
    shown = feed.view(query(), "relevant")
    assert [i["url"] for i in shown["items"]] == ["u1", "i1"]
    assert shown["more"] is True and shown["missing"] == 0
    assert db.get_job("u1") is None  # nothing is stored until it's opened


def test_the_two_boards_take_turns(boards_answer):
    calls = boards_answer(*[page(row(f"u{i}")) for i in range(4)])
    scopes = [{"places": [ZURICH[0]["places"][0], BASEL]}]
    scraper.Runner().start(query(scopes=scopes))
    assert [c["site"] for c in calls] == ["linkedin", "indeed", "linkedin", "indeed"]


def test_a_cached_search_isnt_asked_again(boards_answer):
    calls = boards_answer(page(row("u1")), page(row("i1")))
    scraper.Runner().start(query())
    r = scraper.Runner()
    summary = r.start(query())
    assert summary["queries"] == 0 and summary["recent"] == 2 and len(calls) == 2
    assert not r.state.running  # nothing started


def test_each_order_is_its_own_search(boards_answer):
    calls = boards_answer(page(row("u1")), page(row("i1")), page(row("u2")), page())
    scraper.Runner().start(query())
    scraper.Runner().start(query(), "recent")
    assert [c["order"] for c in calls] == ["relevant"] * 2 + ["recent"] * 2
    assert [i["url"] for i in feed.view(query(), "recent")["items"]] == ["u2"]


def test_more_reads_the_next_page_of_each_search(boards_answer):
    calls = boards_answer(
        page(row("u1"), next=10),
        page(row("i1")),  # Indeed has no more pages
        page(row("u2"), next=20),
    )
    scraper.Runner().start(query())
    r = scraper.Runner()
    summary = r.start(query(), more=True)
    assert (
        summary["queries"] == 1 and len(r.state.steps) == 1
    )  # the finished one isn't listed
    assert calls[-1]["start"] == 10
    items = feed.view(query(), "relevant")["items"]
    assert [i["url"] for i in items] == ["u1", "i1", "u2"]  # earlier pages stay put


def test_more_on_a_search_not_cached_reads_its_first_page(boards_answer):
    calls = boards_answer(page(row("u1")), page())
    scraper.Runner().start(query(), more=True)
    assert [c["start"] for c in calls] == [None, None]


def test_refresh_reads_the_first_page_again_and_drops_the_rest(boards_answer):
    boards_answer(page(row("u1"), next=10), page(), page(row("u2"), next=20))
    scraper.Runner().start(query())
    scraper.Runner().start(query(), more=True)
    calls = boards_answer(page(row("u9"), next=10), page())
    scraper.Runner().start(query(), force=True)
    assert [c["start"] for c in calls[-2:]] == [None, None]
    assert [i["url"] for i in feed.view(query(), "relevant")["items"]] == ["u9"]


def test_a_cached_search_expires(boards_answer):
    calls = boards_answer(page(row("u1")), page(), page(row("u2")), page())
    scraper.Runner().start(query())
    (k,) = [k for k in feed._streams if k.startswith("linkedin")]
    for stream in feed._streams.values():
        stream.started -= feed.TTL["relevant"] + timedelta(minutes=1)
    assert feed.get(k) is None  # no longer fresh: new reads won't build on it
    assert (
        feed.view(query(), "relevant")["missing"] == 0
    )  # still shown, for a few minutes
    for stream in feed._streams.values():
        stream.started -= feed.GRACE
    assert feed.view(query(), "relevant")["missing"] == 2  # gone
    assert feed.cached("u1") is None and feed.places("u1") == []
    scraper.Runner().start(query())
    assert len(calls) == 4


def test_old_searches_are_dropped_from_memory(boards_answer):
    boards_answer(page(row("u1")), page(), page(row("b1")), page())
    scraper.Runner().start(query())
    for stream in feed._streams.values():
        stream.started -= feed.TTL["relevant"] + feed.GRACE
    scraper.Runner().start(query(scopes=[{"places": [BASEL]}]))
    # Only Basel's are left: the old Zurich ones were freed.
    assert len(feed._streams) == 2 and all("|basilea|ch|" in k for k in feed._streams)


def test_a_recent_order_expires_sooner():
    assert feed.TTL["recent"] < feed.TTL["relevant"] <= timedelta(hours=4)


def test_a_failed_page_isnt_cached(boards_answer):
    boards_answer(page(requests=1, error="timed out"), RuntimeError("boom"))
    r = scraper.Runner()
    r.start(query())
    li, ind = r.state.steps
    assert (li.status, li.error) == ("error", "il portale non ha risposto in tempo")
    assert ind.status == "error"  # boards.page never raises; the run survives if it did
    assert feed.view(query(), "relevant")["missing"] == 2


def test_postings_already_opened_arent_new(boards_answer):
    db.save_job(scraper.job_row("linkedin", row("u1")))
    boards_answer(page(row("u1"), row("u2")), page())
    r = scraper.Runner()
    r.start(query())
    assert (r.state.steps[0].found, r.state.steps[0].new) == (2, 1)
    items = feed.view(query(), "relevant")["items"]
    assert [i["opened"] for i in items] == [True, False]


def test_requests_count_against_the_budgets(boards_answer):
    boards_answer(page(row("u1"), requests=1), page(requests=2))
    scraper.Runner().start(query())
    since = datetime.now(UTC) - timedelta(minutes=1)
    assert db.requests_since("linkedin", since) == 1
    assert db.requests_since("indeed", since) == 2


def test_the_hourly_budget_holds_linkedin_before_the_daily_one():
    db.record_requests("linkedin", scraper.HOURLY_REQUESTS["linkedin"])
    assert scraper.hold_reason("linkedin") == (
        "raggiunto il limite di 70 richieste a LinkedIn nell'ultima ora: riprova più tardi"
    )
    assert scraper.requests_left("linkedin") == 0
    assert scraper.requests_left("indeed") == scraper.DAILY_REQUESTS["indeed"]


def test_a_spent_budget_holds_the_board_at_start(boards_answer):
    db.record_requests("linkedin", scraper.DAILY_REQUESTS["linkedin"])
    calls = boards_answer(page(row("i1")))
    r = scraper.Runner()
    summary = r.start(query())
    assert summary["queries"] == 1 and summary["held"] == 1
    assert "150 richieste a LinkedIn" in summary["held_reasons"][0]
    assert [c["site"] for c in calls] == ["indeed"]
    assert r.state.steps[0].status == "skipped"


def test_a_throttled_board_is_paused_and_left_alone(boards_answer):
    scopes = [{"places": [ZURICH[0]["places"][0], BASEL]}]
    calls = boards_answer(page(blocked=True, error="429"), page(row("i1")), page())
    r = scraper.Runner()
    r.start(query(scopes=scopes))
    assert [c["site"] for c in calls] == ["linkedin", "indeed", "indeed"]
    li = r.state.steps[0]
    assert li.status == "error" and "ha limitato le richieste" in li.error
    assert r.state.steps[2].status == "skipped"  # LinkedIn's second search waits
    assert db.board_paused_until("linkedin") is not None
    assert scraper.hold_reason("linkedin")


def test_repeated_blocks_pause_longer_and_a_quiet_day_resets_them():
    now = datetime.now(UTC)
    lengths = []
    for _ in range(4):
        until = scraper.block("linkedin")
        lengths.append(round((until - now).total_seconds() / 3600, 2))
        # Pretend the pause just ended, so the next block counts as a repeat.
        db.pause_board("linkedin", now, db.last_pause("linkedin")[1])
    assert lengths == [0.75, 6, 24, 24]
    db.pause_board("linkedin", now - timedelta(hours=25), 3)
    assert scraper.block("linkedin") - now < timedelta(hours=1)


def test_a_board_waits_for_its_own_last_request_only(monkeypatch):
    monkeypatch.setattr(scraper, "_last_request", {})
    r = scraper.Runner()
    waited = []
    monkeypatch.setattr(r._cancel, "wait", lambda s: waited.append(s) or False)
    monkeypatch.setattr(
        scraper, "REQUEST_PAUSE", {"linkedin": (5, 5), "indeed": (2, 2)}
    )
    assert r._wait_for("linkedin") is False and waited == []  # never asked yet
    scraper.asked("linkedin")
    r._wait_for("linkedin")
    r._wait_for("indeed")
    assert len(waited) == 1 and 4 < waited[0] <= 5
    assert r.state.phase == "pausing"


def test_a_different_date_window_is_a_different_search():
    from career_agent.query import plan

    (pq, _), _, _ = plan(query())
    assert feed.key(pq, query(), "relevant") != feed.key(
        pq, query(posted_within=24), "relevant"
    )


def test_job_types_are_normalised_from_jobspy():
    assert scraper.normalize_job_type("fulltime, temporary") == ",fulltime,contract,"
    assert scraper.normalize_job_type("perdiem, contract") == ",contract,"
    assert scraper.normalize_job_type("other") is None
    assert scraper.normalize_job_type(None) is None


def test_more_over_an_expired_search_reads_the_whole_query_again(boards_answer):
    """A lone fresh first page would reshuffle what's shown: every search starts over."""
    calls = boards_answer(
        page(row("u1"), next=10),
        page(row("i1"), next="relevance:c2"),
        page(row("u9"), next=10),
        page(row("i9")),
    )
    scraper.Runner().start(query())
    (li,) = [s for k, s in feed._streams.items() if k.startswith("linkedin")]
    li.started -= feed.TTL["relevant"] + timedelta(minutes=1)
    summary = scraper.Runner().start(query(), more=True)
    assert summary["queries"] == 2 and [c["start"] for c in calls[2:]] == [None, None]
    assert [i["url"] for i in feed.view(query(), "relevant")["items"]] == ["u9", "i9"]


def test_a_page_for_a_search_dropped_meanwhile_is_reported(boards_answer, monkeypatch):
    boards_answer(page(row("u1"), next=10), page(row("u2"), next=20))
    only = query(sites=["linkedin"])
    scraper.Runner().start(only)
    monkeypatch.setattr(feed, "add_page", lambda *a, **k: None)
    r = scraper.Runner()
    r.start(only, more=True)
    assert (r.state.steps[0].status, r.state.steps[0].error) == (
        "error",
        "ricerca scaduta nel frattempo: premi Aggiorna",
    )


def test_off_title_postings_are_cached_for_queries_with_other_titles(boards_answer):
    boards_answer(page(row("u1"), row("u2", title="Backend developer")), page())
    r = scraper.Runner()
    r.start(query())
    assert (r.state.steps[0].found, r.state.steps[0].off_title) == (1, 1)
    wider = query(titles=("python", "backend developer"))
    # The "python" searches are cached, and their page shows it under these titles.
    assert scraper.Runner().start(wider)["recent"] == 2
    shown = [i["url"] for i in feed.view(wider, "relevant")["items"]]
    assert shown == ["u1", "u2"]
