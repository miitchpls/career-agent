import pytest
from fastapi.testclient import TestClient

from career_agent import boards, db
from career_agent.app import app
from career_agent.applications import posting_key

client = TestClient(app)

JOB_ID = "4458087343"
CANONICAL = f"https://www.linkedin.com/jobs/view/{JOB_ID}"


@pytest.fixture(autouse=True)
def no_board(monkeypatch):
    """Adding an application never reads a board."""
    monkeypatch.setattr(
        boards, "open_linkedin", lambda *_: pytest.fail("asked LinkedIn")
    )
    monkeypatch.setattr(boards, "open_indeed", lambda *_: pytest.fail("asked Indeed"))


def add(**kw):
    return client.post("/api/applications", json={"title": "Backend Engineer"} | kw)


def test_posting_keys_follow_the_posting_not_the_link():
    assert (
        posting_key(f"https://it.linkedin.com/jobs/view/backend-{JOB_ID}?trk=x")
        == f"linkedin:{JOB_ID}"
    )
    assert (
        posting_key(f"linkedin.com/jobs/search?currentJobId={JOB_ID}")
        == f"linkedin:{JOB_ID}"
    )
    assert (
        posting_key("https://it.indeed.com/jobs?vjk=0123456789abcdef")
        == "indeed:0123456789abcdef"
    )
    assert (
        posting_key("https://www.careers.acme.ch/jobs/42/") == "careers.acme.ch/jobs/42"
    )
    assert posting_key("  ") is None


def test_an_application_from_another_site_keeps_its_text():
    r = add(
        url="https://careers.acme.ch/jobs/42",
        company=" Acme ",
        description="We build Go services.",
        status="saved",
    )
    assert r.status_code == 200 and r.json()["created"] is True
    a = r.json()["application"]
    assert (a["site"], a["company"], a["posting"]["description"]) == (
        "other",
        "Acme",
        "We build Go services.",
    )
    assert [e["status"] for e in a["events"]] == ["saved"]
    # The same posting again: the one tracked comes back.
    again = add(url="careers.acme.ch/jobs/42?utm=x")
    assert (
        again.json()["created"] is False
        and again.json()["application"]["id"] == a["id"]
    )
    # Without a link, nothing to match: each is its own.
    assert add().json()["created"] and add().json()["created"]


def test_a_board_posting_takes_the_saved_text_and_score():
    db.save_job(
        {
            "url": CANONICAL,
            "site": "linkedin",
            "title": "Platform Engineer",
            "company": "Helvetia",
            "location": "Basel",
            "work_mode": "hybrid",
            "description": "Kubernetes at scale.",
        }
    )
    sid = db.create_score(CANONICAL, None, "x", "claude", None)
    db.update_score(sid, status="ready", value=4.2, decision="apply")
    a = add(url=f"https://it.linkedin.com/jobs/view/platform-{JOB_ID}").json()[
        "application"
    ]
    assert a["url"] == CANONICAL and a["site"] == "linkedin"
    assert (a["company"], a["location"]) == ("Helvetia", "Basel")
    assert a["posting"]["description"] == "Kubernetes at scale."
    assert a["score"] == {"value": 4.2, "decision": "apply"}


def test_pasted_text_for_an_unsaved_board_posting_is_saved_as_a_posting():
    a = add(url=CANONICAL, company="Acme", description="Go and Kubernetes.").json()[
        "application"
    ]
    assert a["posting"]["description"] == "Go and Kubernetes."
    assert db.find_job("linkedin", JOB_ID, "CHF")["description"] == "Go and Kubernetes."


def test_status_notes_posting_and_removal():
    a = add(status="applied").json()["application"]
    patch = lambda **kw: client.patch(f"/api/applications/{a['id']}", json=kw)
    patch(status="interview")
    patch(status="interview")  # the same again: no new event
    b = patch(notes="Call with Anna", posting="  Pasted later.  ").json()
    assert [e["status"] for e in b["events"]] == ["applied", "interview"]
    assert (
        b["notes"] == "Call with Anna"
        and b["posting"]["description"] == "Pasted later."
    )
    assert client.patch("/api/applications/999", json={"notes": "x"}).status_code == 404
    assert (
        client.patch(
            f"/api/applications/{a['id']}", json={"status": "nope"}
        ).status_code
        == 422
    )
    assert client.delete(f"/api/applications/{a['id']}").json() == {"ok": True}
    assert client.get("/api/applications").json() == []
    assert client.delete(f"/api/applications/{a['id']}").status_code == 404


def test_the_list_is_newest_first():
    add(title="First")
    add(title="Second")
    assert [a["title"] for a in client.get("/api/applications").json()] == [
        "Second",
        "First",
    ]


def test_a_blank_title_is_refused():
    assert add(title="   ").status_code == 422


def test_pasted_text_fills_a_saved_posting_the_board_left_empty():
    db.save_job(
        {
            "url": CANONICAL,
            "site": "linkedin",
            "title": "Platform Engineer",
            "company": "Helvetia",
            "location": "Basel",
            "work_mode": "unknown",
            "description": None,
        }
    )
    add(url=CANONICAL, description="Kubernetes, hybrid in Basel.")
    assert (
        db.find_job("linkedin", JOB_ID, "CHF")["description"]
        == "Kubernetes, hybrid in Basel."
    )


def test_two_adds_of_one_posting_at_once_give_one_application(monkeypatch):
    from career_agent import applications

    first = add(url="https://careers.acme.ch/jobs/42").json()["application"]
    # The second request checked for a duplicate before the first one's insert landed:
    # its own insert then hits the unique key.
    real, calls = applications._by_key, []

    def late(key):
        calls.append(key)
        return None if len(calls) == 1 else real(key)

    monkeypatch.setattr(applications, "_by_key", late)
    r = add(url="careers.acme.ch/jobs/42")
    assert r.status_code == 200
    assert r.json()["created"] is False and r.json()["application"]["id"] == first["id"]


def test_the_cv_sent_is_kept():
    assert add(cv="modern").json()["application"]["cv"] == "modern"
    saved = add(status="saved").json()["application"]
    assert saved["cv"] is None
    # Sent later, with the CV generated meanwhile; a later one doesn't replace it.
    url = f"/api/applications/{saved['id']}"
    assert (
        client.patch(url, json={"status": "applied", "cv": "standard"}).json()["cv"]
        == "standard"
    )
    assert client.patch(url, json={"cv": "modern"}).json()["cv"] == "standard"
