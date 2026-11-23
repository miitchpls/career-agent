import time

import pytest
from fastapi.testclient import TestClient

from career_agent import ai, db
from career_agent.app import app, reviewer
from career_agent.profile import Profile
from career_agent.review import REVIEW_SCHEMA, to_suggestions, user_prompt

client = TestClient(app)


@pytest.fixture(autouse=True)
def wait_for_reviews():
    """A test's background review must end before the next test swaps the database."""
    yield
    for _ in range(500):
        if reviewer.idle():
            return
        time.sleep(0.01)
    raise AssertionError("a review thread outlived its test")


PROFILE = {
    "name": "Giulia Ferri",
    "headline": "Data Engineer",
    "summary": "",
    "experiences": [
        {
            "id": "e1",
            "role": "Senior Data Engineer",
            "company": "Lumen Analytics",
            "bullets": [
                "Responsabile della migrazione del data lake su Databricks.",
                "Ho ridotto i costi del cluster del 30% con Spark e Airflow.",
            ],
            "skills": ["Spark"],
        }
    ],
    "projects": [
        {"id": "p1", "name": "dbt-lint", "description": "Un linter per progetti dbt."}
    ],
}


def _p(data=PROFILE) -> Profile:
    return Profile.model_validate(data)


def s(**kw):
    base = {
        "kind": "rewrite",
        "entry_id": "e1",
        "field": "bullet",
        "index": 0,
        "before": "Responsabile della migrazione del data lake su Databricks.",
        "after": "Ho migrato il data lake su Databricks.",
        "reason": "Un verbo attivo dice cosa hai fatto.",
    }
    return base | kw


def kept(*items, profile=None):
    out, dropped = to_suggestions({"suggestions": list(items)}, profile or _p())
    return out, dropped


def test_a_rephrasing_with_the_same_facts_is_kept():
    out, dropped = kept(s())
    assert dropped == 0
    assert out[0].model_dump(by_alias=True) | {"id": "x"} == {
        "id": "x",
        "kind": "rewrite",
        "section": "experience",
        "entryId": "e1",
        "field": "bullet",
        "index": 0,
        "before": "Responsabile della migrazione del data lake su Databricks.",
        "after": "Ho migrato il data lake su Databricks.",
        "reason": "Un verbo attivo dice cosa hai fatto.",
        "state": "open",
    }


@pytest.mark.parametrize(
    "after",
    [
        "Ho migrato il data lake su Databricks in 3 mesi.",  # a number nobody wrote
        "Ho migrato il data lake su Databricks e Kubernetes.",  # a tool it doesn't name
        "Ho migrato il data lake su Databricks con dbt.",  # dbt: only in another entry's text?
        "Ho migrato il data lake su Databricks per Acme.",  # an employer
        "Ho migrato il data lake su Databricks e AWS S3.",
    ],
)
def test_a_rewrite_that_adds_a_fact_is_dropped(after):
    out, _ = kept(s(after=after))
    if (
        "dbt" in after
    ):  # dbt is in the profile (a project's text): a rephrasing may use it
        assert out
    else:
        assert out == []


def test_numbers_and_names_already_in_the_profile_may_move():
    out, _ = kept(
        s(
            index=1,
            before="Ho ridotto i costi del cluster del 30% con Spark e Airflow.",
            after="Costi del cluster -30% grazie a Spark e Airflow.",
        )
    )
    assert len(out) == 1


def test_stale_or_unchanged_or_misplaced_suggestions_are_dropped():
    out, dropped = kept(
        s(before="Testo che non c'è più."),  # the bullet changed since
        s(
            after="Responsabile della migrazione del data lake su Databricks"
        ),  # no change
        s(index=7),  # no such bullet
        s(entry_id="nope"),  # no such entry
        s(field="description"),  # experiences have bullets, not a description
        s(kind="add_skill"),  # add_skill must target "skill"
    )
    assert out == [] and dropped == 6


def test_questions_carry_blanks_and_rewrites_dont():
    question = s(
        kind="question",
        after="Ho migrato il data lake su Databricks, riducendo i tempi di [[percentuale]].",
    )
    out, _ = kept(question)
    assert out[0].kind == "question"
    # A question needs a blank; a rewrite can't have one; at most three.
    assert kept(s(kind="question"))[0] == []
    assert kept(s(after=question["after"]))[0] == []
    many = "Ho migrato [[a]] [[b]] [[c]] [[d]] su Databricks."
    assert kept(s(kind="question", after=many))[0] == []
    # A number inside a blank's label isn't a fact: it's what the user will type.
    q2 = s(kind="question", after="Ho migrato [[quanti TB]] su Databricks.")
    assert kept(q2)[0]


def test_skills_only_when_the_entry_names_them():
    add = {"kind": "add_skill", "field": "skill", "index": None, "before": ""}
    out, dropped = kept(
        s(**add, after="Airflow"),  # named in a bullet, missing from the list: kept
        s(**add, after="spark"),  # already listed
        s(**add, after="Kubernetes"),  # not named anywhere
        s(**add, after="Airflow"),  # a repeat: skipped, not a failure
    )
    assert [x.after for x in out] == ["Airflow"] and dropped == 2


def test_a_rewrite_and_a_question_may_target_one_bullet():
    question = s(kind="question", after="Ho migrato [[quanti TB]] su Databricks.")
    out, dropped = kept(s(), question, s())
    assert [x.kind for x in out] == ["rewrite", "question"] and dropped == 0


def test_an_empty_summary_may_be_drafted_from_the_profile():
    summary = {"entry_id": None, "field": "summary", "index": None, "before": ""}
    good = "Senior Data Engineer: ho migrato il data lake su Databricks."
    out, _ = kept(s(**summary, after=good))
    assert out[0].section == "profile" and out[0].entry_id is None
    invented = "Data Engineer con 8 anni di esperienza in Google."
    assert kept(s(**summary, after=invented))[0] == []


def test_german_nouns_are_not_mistaken_for_names():
    de = {
        "experiences": [
            {
                "id": "e1",
                "bullets": [
                    "Ich war für die Migration der Plattform und die Datenpipelines zuständig."
                ],
            }
        ]
    }
    out, _ = kept(
        s(
            before=de["experiences"][0]["bullets"][0],
            after="Migration der Plattform und der Datenpipelines geleitet, mit dem Team.",
        ),
        profile=_p(de),
    )
    assert len(out) == 1


def test_the_prompt_carries_ids_and_bullet_indexes():
    prompt = user_prompt(_p())
    assert prompt.startswith("<profile>") and '"id": "e1"' in prompt
    assert '"index": 1' in prompt
    assert REVIEW_SCHEMA["required"] == ["suggestions"]


# --- API ----------------------------------------------------------------------------------------


def _engine(monkeypatch, answer=None, error=None, delay=0.0):
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
        calls.append({"system": system, "prompt": prompt, "schema": schema})
        time.sleep(delay)
        if error:
            raise ai.AiError(error)
        return answer

    monkeypatch.setattr(ai, "run", run)
    return calls


def _settled():
    for _ in range(300):
        review = client.get("/api/profile/review").json()["review"]
        if review and review["status"] != "running":
            return review
        time.sleep(0.01)
    raise AssertionError("review never finished")


def test_review_runs_on_the_saved_profile_and_keeps_states(monkeypatch):
    calls = _engine(
        monkeypatch, answer={"suggestions": [s(), s(after="Ho usato K8s.")]}
    )
    assert client.post("/api/profile/review").status_code == 400  # nothing saved yet
    client.put("/api/profile", json={"profile": PROFILE})
    r = client.post("/api/profile/review", headers={"Accept-Language": "en"})
    assert r.status_code == 202
    review = _settled()
    assert review["status"] == "ready" and review["dropped"] == 1
    assert "reason" in calls[0]["system"] and "English" in calls[0]["system"]
    (only,) = review["suggestions"]
    assert only["state"] == "open"
    r = client.patch(
        f"/api/profile/review/suggestions/{only['id']}", json={"state": "dismissed"}
    )
    assert r.json()["review"]["suggestions"][0]["state"] == "dismissed"
    assert (
        client.patch(
            "/api/profile/review/suggestions/nope", json={"state": "applied"}
        ).status_code
        == 404
    )
    # Start over removes reviews with the profile.
    client.delete("/api/profile")
    assert client.get("/api/profile/review").json() == {"review": None, "earlier": None}


def test_review_failure_and_cancel(monkeypatch):
    client.put("/api/profile", json={"profile": PROFILE})
    _engine(monkeypatch, error="boom")
    client.post("/api/profile/review")
    review = _settled()
    assert review["status"] == "failed" and review["error"] == "boom"

    _engine(monkeypatch, answer={"suggestions": []}, delay=0.3)
    client.post("/api/profile/review")
    assert client.post("/api/profile/review").status_code == 409  # one at a time
    assert client.delete("/api/profile/review").json()["review"]["status"] == "failed"
    # The cancelled run is hidden: the latest visible review is the failed one.
    time.sleep(0.4)
    assert client.get("/api/profile/review").json()["review"]["error"] == "boom"


def test_a_garbled_answer_fails_the_review(monkeypatch):
    client.put("/api/profile", json={"profile": PROFILE})
    _engine(monkeypatch, answer={"nope": 1})
    client.post("/api/profile/review", headers={"Accept-Language": "en"})
    review = _settled()
    assert review["status"] == "failed" and "unexpected shape" in review["error"]


def test_a_review_interrupted_by_a_restart_says_so(monkeypatch):
    client.put("/api/profile", json={"profile": PROFILE})
    rev = db.latest_profile()["id"]
    db.create_review(rev, "claude", None)
    db.fail_running_reviews()
    r = client.get("/api/profile/review", headers={"Accept-Language": "en"})
    assert (
        r.json()["review"]["error"] == "Review interrupted: the server was restarted."
    )


def test_no_review_while_an_import_draft_waits(monkeypatch):
    client.put("/api/profile", json={"profile": PROFILE})
    doc = db.add_document("a" * 64, "cv.md", "text/markdown", "documents/a", "x")
    draft = db.create_draft(doc, "claude", None)
    db.update_draft(draft, status="ready", data="{}")
    assert client.post("/api/profile/review").status_code == 409


def test_open_suggestions_outlive_a_failed_or_interrupted_review(monkeypatch):
    client.put("/api/profile", json={"profile": PROFILE})
    _engine(
        monkeypatch,
        answer={
            "suggestions": [
                s(),
                s(
                    index=1,
                    before=PROFILE["experiences"][0]["bullets"][1],
                    after="Costi del cluster -30% con Spark e Airflow.",
                ),
            ]
        },
    )
    client.post("/api/profile/review")
    first = _settled()
    assert first["status"] == "ready"
    assert (
        client.get("/api/profile/review").json()["earlier"] is None
    )  # nothing older to show

    # A new review fails: the finished one comes back as "earlier", states and all.
    _engine(monkeypatch, error="boom")
    client.post("/api/profile/review")
    _settled()
    body = client.get("/api/profile/review").json()
    assert body["review"]["status"] == "failed"
    assert body["earlier"]["id"] == first["id"]
    # Its suggestions can still be applied or dismissed.
    sid = first["suggestions"][0]["id"]
    body = client.patch(
        f"/api/profile/review/suggestions/{sid}", json={"state": "applied"}
    ).json()
    assert body["earlier"]["suggestions"][0]["state"] == "applied"

    # A restart during a review: the same.
    db.create_review(db.latest_profile()["id"], "claude", None)
    db.fail_running_reviews()
    body = client.get("/api/profile/review").json()
    assert (
        body["review"]["error"] == "Revisione interrotta: il server è stato riavviato."
    )
    assert body["earlier"]["id"] == first["id"]

    # A review that finishes replaces them.
    _engine(monkeypatch, answer={"suggestions": []})
    client.post("/api/profile/review")
    assert _settled()["status"] == "ready"
    assert client.get("/api/profile/review").json()["earlier"] is None
