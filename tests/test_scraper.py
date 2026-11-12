from career_agent import boards, db, scraper
from career_agent.query import Query, plan

ZURICH = [{"places": [{"city": "Zurigo", "country": "ch"}]}]


def row(url, title="Python dev", location="Zurich, Switzerland", **extra):
    """A board row as boards.search returns it (JobSpy's columns)."""
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


def result(*rows, **kw):
    return boards.Result(rows=list(rows), **kw)


def fake_boards(monkeypatch, responses):
    """Replace boards.search with canned results; returns the calls it got.

    Like the real one, LinkedIn rows that `wants` accepts get their page "opened",
    unless the row says it's unreadable.
    """
    answers = iter(responses)
    calls = []

    def search(site, args, *, results, wants, wait, max_requests):
        r = next(answers)
        calls.append({"site": site, "results": results, "max_requests": max_requests})
        if isinstance(r, Exception):
            raise r
        calls[-1]["wanted"] = wanted = [x["job_url"] for x in r.rows if wants(x)]
        if site == "linkedin":
            r.detailed |= {
                x["job_url"]
                for x in r.rows
                if x["job_url"] in wanted and not x.get("unreadable")
            }
        return r

    monkeypatch.setattr(boards, "search", search)
    monkeypatch.setattr(scraper, "PAUSE_SECONDS", (0, 0))
    return calls


def run(monkeypatch, responses, scopes=ZURICH, titles=("python",)):
    """Drive a real run synchronously with fake board responses and no pauses."""
    calls = fake_boards(monkeypatch, responses)
    r = scraper.Runner()
    q = Query.model_validate({"scopes": scopes, "title_any": list(titles)})
    queries, _, _ = plan(q)
    r.state = scraper.RunState(
        running=True,
        phase="searching",
        steps=[scraper.Step(pq.site, pq.keyword, pq.place_display) for pq in queries],
    )
    r._run(list(enumerate(queries)), q)
    return r.state, calls


def test_run_reports_structured_progress(monkeypatch):
    linkedin_rows = result(
        row("u1"),
        row("u2", location="Austin, TX, USA"),
        row("u3", title="Java developer"),
        requests=2,
    )
    st, calls = run(monkeypatch, [linkedin_rows, RuntimeError("429 Too Many Requests")])
    assert st.phase == "done" and not st.running and st.current is None
    linkedin, indeed = st.steps
    assert (linkedin.status, linkedin.found, linkedin.new) == ("done", 1, 1)
    assert (linkedin.abroad, linkedin.off_title, linkedin.missed) == (1, 1, 0)
    assert (indeed.status, indeed.error) == (
        "error",
        "il portale ha limitato le richieste: riprova più tardi",
    )
    assert (st.found, st.new, st.done_steps) == (1, 1, 2)
    # Only the posting that can match is worth opening.
    assert calls[0]["wanted"] == ["u1"]
    assert [c["results"] for c in calls] == [10, 50]


def test_board_error_without_results_is_an_error_step(monkeypatch):
    st, _ = run(
        monkeypatch,
        [result(error="timed out")],
        [{"anywhere": True, "modes": ["remote"]}],
    )
    assert (st.steps[0].status, st.steps[0].error) == (
        "error",
        "il portale non ha risposto in tempo",
    )


def test_known_postings_are_not_opened_again(monkeypatch):
    saved = {
        "url": "u1",
        "site": "linkedin",
        "title": "Python dev",
        "work_mode": "unknown",
    }
    db.save_many([saved], "geo:1", "Zurigo", "python")
    st, calls = run(monkeypatch, [result(row("u1"), row("u2")), result()])
    assert calls[0]["wanted"] == ["u2"]
    assert (st.steps[0].found, st.steps[0].new) == (2, 1)  # u1 still gets this hit


def test_requests_count_against_the_daily_budget(monkeypatch):
    run(monkeypatch, [result(row("u1"), requests=4), result()])
    since = scraper.datetime.now(scraper.UTC) - scraper.timedelta(hours=1)
    assert db.requests_since("linkedin", since) == 4
    assert db.requests_since("indeed", since) == 0


def test_the_search_gets_what_is_left_of_the_budget(monkeypatch):
    monkeypatch.setitem(scraper.DAILY_REQUESTS, "linkedin", 150)
    db.record_requests("linkedin", 140)
    _, calls = run(monkeypatch, [result(), result()])
    assert [c["max_requests"] for c in calls] == [10, None]


def test_a_spent_budget_holds_the_board_at_start(monkeypatch):
    monkeypatch.setattr(
        scraper.Runner, "_run", lambda *a: None
    )  # never scrape in tests
    db.record_requests("linkedin", scraper.DAILY_REQUESTS["linkedin"])
    r = scraper.Runner()
    summary = r.start(Query.model_validate({"scopes": ZURICH, "title_any": ["python"]}))
    assert (summary["queries"], summary["held"]) == (1, 1)
    assert "limite di 150 richieste a LinkedIn" in summary["held_reasons"][0]
    assert [st.status for st in r.state.steps] == ["skipped", "pending"]
    assert r.state.total_steps == 1


def test_a_throttled_board_is_paused_and_left_alone(monkeypatch):
    st, calls = run(
        monkeypatch,
        [result(row("u1"), blocked=True), result(), result()],
        titles=("python", "data"),
    )
    li_python, in_python, li_data, in_data = st.steps
    assert db.board_paused_until("linkedin") is not None
    assert li_python.status == "done" and "in pausa fino alle" in li_python.note
    assert li_data.status == "skipped" and "LinkedIn ha limitato" in li_data.error
    assert (in_python.status, in_data.status) == ("done", "done")
    assert [c["site"] for c in calls] == ["linkedin", "indeed", "indeed"]
    assert (st.done_steps, st.total_steps) == (3, 3)


def test_unread_postings_are_retried_next_time(monkeypatch):
    st, _ = run(monkeypatch, [result(row("u1"), row("u2", unreadable=True)), result()])
    li = st.steps[0]
    assert (li.found, li.missed) == (1, 1) and "non lette" in li.note
    queries, _, _ = plan(
        Query.model_validate({"scopes": ZURICH, "title_any": ["python"]})
    )
    assert db.last_board_search(queries[0].fingerprint(None)) is None  # not complete


def test_successful_searches_are_remembered(monkeypatch):
    run(monkeypatch, [result(row("u1")), RuntimeError("timeout")])
    queries, _, _ = plan(
        Query.model_validate({"scopes": ZURICH, "title_any": ["python"]})
    )
    linkedin, indeed = queries
    assert db.last_board_search(linkedin.fingerprint(None)) is not None
    assert (
        db.last_board_search(indeed.fingerprint(None)) is None
    )  # failed: retry next time


def test_start_skips_identical_recent_searches(monkeypatch):
    monkeypatch.setattr(scraper.Runner, "_run", lambda *a: None)
    q = Query.model_validate({"scopes": ZURICH, "title_any": ["python"]})
    linkedin, _ = plan(q)[0]
    db.record_board_search(linkedin.fingerprint(None))
    r = scraper.Runner()
    summary = r.start(q)
    assert (summary["queries"], summary["recent"], summary["held"]) == (1, 1, 0)
    assert [st.status for st in r.state.steps] == ["recent", "pending"]
    assert (r.state.done_steps, r.state.total_steps) == (0, 1)


def test_start_runs_nothing_when_everything_is_recent(monkeypatch):
    monkeypatch.setattr(scraper.Runner, "_run", lambda *a: None)
    q = Query.model_validate({"scopes": ZURICH, "title_any": ["python"]})
    for pq in plan(q)[0]:
        db.record_board_search(pq.fingerprint(None))
    r = scraper.Runner()
    assert r.start(q)["queries"] == 0
    assert not r.state.running and r.state.phase == "idle"


def test_a_different_date_window_is_a_different_search():
    (pq, *_), _, _ = plan(
        Query.model_validate({"scopes": ZURICH, "title_any": ["python"]})
    )
    assert pq.fingerprint(None) != pq.fingerprint(168)


def test_job_types_are_normalised_from_jobspy():
    assert scraper.normalize_job_type("fulltime, temporary") == ",fulltime,contract,"
    assert scraper.normalize_job_type("perdiem, contract") == ",contract,"
    assert scraper.normalize_job_type("other") is None
    assert scraper.normalize_job_type(None) is None
