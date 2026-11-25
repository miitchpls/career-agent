import time

import pytest
from fastapi.testclient import TestClient

from career_agent import ai, db, pdf, tailor
from career_agent.app import app, tailorer
from career_agent.profile import CvPrefs, Profile
from career_agent.routes.cv import _inline_photo, _pdf_name
from career_agent.tailor import classify, to_result

client = TestClient(app)

URL = "https://www.linkedin.com/jobs/view/4000000001"
JOB = {
    "url": URL,
    "site": "linkedin",
    "title": "Backend Engineer",
    "company": "Acme",
    "location": "Zürich, Switzerland",
    "work_mode": "hybrid",
    "description": (
        "We build event-driven services in Go and Kafka.\n"
        "Requirements: Kubernetes in production, REST APIs, Python.\n"
        "Nice to have: Terraform.\n"
        "Our platform runs on Kubernetes, managed with Terraform."
    ),
}
PROFILE = {
    "name": "Giulia Ferri",
    "headline": "Backend Engineer",
    "summary": "Backend engineer with 5 years on event-driven Python services.",
    "experiences": [
        {
            "id": "x1",
            "role": "Senior Backend Engineer",
            "company": "Lumen",
            "bullets": [
                "Built REST APIs in Python for 3M users.",
                "Ran the on-call rotation.",
                "Moved batch jobs to Kafka consumers.",
            ],
        },
        {
            "id": "x2",
            "role": "Developer",
            "company": "Borgo",
            "bullets": ["Wrote Go tools."],
        },
    ],
    "projects": [
        {"id": "q1", "name": "pgqueue", "description": "A job queue on PostgreSQL."},
        {"id": "q2", "name": "dotfiles", "description": "My shell setup."},
    ],
    "skills": [
        {"name": "Python", "category": "Languages"},
        {"name": "Go", "category": "Languages"},
        {"name": "Kafka"},
        {"name": "PostgreSQL"},
    ],
    "awards": [{"id": "w1", "title": "Hackathon winner"}],
}


@pytest.fixture(autouse=True)
def wait_for_cvs():
    """A test's background CV must end before the next test swaps the database."""
    yield
    for _ in range(500):
        if tailorer.idle():
            return
        time.sleep(0.01)
    raise AssertionError("a CV thread outlived its test")


def answer(**kw):
    base = {
        "keywords": [
            "Go",
            "Kafka",
            "Kubernetes",
            "REST APIs",
            "Python",
            "event-driven",
        ],
        "headline": "Backend Engineer · Go, Kafka",
        "summary": "Backend engineer with 5 years on event-driven Python services. Ships fast.",
        "competencies": ["Event-driven services", "REST APIs"],
        "experiences": [
            {
                "id": "e1",
                "bullets": [
                    {"index": 2, "text": "Moved batch jobs to **Kafka** consumers."},
                    {"index": 0, "text": "Built REST APIs in Python for 3M users."},
                ],
            },
            {"id": "e2", "bullets": [{"index": 0, "text": "Wrote Go tools."}]},
        ],
        "projects": [{"id": "p1", "description": "A job queue on PostgreSQL."}],
        "awards": [],
        "skills": [
            {"category": "Backend", "names": ["Go", "Kafka"]},
            {"category": "Languages", "names": ["Python"]},
        ],
        "changes": ["Moved the Kafka bullet first."],
    }
    return base | kw


def result(raw=None, prefs=None, language="en", profile=None):
    p = Profile.model_validate(profile or PROFILE)
    raw = answer() if raw is None else raw
    return to_result(raw, JOB, p, prefs or CvPrefs(), language)


def test_keywords_are_the_postings_own_and_classified_without_ai():
    r = result(answer(keywords=["Go", "Kubernetes", "event-driven", "Rust", "Go"]))
    kinds = {k.term: k.kind for k in r.keywords}
    # Rust isn't in the posting; duplicates go.
    assert kinds == {"Go": "listed", "Kubernetes": "gap", "event-driven": "supported"}
    p = Profile.model_validate(PROFILE)
    from career_agent.facts import Known

    # "Java" is not in "JavaScript"; a listed skill inside a longer phrase backs it in part.
    assert classify("Kafka consumers", p, Known(p)) == "supported"
    assert classify("Java", p, Known(p)) == "gap"


def test_bullets_stay_in_their_role_none_lost_and_moved_ones_marked():
    r = result()
    e1 = r.profile["experiences"][0]
    assert e1["bullets"] == [
        "Moved batch jobs to **Kafka** consumers.",
        "Built REST APIs in Python for 3M users.",
        "Ran the on-call rotation.",  # left out by the AI: kept, after
    ]
    # Titles, employers and the roles' order come from the profile.
    assert [e["role"] for e in r.profile["experiences"]] == [
        "Senior Backend Engineer",
        "Developer",
    ]
    # Moved up or rewritten; the bullet pushed down isn't.
    assert "Moved batch jobs to **Kafka** consumers." in r.marked
    assert "Built REST APIs in Python for 3M users." not in r.marked


def test_a_bullet_with_a_new_number_or_name_goes_back_to_the_profiles_wording():
    raw = answer(
        experiences=[
            {
                "id": "e1",
                "bullets": [
                    {"index": 0, "text": "Built REST APIs in Python for 5M users."},
                    {"index": 1, "text": "Ran on-call for services on Kubernetes."},
                    {"index": 2, "text": "Moved batch jobs to Kafka consumers on AWS."},
                ],
            }
        ]
    )
    r = result(raw)
    assert (
        r.profile["experiences"][0]["bullets"] == PROFILE["experiences"][0]["bullets"]
    )
    terms = {tuple(w.terms) for w in r.warnings if w.kind == "bullet_restored"}
    assert terms == {("5M",), ("Kubernetes",), ("AWS",)}


def test_a_gap_keyword_never_enters_a_text_that_lacked_it():
    # Lowercase, so not name-shaped: only the gap check catches it.
    raw = answer(
        experiences=[
            {
                "id": "e1",
                "bullets": [
                    {
                        "index": 1,
                        "text": "ran the on-call rotation, terraform included.",
                    }
                ],
            }
        ],
        keywords=["Terraform"],
    )
    r = result(raw)
    assert r.profile["experiences"][0]["bullets"][0] == "Ran the on-call rotation."
    assert r.warnings[0].terms == ["Terraform"]


def test_summary_loses_only_the_sentences_that_invent():
    raw = answer(
        summary="Backend engineer with 5 years on event-driven Python services. Led 12 engineers on GCP."
    )
    r = result(raw)
    assert (
        r.profile["summary"]
        == "Backend engineer with 5 years on event-driven Python services."
    )
    assert [w.kind for w in r.warnings] == ["summary_trimmed"]
    # Nothing left: the profile's own.
    r = result(answer(summary="Led 12 engineers on GCP."))
    assert r.profile["summary"] == PROFILE["summary"]


def test_headline_keeps_the_profiles_when_it_inflates():
    assert result().profile["headline"] == "Backend Engineer · Go, Kafka"
    # "Senior" is backed by a role's title.
    r = result(answer(headline="Senior Backend Engineer"))
    assert r.profile["headline"] == "Senior Backend Engineer"
    for inflated in (
        "Principal Backend Engineer",
        "Backend Engineer · Kubernetes",
        "x" * 81,
    ):
        r = result(answer(headline=inflated))
        assert r.profile["headline"] == "Backend Engineer"
        assert r.warnings[-1].kind == "headline_kept"


def test_competencies_drop_what_the_profile_cant_back():
    r = result(
        answer(competencies=["REST APIs", "Kubernetes operations", "Kafka", "Kafka"])
    )
    assert r.competencies == ["REST APIs", "Kafka"]
    assert [w.text for w in r.warnings] == ["Kubernetes operations"]


def test_projects_awards_and_skills():
    r = result(
        answer(
            projects=[
                {"id": "p2", "description": "My shell setup."},
                {"id": "p9", "description": "?"},
                {"id": "p1", "description": "A job queue on PostgreSQL with 1k stars."},
            ],
            awards=["a1", "a1", "a7"],
        )
    )
    assert [x["name"] for x in r.profile["projects"]] == ["dotfiles", "pgqueue"]
    assert r.profile["projects"][1]["description"] == "A job queue on PostgreSQL."
    assert [a["title"] for a in r.profile["awards"]] == ["Hackathon winner"]
    # Every skill once: the AI's lines, then the one it forgot.
    assert [(s["name"], s["category"]) for s in r.profile["skills"]] == [
        ("Go", "Backend"),
        ("Kafka", "Backend"),
        ("Python", "Languages"),
        ("PostgreSQL", ""),
    ]
    # No lines at all: the profile's.
    r = result(answer(skills=[]))
    assert [s["name"] for s in r.profile["skills"]] == [
        "Python",
        "Go",
        "Kafka",
        "PostgreSQL",
    ]


def test_locked_sections_are_copied_as_they_are():
    prefs = CvPrefs(locked=["headline", "summary", "experience", "projects", "skills"])
    r = result(prefs=prefs)
    p = Profile.model_validate(PROFILE).dump()
    for key in ("headline", "summary", "experiences", "projects", "skills"):
        assert r.profile[key] == p[key]
    assert r.marked == []


def test_coverage_counts_the_keywords_the_cv_holds():
    r = result()
    missing = [k.term for k in r.keywords if not k.in_cv]
    assert missing == ["Kubernetes"]
    assert r.coverage == round(100 * 5 / 6)


def test_wrong_shape_is_an_error():
    for bad in ({}, answer(keywords="Go"), answer(experiences=None)):
        with pytest.raises((KeyError, TypeError)):
            result(bad)


def test_evaluation_only_from_this_profile_revisions_finished_score():
    score = {
        "status": "ready",
        "revision_id": 3,
        "result": {
            "requirements": [
                {
                    "requirement": "Go",
                    "importance": "critical",
                    "match": "strong",
                    "profileEvidence": "Wrote Go tools.",
                }
            ],
            "gaps": [{"requirement": "Kubernetes", "risk": "r", "mitigation": "m"}],
        },
    }
    ev = tailor.evaluation_for(score, 3)
    assert ev["requirements"][0]["profile_evidence"] == "Wrote Go tools."
    assert ev["gaps"] == [{"requirement": "Kubernetes", "mitigation": "m"}]
    assert tailor.evaluation_for(score, 4) is None
    assert tailor.evaluation_for({**score, "status": "failed"}, 3) is None


# --- Through the API -----------------------------------------------------------------------------


def _engine(monkeypatch, raw=None, error=None, delay=0.0):
    fake = ai.Provider(
        id="claude",
        name="Claude Code",
        command="claude",
        install_url="",
        login="claude",
        installed=True,
        connected=True,
        path="/bin/claude",
    )
    monkeypatch.setattr(ai, "detect", lambda: [fake])
    calls = []

    def run(provider, model, system, prompt, schema, on_start=None):
        calls.append({"system": system, "prompt": prompt})
        time.sleep(delay)
        if error:
            raise ai.AiError(error)
        return raw

    monkeypatch.setattr(ai, "run", run)
    return calls


def _settled():
    for _ in range(300):
        c = client.get("/api/jobs/cv", params={"url": URL}).json()["cv"]
        if c and c["status"] != "running":
            return c
        time.sleep(0.01)
    raise AssertionError("CV never finished")


def test_generate_a_cv_and_see_it_go_stale(monkeypatch):
    assert (
        client.post("/api/jobs/cv", json={"url": URL, "language": "en"}).status_code
        == 404
    )
    db.save_many([JOB], "geo:1", "Zurigo", "go")
    r = client.post("/api/jobs/cv", json={"url": URL, "language": "en"})
    assert r.status_code == 400  # no profile yet
    client.put("/api/profile", json={"profile": PROFILE})
    calls = _engine(monkeypatch, answer())
    r = client.post("/api/jobs/cv", json={"url": URL, "language": "it"})
    assert r.status_code == 202
    c = _settled()
    assert c["status"] == "ready" and c["version"] == 1 and not c["stale"]
    assert c["language"] == "it" and "Italian" in calls[0]["system"]
    assert "<posting>" in calls[0]["prompt"] and "Giulia" not in calls[0]["prompt"]
    assert c["result"]["coverage"] == 83
    # The list knows which postings have one.
    items = client.post("/api/jobs", json={}).json()["items"]
    assert items[0]["has_cv"] is True
    # A new revision of the profile makes it stale; the CV settings that steer it too.
    client.put("/api/profile", json={"profile": {**PROFILE, "summary": "Changed."}})
    assert client.get("/api/jobs/cv", params={"url": URL}).json()["cv"]["stale"]
    # A second one is version 2.
    client.post("/api/jobs/cv", json={"url": URL, "language": "it"})
    assert _settled()["version"] == 2


def test_a_failed_run_keeps_the_last_cv(monkeypatch):
    db.save_many([JOB], "geo:1", "Zurigo", "go")
    client.put("/api/profile", json={"profile": PROFILE})
    _engine(monkeypatch, answer())
    client.post("/api/jobs/cv", json={"url": URL, "language": "en"})
    _settled()
    _engine(monkeypatch, {"keywords": "nope"})
    client.post("/api/jobs/cv", json={"url": URL, "language": "en"})
    c = _settled()
    assert c["status"] == "failed" and c["error"]
    state = client.get("/api/jobs/cv", params={"url": URL}).json()
    assert state["earlier"]["status"] == "ready"


def test_the_score_steers_the_cv_only_for_this_profile(monkeypatch):
    db.save_many([JOB], "geo:1", "Zurigo", "go")
    saved = client.put("/api/profile", json={"profile": PROFILE}).json()
    rev = db.latest_profile()["id"]
    sid = db.create_score(URL, rev, "x", "claude", None)
    db.update_score(
        sid,
        status="ready",
        value=4.0,
        decision="apply",
        result='{"requirements": [], "gaps": [{"requirement": "Kubernetes", "risk": "", "mitigation": "Say so."}]}',
    )
    calls = _engine(monkeypatch, answer())
    client.post("/api/jobs/cv", json={"url": URL, "language": "en"})
    _settled()
    assert "<evaluation>" in calls[0]["prompt"] and "Say so." in calls[0]["prompt"]
    assert saved


def test_pdf_of_the_last_cv(monkeypatch):
    db.save_many([JOB], "geo:1", "Zurigo", "go")
    client.put("/api/profile", json={"profile": PROFILE})
    body = {"url": URL, "template": "standard", "format": "a4"}
    assert client.post("/api/jobs/cv/pdf", json=body).status_code == 404
    _engine(monkeypatch, answer())
    client.post("/api/jobs/cv", json={"url": URL, "language": "en"})
    _settled()
    seen = {}

    def fake(html, browser=None):
        seen["html"] = html
        return b"%PDF-1.7 fake"

    monkeypatch.setattr(pdf, "html_to_pdf", fake)
    r = client.post("/api/jobs/cv/pdf", json={**body, "consent": True})
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    assert 'filename="Giulia-Ferri-CV-Acme.pdf"' in r.headers["content-disposition"]
    assert "Event-driven services" in seen["html"]  # the competencies
    assert "<strong>Kafka</strong>" in seen["html"]
    assert "GDPR" in seen["html"]

    def none(html, browser=None):
        raise pdf.PdfError("no browser")

    monkeypatch.setattr(pdf, "html_to_pdf", none)
    assert client.post("/api/jobs/cv/pdf", json=body).status_code == 503


def test_pdf_names():
    assert _pdf_name("Josè Müller", "Acme S.p.A.") == "Jose-Muller-CV-Acme-S-p-A.pdf"
    assert _pdf_name("", None) == "CV.pdf"


def test_no_browser_is_a_clear_error(monkeypatch):
    monkeypatch.setattr(pdf, "find_browser", lambda: None)
    with pytest.raises(pdf.PdfError):
        pdf.html_to_pdf("<p>x</p>")


def test_acronyms_spelled_by_another_language_are_not_new():
    profile = {**PROFILE, "summary": "Worked on EU rules and AI tools."}
    raw = answer(summary="Ha lavorato su norme UE e strumenti di IA. Usa KI.")
    r = result(raw, profile=profile, language="it")
    assert r.profile["summary"] == "Ha lavorato su norme UE e strumenti di IA. Usa KI."
    # Not an acronym the profile has in any language.
    r = result(answer(summary="Lavora con la NASA."), profile=profile, language="it")
    assert r.profile["summary"] == profile["summary"]


def test_keyword_phrases_found_in_one_text_with_stems_and_compounds():
    from career_agent.facts import Corpus

    c = Corpus(
        [
            "Frontend developer (Vue) on a booking platform.",
            "End-to-end test automation (Cypress, TypeScript)",
            "Cloud & DevOps",
            "Event-driven architecture",
        ]
    )
    assert c.holds("front-end development")
    assert c.holds("end-to-end testing")
    # Every word in one same text, not scattered.
    assert not c.holds("cloud-native architectures")
    assert not c.holds("Java")


def test_a_translated_cv_keeps_translated_places_and_titles():
    """Profile in Italian, CV in English: "Milan" and "Developer" are translations, not
    facts; a product name the posting uses and the profile lacks still is."""
    profile = {
        **PROFILE,
        "headline": "Sviluppatore backend",
        "summary": "Sviluppatore con 5 anni di esperienza su servizi Python per il mercato.",
        "experiences": [
            {
                "id": "x1",
                "role": "Sviluppatore",
                "company": "Lumen",
                "bullets": ["Ho costruito API in Python per clienti a Milano."],
            }
        ],
    }
    raw = answer(
        headline="Backend Developer",
        experiences=[
            {
                "id": "e1",
                "bullets": [
                    {
                        "index": 0,
                        "text": "Built Python APIs for clients in Milan, Italy.",
                    }
                ],
            }
        ],
        competencies=["Kubernetes operations", "Python services"],
    )
    r = result(raw, profile=profile, language="en")
    assert r.profile["headline"] == "Backend Developer"
    assert r.profile["experiences"][0]["bullets"] == [
        "Built Python APIs for clients in Milan, Italy."
    ]
    # The posting names Kubernetes; the profile doesn't: still caught when translating.
    assert r.competencies == ["Python services"]


def test_a_tags_first_word_and_inflected_names():
    # Not among the keywords, so only the name check can catch it, on the first word too.
    r = result(answer(keywords=["Go"], competencies=["Terraform modules", "Python"]))
    assert r.competencies == ["Python"]
    # "APIs" is "API" in the plural: not a new fact.
    profile = {
        **PROFILE,
        "experiences": [
            {
                **PROFILE["experiences"][0],
                "bullets": ["Designed a REST API for billing."],
            }
        ],
    }
    raw = answer(
        experiences=[
            {
                "id": "e1",
                "bullets": [{"index": 0, "text": "Designed REST APIs for billing."}],
            }
        ]
    )
    r = result(raw, profile=profile)
    assert r.profile["experiences"][0]["bullets"] == ["Designed REST APIs for billing."]


def test_the_pdf_leaves_out_a_photo_no_longer_stored():

    p = Profile.model_validate({**PROFILE, "photo": "/api/profile/files/" + "a" * 32})
    assert _inline_photo(p).photo is None


def test_newest_playwright_build_by_number(monkeypatch, tmp_path):
    for n in ("999", "1105"):
        exe = tmp_path / f"chromium-{n}" / "chrome-linux" / "chrome"
        exe.parent.mkdir(parents=True)
        exe.write_text("")
    monkeypatch.setattr(pdf, "_NAMES", ())
    monkeypatch.setattr(pdf, "_APPS", ())
    monkeypatch.setattr(
        pdf, "_PLAYWRIGHT", (str(tmp_path / "chromium-*/chrome-linux*/chrome"),)
    )
    assert "chromium-1105" in pdf.find_browser()


def test_a_postings_own_cv_settings_change_only_its_cv(monkeypatch):
    db.save_many([JOB], "geo:1", "Zurigo", "go")
    client.put("/api/profile", json={"profile": PROFILE})
    client.put(
        "/api/cv/preferences", json={"guidance": "Never 'Senior'.", "style": "jake"}
    )
    assert (
        client.get("/api/jobs/cv/settings", params={"url": URL}).json()["style"] is None
    )
    body = {
        "url": URL,
        "settings": {
            "style": "ats",
            "locked": ["summary", "headline"],
            "notes": " Stress Go. ",
        },
    }
    saved = client.put("/api/jobs/cv/settings", json=body).json()
    assert (
        saved["style"] == "ats"
        and saved["locked"] == ["headline", "summary"]
        and saved["notes"] == "Stress Go."
    )
    # The defaults don't move.
    assert client.get("/api/cv/preferences").json()["style"] == "jake"
    from career_agent.profile import effective_cv_prefs

    p = effective_cv_prefs(URL)
    assert p.style == "ats" and p.locked == ["headline", "summary"]
    assert p.guidance == "Never 'Senior'.\n\nFor this posting only:\nStress Go."
    # The generation reads them: locked sections, the notes in the prompt.
    calls = _engine(monkeypatch, answer())
    client.post("/api/jobs/cv", json={"url": URL, "language": "en"})
    c = _settled()
    assert "Stress Go." in calls[0]["prompt"]
    assert c["result"]["profile"]["summary"] == PROFILE["summary"]
    # Changing them makes that CV stale; clearing them removes the row.
    client.put("/api/jobs/cv/settings", json={"url": URL, "settings": {}})
    assert db.get_setting(f"cv_overrides:{URL}") is None
    assert client.get("/api/jobs/cv", params={"url": URL}).json()["cv"]["stale"]
