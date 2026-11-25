import time

import pytest
from fastapi.testclient import TestClient

from career_agent import ai, db, score
from career_agent.app import app, scorer
from career_agent.score import ScorePrefs, decision_for, to_result

client = TestClient(app)

URL = "https://www.linkedin.com/jobs/view/4458087343"
JOB = {
    "url": URL,
    "site": "linkedin",
    "title": "Senior Backend Engineer",
    "company": "Acme",
    "location": "Zürich",
    "work_mode": "hybrid",
    "description": (
        "You will own our public API.\n"
        "Requirements: 5+ years building services in Go. "
        "Experience running workloads on Kubernetes.\n"
        "Nice to have: German B2.\n"
        "On-call one week per month. No visa sponsorship."
    ),
}
PROFILE = {
    "name": "Giulia Ferri",
    "headline": "Backend Engineer",
    "experiences": [
        {
            "id": "e1",
            "role": "Backend Engineer",
            "company": "Lumen",
            "bullets": ["Go APIs."],
        }
    ],
}
PREFS = ScorePrefs(
    dealbreakers=["No body rental"], note="Open to anything fully remote."
)


@pytest.fixture(autouse=True)
def wait_for_scores():
    """A test's background score must end before the next test swaps the database."""
    yield
    for _ in range(500):
        if scorer.idle():
            return
        time.sleep(0.01)
    raise AssertionError("a score thread outlived its test")


def req(name, importance="high", evidence="stated", quote=None, match="strong"):
    return {
        "requirement": name,
        "importance": importance,
        "evidence": evidence,
        "jd_quote": quote,
        "match": match,
        "profile_evidence": "Go APIs.",
    }


def dim(score=4, status="supported", note="ok"):
    return {"status": status, "score": score, "note": note}


def answer(**kw):
    base = {
        "requirements": [
            req("Go", "critical", "stated", "5+ years building services in Go"),
            req(
                "Kubernetes",
                "high",
                "structural",
                "Experience running workloads on Kubernetes",
                "partial",
            ),
        ],
        "dimensions": {d: dim() for d in score.DIMENSIONS},
        "red_flags": [],
        "gaps": [
            {
                "requirement": "Kubernetes",
                "risk": "They will ask about clusters.",
                "mitigation": "Talk about Docker.",
            }
        ],
        "checks": ["Ask the team size."],
        "score": 4.24,
        "verdict": "Apply: strong on Go.",
    }
    return base | kw


def test_bands_follow_career_ops():
    assert [decision_for(x, False) for x in (5, 4.5, 4.4, 4.0, 3.9, 3.0, 2.9, 1)] == [
        "strong_apply",
        "strong_apply",
        "apply",
        "apply",
        "consider",
        "consider",
        "skip",
        "skip",
    ]
    assert decision_for(4.8, True) == "skip"


def test_a_clean_answer_is_kept_and_the_decision_derived():
    r = to_result(answer(), JOB)
    assert r.score == 4.2 and r.decision == "apply" and r.confidence == "high"
    assert [x.requirement for x in r.requirements] == ["Go", "Kubernetes"]
    assert r.gaps[0].requirement == "Kubernetes"


def test_importance_needs_the_posting_behind_it():
    r = to_result(
        answer(
            requirements=[
                # An estimate can't be critical or high.
                req("Fintech", "critical", "inferred", "whatever", "missing"),
                # "Stated" with words the posting doesn't hold is an estimate.
                req("Rust", "high", "stated", "10 years of Rust", "missing"),
                # Quotes are matched without case, spacing or punctuation.
                req(
                    "German",
                    "preferred",
                    "stated",
                    "nice to HAVE:  german b2",
                    "missing",
                ),
            ]
        ),
        JOB,
    )
    rows = {x.requirement: x for x in r.requirements}
    assert (
        rows["Fintech"].importance == "meaningful" and rows["Fintech"].jd_quote is None
    )
    assert (rows["Rust"].importance, rows["Rust"].evidence) == (
        "meaningful",
        "inferred",
    )
    assert rows["German"].evidence == "stated" and rows["German"].jd_quote


def test_rows_are_sorted_and_budgeted_but_must_haves_stay():
    rows = [req(f"must {i}", "critical", "structural") for i in range(13)]
    rows += [
        req("nice", "preferred", "structural"),
        req("gap", "critical", "structural", match="missing"),
    ]
    r = to_result(answer(requirements=rows, gaps=[]), JOB)
    assert len(r.requirements) == 14 and r.omitted == 1  # all 14 critical, "nice" cut
    assert r.requirements[0].requirement == "gap"  # unmet first within a band


def test_no_evidence_means_no_number():
    dims = {d: dim() for d in score.DIMENSIONS}
    dims["salary"] = dim(3, "unknown")
    dims["company"] = dim(None, "partial")
    r = to_result(answer(dimensions=dims), JOB)
    assert (
        r.dimensions["salary"].score is None
        and r.dimensions["salary"].status == "unknown"
    )
    assert r.dimensions["company"].status == "unknown"
    assert r.confidence == "low"  # two dimensions without evidence


def test_the_score_doesnt_judge_what_you_search():
    assert score.DIMENSIONS == ("cv", "salary", "company")
    prompt = score.system_prompt("en")
    assert "checked elsewhere" in prompt and "goals" not in prompt


def test_a_hard_stop_needs_the_postings_words():
    flags = [
        {
            "text": "No sponsorship",
            "jd_quote": "No visa sponsorship.",
            "hard_stop": True,
        },
        {"text": "Guess", "jd_quote": "Unpaid overtime expected", "hard_stop": True},
    ]
    r = to_result(answer(red_flags=flags), JOB)
    assert [f.hard_stop for f in r.red_flags] == [True, False]
    assert r.decision == "skip" and r.score == 4.2  # the number stays
    r = to_result(answer(red_flags=flags[1:]), JOB)
    assert r.decision == "apply" and r.red_flags[0].jd_quote is None


def test_gaps_only_for_unmet_must_haves():
    gaps = [
        {"requirement": "Go", "risk": "x", "mitigation": "y"},  # met
        {"requirement": "kubernetes", "risk": "x", "mitigation": "y"},
        {"requirement": "Kubernetes", "risk": "x", "mitigation": "z"},  # a repeat
        {"requirement": "Cobol", "risk": "x", "mitigation": "y"},  # not a row
    ]
    r = to_result(answer(gaps=gaps), JOB)
    assert [(g.requirement, g.mitigation) for g in r.gaps] == [("Kubernetes", "y")]


@pytest.mark.parametrize("bad", [6, 0.5, "4", None, True])
def test_a_score_out_of_range_fails(bad):
    with pytest.raises((TypeError, ValueError)):
        to_result(answer(score=bad), JOB)


def test_the_prompt_carries_posting_profile_and_preferences_not_contacts():
    from career_agent.profile import Profile

    prompt = score.user_prompt(
        JOB, Profile.model_validate(PROFILE | {"email": "g@x.io"}), PREFS
    )
    assert (
        "<posting>" in prompt
        and "Kubernetes" in prompt
        and "Backend Engineer" in prompt
    )
    assert "<preferences>" in prompt and "No body rental" in prompt
    assert "g@x.io" not in prompt and "Giulia" not in prompt


# --- API ----------------------------------------------------------------------------------------


def _engine(monkeypatch, result=None, error=None, delay=0.0):
    fake = ai.Provider(
        id="claude",
        name="Claude Code",
        command="claude",
        install_url="",
        login="claude",
        installed=True,
        connected=True,
        plan="Pro",
        path="/bin/claude",
    )
    monkeypatch.setattr(ai, "detect", lambda: [fake])
    calls = []

    def run(provider, model, system, prompt, schema, on_start=None):
        calls.append({"system": system, "prompt": prompt})
        time.sleep(delay)
        if error:
            raise ai.AiError(error)
        return result

    monkeypatch.setattr(ai, "run", run)
    return calls


def _settled():
    for _ in range(300):
        s = client.get("/api/jobs/score", params={"url": URL}).json()["score"]
        if s and s["status"] != "running":
            return s
        time.sleep(0.01)
    raise AssertionError("score never finished")


def _seed(description=JOB["description"]):
    db.save_job(JOB | {"description": description})


def test_scoring_needs_a_saved_posting_with_text_and_a_profile(monkeypatch):
    _engine(monkeypatch, answer())
    start = lambda: client.post("/api/jobs/score", json={"url": URL})
    assert start().status_code == 404
    _seed(description="")
    assert start().status_code == 400
    db.save_job(JOB)  # a known url keeps its row
    with db.connect() as conn:
        conn.execute(
            "UPDATE jobs SET description = ? WHERE url = ?", (JOB["description"], URL)
        )
    r = start()
    assert r.status_code == 400 and "profilo" in r.json()["detail"]


def test_a_score_runs_shows_in_the_list_and_goes_stale(monkeypatch):
    calls = _engine(monkeypatch, answer())
    _seed()
    client.put("/api/profile", json={"profile": PROFILE})
    client.put(
        "/api/score/preferences",
        json={
            "dealbreakers": [" No  body rental ", "no body rental"],
            "note": " Remote. ",
        },
    )
    assert client.get("/api/score/preferences").json() == {
        "dealbreakers": ["No body rental"],
        "note": "Remote.",
    }

    r = client.post(
        "/api/jobs/score", json={"url": URL}, headers={"Accept-Language": "en"}
    )
    assert r.status_code == 202
    s = _settled()
    assert s["status"] == "ready" and s["value"] == 4.2 and s["decision"] == "apply"
    assert s["result"]["requirements"][0]["jdQuote"] and s["stale"] is False
    assert "English" in calls[0]["system"] and "No body rental" in calls[0]["prompt"]

    item = db.opened([URL], "CHF", {})[URL]
    assert item["score"] == {"value": 4.2, "decision": "apply"}

    # Changing the preferences (or the profile, or the posting) makes it stale.
    client.put("/api/score/preferences", json={"note": "Only product companies."})
    assert (
        client.get("/api/jobs/score", params={"url": URL}).json()["score"]["stale"]
        is True
    )


def test_a_failed_score_keeps_the_last_finished_one(monkeypatch):
    _seed()
    client.put("/api/profile", json={"profile": PROFILE})
    _engine(monkeypatch, answer())
    client.post("/api/jobs/score", json={"url": URL})
    first = _settled()

    _engine(monkeypatch, {"nope": 1})
    client.post("/api/jobs/score", json={"url": URL}, headers={"Accept-Language": "en"})
    body = client.get("/api/jobs/score", params={"url": URL}).json()
    for _ in range(300):
        if body["score"]["status"] != "running":
            break
        time.sleep(0.01)
        body = client.get("/api/jobs/score", params={"url": URL}).json()
    assert (
        body["score"]["status"] == "failed"
        and "unexpected shape" in body["score"]["error"]
    )
    assert body["earlier"]["id"] == first["id"]
    # The list keeps the finished score.
    assert db.opened([URL], "CHF", {})[URL]["score"]["value"] == 4.2


def test_cancel_and_one_run_per_posting(monkeypatch):
    _seed()
    client.put("/api/profile", json={"profile": PROFILE})
    _engine(monkeypatch, answer(), delay=0.3)
    client.post("/api/jobs/score", json={"url": URL})
    assert client.post("/api/jobs/score", json={"url": URL}).status_code == 409
    body = client.request("DELETE", "/api/jobs/score", params={"url": URL}).json()
    assert body["score"] is None  # the cancelled run is hidden
    time.sleep(0.4)
    assert client.get("/api/jobs/score", params={"url": URL}).json()["score"] is None


def test_a_restart_interrupts_running_scores(monkeypatch):
    _seed()
    client.put("/api/profile", json={"profile": PROFILE})
    db.create_score(URL, db.latest_profile()["id"], "x", "claude", None)
    db.fail_running_scores()
    s = client.get("/api/jobs/score", params={"url": URL}).json()["score"]
    assert s["error"] == "Valutazione interrotta: il server è stato riavviato."


def test_scores_go_with_the_profile(monkeypatch):
    _seed()
    client.put("/api/profile", json={"profile": PROFILE})
    db.create_score(URL, db.latest_profile()["id"], "x", "claude", None)
    client.delete("/api/profile")
    assert client.get("/api/jobs/score", params={"url": URL}).json()["score"] is None


def test_a_quote_must_be_whole_words():
    job = JOB | {"description": "JavaScript required. Fortnightly releases."}
    r = to_result(
        answer(
            requirements=[req("Java", "critical", "stated", "Java", "missing")],
            red_flags=[{"text": "Nights", "jd_quote": "night", "hard_stop": True}],
            gaps=[],
        ),
        job,
    )
    assert (r.requirements[0].evidence, r.requirements[0].importance) == (
        "inferred",
        "meaningful",
    )
    assert r.red_flags[0].jd_quote is None and r.decision == "apply"


@pytest.mark.parametrize(
    "bad",
    [
        {"dimensions": {d: "good" for d in score.DIMENSIONS}},
        {"checks": "Ask the team size."},
        {"requirements": {"a": 1}},
    ],
)
def test_a_wrong_shape_is_a_type_error(bad):
    with pytest.raises(TypeError):
        to_result(answer(**bad), JOB)


def test_a_malformed_answer_fails_as_unexpected_shape(monkeypatch):
    _seed()
    client.put("/api/profile", json={"profile": PROFILE})
    _engine(monkeypatch, answer(dimensions={d: "good" for d in score.DIMENSIONS}))
    client.post("/api/jobs/score", json={"url": URL}, headers={"Accept-Language": "en"})
    s = _settled()
    assert s["status"] == "failed" and "unexpected shape" in s["error"]


def test_at_most_three_run_and_slots_are_let_go(monkeypatch):
    client.put("/api/profile", json={"profile": PROFILE})
    urls = [f"https://www.linkedin.com/jobs/view/40000000{i}" for i in range(4)]
    for u in urls:
        db.save_job(JOB | {"url": u})
    _engine(monkeypatch, answer(), delay=0.3)
    for u in urls[:3]:
        assert client.post("/api/jobs/score", json={"url": u}).status_code == 202
    r = client.post("/api/jobs/score", json={"url": urls[3]})
    assert r.status_code == 409 and urls[3] not in scorer._runs._pool._slots
    # A cancelled run still exiting keeps its place.
    client.request("DELETE", "/api/jobs/score", params={"url": urls[0]})
    assert client.post("/api/jobs/score", json={"url": urls[3]}).status_code == 409
    for _ in range(300):
        if scorer.idle():
            break
        time.sleep(0.01)
    assert scorer._runs._pool._slots == {}


def test_dealbreakers_saved_among_the_old_goals_carry_over():
    db.set_setting("goals", '{"roles": ["x"], "dealbreakers": ["y"]}')
    assert score.prefs() == ScorePrefs(dealbreakers=["y"])
    # Once saved, the new settings win.
    client.put("/api/score/preferences", json={"dealbreakers": [], "note": "z"})
    assert score.prefs() == ScorePrefs(note="z")
    db.set_setting("score_prefs", "not json")
    assert score.prefs() == ScorePrefs()
