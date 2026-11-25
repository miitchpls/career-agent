import json
import time

import pytest
from fastapi.testclient import TestClient

from career_agent import ai, db, profile
from career_agent.app import app, importer

client = TestClient(app)


@pytest.fixture(autouse=True)
def wait_for_imports():
    """A test's background import must end before the next test swaps the database."""
    yield
    for _ in range(500):
        if importer.idle():
            return
        time.sleep(0.01)
    raise AssertionError("an import thread outlived its test")


CV = """# Giulia Ferri
Data Engineer · Spark e piattaforme dati
giulia.ferri@example.com · github.com/gferri-demo

## Esperienze
Senior Data Engineer — Lumen Analytics, Bologna (ibrido), aprile 2022 – oggi
- Migrazione del data lake da Parquet a Delta Lake su Databricks.

## Formazione
Laurea magistrale in Informatica, Università di Bologna, 2017 – 2019

## Competenze
Python, Spark, Kafka
"""

RAW = {
    "name": "Giulia Ferri",
    "headline": "Data Engineer · Spark e piattaforme dati",
    "location": "",
    "email": "giulia.ferri@example.com",
    "links": [{"label": "GitHub", "url": "github.com/gferri-demo"}],
    "summary": "",
    "experiences": [
        {
            "role": "Senior Data Engineer",
            "company": "Lumen Analytics",
            "employment": None,
            "location": "Bologna",
            "location_type": "hybrid",
            "start": {"month": 4, "year": 2022},
            "end": None,
            "current": True,
            "bullets": [
                "Migrazione del data lake da Parquet a Delta Lake su Databricks."
            ],
            "skills": ["Delta Lake"],
            "evidence": "Senior Data Engineer — Lumen Analytics, Bologna (ibrido)",
            "review": None,
        },
        {  # not in the CV: must be flagged
            "role": "CTO",
            "company": "Invented Corp",
            "employment": "fulltime",
            "location": "",
            "location_type": None,
            "start": {"month": 13, "year": 2015},
            "end": {"month": 1, "year": 2016},
            "current": True,
            "bullets": [],
            "skills": [],
            "evidence": "CTO at Invented Corp leading 200 engineers",
            "review": None,
        },
    ],
    "education": [
        {
            "school": "Università di Bologna",
            "degree": "Laurea magistrale",
            "field": "Informatica",
            "start": {"month": None, "year": 2017},
            "end": {"month": None, "year": 2019},
            "grade": "",
            "activities": "",
            "description": "",
            "skills": [],
            "evidence": "Laurea magistrale in Informatica, Università di Bologna",
            "review": "Mancano i mesi.",
        }
    ],
    "skills": [
        {"name": "Python", "inferred": True},  # named in the CV: not inferred
        {"name": "Spark", "inferred": False},
        {"name": "AWS", "inferred": True},
    ],
    "languages": [{"name": "Inglese", "level": "C1", "certificate": ""}],
    "projects": [],
    "certifications": [],
}


# --- Conversion -------------------------------------------------------------------------------


def test_to_profile_converts_and_flags_what_the_cv_does_not_say():
    p = profile.to_profile(RAW, CV).dump()
    real, invented = p["experiences"]
    assert real["start"] == {"month": 3, "year": 2022}  # 1-12 -> 0-11
    assert real["current"] and real["end"] is None
    assert real["locationType"] == "hybrid"
    assert real["review"] is None
    assert (
        invented["review"]
        == "Non ho trovato questo dato nel CV: controlla che sia giusto."
    )
    assert invented["start"] == {"month": None, "year": 2015}  # month 13 dropped
    assert not invented["current"]  # it has an end date
    assert p["education"][0]["review"] == "Mancano i mesi."
    skills = {s["name"]: s["inferred"] for s in p["skills"]}
    assert skills == {"Python": False, "Spark": False, "AWS": True, "Delta Lake": False}
    assert p["links"][0]["url"] == "https://github.com/gferri-demo"
    assert len({e["id"] for e in p["experiences"]}) == 2


def test_to_profile_reads_phone_context_categories_awards_and_interests():
    raw = {
        **RAW,
        "phone": " +39 333 000 0000 ",
        "experiences": [{**RAW["experiences"][0], "context": "Scale-up, 80 people"}],
        "skills": [{"name": "Spark", "inferred": False, "category": "Data"}],
        "awards": [
            {
                "title": "Premio tesi",
                "issuer": "Università di Bologna",
                "date": {"month": None, "year": 2019},
                "description": "",
                "evidence": "Laurea magistrale in Informatica",
                "review": None,
            },
            {"title": "", "issuer": "x"},
        ],
        "interests": ["Vela", " ", "Vela"],
    }
    p = profile.to_profile(raw, CV)
    assert p.phone == "+39 333 000 0000"
    assert p.experiences[0].context == "Scale-up, 80 people"
    assert p.skills[0].category == "Data"
    # Its title isn't in the CV: flagged like any entry the CV doesn't hold.
    assert [a.title for a in p.awards] == ["Premio tesi"] and p.awards[0].review
    assert p.awards[0].date.year == 2019
    assert p.interests == ["Vela"]


def test_evidence_matching_ignores_case_punctuation_and_spacing():
    raw = {
        **RAW,
        "experiences": [
            {
                **RAW["experiences"][0],
                "evidence": "senior  data engineer lumen ANALYTICS",
            }
        ],
    }
    assert profile.to_profile(raw, CV).experiences[0].review is None


def test_to_profile_survives_garbage():
    p = profile.to_profile(
        {"experiences": "nope", "skills": [None, 3, {"name": ""}]}, CV
    )
    assert p.experiences == [] and p.skills == []


def test_extraction_schema_is_strict():
    """Both CLIs validate the answer against it; OpenAI's strict mode needs every
    property required and no extra properties, at every level."""

    def check(node):
        if isinstance(node, dict):
            if node.get("type") == "object":
                assert node["additionalProperties"] is False
                assert set(node["required"]) == set(node["properties"])
            for v in node.values():
                check(v)
        elif isinstance(node, list):
            for v in node:
                check(v)

    check(profile.EXTRACTION_SCHEMA)


# --- Reading uploads --------------------------------------------------------------------------


def _pdf(text: str) -> bytes:
    """A one-page PDF with `text` in Helvetica, built by hand."""
    stream = f"BT /F1 12 Tf 50 750 Td ({text}) Tj ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
            b"/Resources << /Font << /F1 5 0 R >> >> >>"
        ),
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = b"%PDF-1.4\n", []
    for i, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objects) + 1,
        xref,
    )
    return out


def test_read_upload_reads_pdf_markdown_and_paste():
    words = "Giulia Ferri Senior Data Engineer at Lumen Analytics since 2022 in Bologna"
    assert profile.read_upload("cv.pdf", _pdf(words))[:2] == ("application/pdf", ".pdf")
    assert words in profile.read_upload("cv.pdf", _pdf(words))[2]
    assert profile.read_upload("cv.md", CV.encode())[0] == "text/markdown"
    assert profile.read_upload(None, CV.encode("cp1252", "ignore"))[2].startswith(
        "# Giulia"
    )


@pytest.mark.parametrize(
    ("name", "data", "message"),
    [
        ("cv.docx", b"PK..." * 20, "Formato non supportato"),
        ("cv.md", b"troppo corto", "troppo corto"),
        ("scan.pdf", _pdf(""), "non contiene testo selezionabile"),
        ("broken.pdf", b"%PDF-1.4 garbage" * 10, "Non riesco a leggere"),
        ("cv.txt", b"x " * 60_000, "troppo lungo"),
    ],
)
def test_read_upload_refuses_with_a_reason(name, data, message):
    with pytest.raises(ValueError, match=message):
        profile.read_upload(name, data)


# --- Profile API ------------------------------------------------------------------------------

P = {"name": "Giulia Ferri", "skills": [{"name": "Python"}], "experiences": []}


def test_profile_starts_empty_and_saves_revisions():
    assert client.get("/api/profile").json() == {
        "profile": None,
        "saved_at": None,
        "draft": None,
    }
    r = client.put("/api/profile", json={"profile": P})
    assert r.status_code == 200
    body = r.json()
    assert body["profile"]["name"] == "Giulia Ferri"
    assert body["profile"]["skills"] == [
        {"name": "Python", "inferred": False, "category": ""}
    ]
    assert body["saved_at"]
    client.put("/api/profile", json={"profile": P})  # unchanged: no new revision
    client.put("/api/profile", json={"profile": {**P, "name": "Giulia F."}})
    with db.connect() as conn:
        assert conn.execute("SELECT count(*) FROM profile_revisions").fetchone()[0] == 2
    assert client.get("/api/profile").json()["profile"]["name"] == "Giulia F."


def test_profile_is_validated():
    bad = {"languages": [{"id": "x", "name": "Inglese", "level": "C9"}]}
    assert client.put("/api/profile", json={"profile": bad}).status_code == 422


# --- Import flow --------------------------------------------------------------------------


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
        calls.append({"model": model, "system": system, "prompt": prompt})
        time.sleep(delay)
        if error:
            raise ai.AiError(error)
        return answer

    monkeypatch.setattr(ai, "run", run)
    return calls


def _settled():
    for _ in range(200):
        state = client.get("/api/profile").json()
        if not state["draft"] or state["draft"]["status"] != "running":
            return state
        time.sleep(0.01)
    raise AssertionError("import never finished")


def test_import_drafts_then_confirm_saves(monkeypatch):
    calls = _engine(monkeypatch, answer=RAW)
    r = client.post(
        "/api/profile/import", data={"text": CV}, headers={"Accept-Language": "en"}
    )
    assert r.status_code == 202
    assert r.json()["draft"]["status"] in ("running", "ready")
    state = _settled()
    draft = state["draft"]
    assert draft["status"] == "ready" and draft["provider"] == "claude"
    assert state["profile"] is None  # nothing saved before the user confirms
    assert "<cv>" in calls[0]["prompt"] and "note in English" in calls[0]["system"]
    invented = draft["data"]["experiences"][1]
    assert (
        invented["review"] == "I couldn't find this in the CV: check that it's right."
    )  # en

    edited = {**draft["data"], "headline": "Data Engineer"}
    assert client.put("/api/profile/draft", json={"profile": edited}).status_code == 200
    assert (
        client.get("/api/profile").json()["draft"]["data"]["headline"]
        == "Data Engineer"
    )

    r = client.post("/api/profile/draft/confirm", json={"profile": edited})
    assert r.status_code == 200
    assert r.json()["profile"]["headline"] == "Data Engineer"
    assert r.json()["draft"] is None
    rev = db.latest_profile()
    assert rev["source"] == "import" and rev["document_id"]
    # The original upload is kept
    doc = db.get_document(rev["document_id"])
    assert (db.data_dir() / doc["path"]).read_text() == CV


def test_upload_a_file(monkeypatch):
    _engine(monkeypatch, answer=RAW)
    r = client.post(
        "/api/profile/import", files={"file": ("cv.md", CV.encode(), "text/markdown")}
    )
    assert r.status_code == 202
    assert _settled()["draft"]["filename"] == "cv.md"


def test_failed_import_can_be_retried(monkeypatch):
    _engine(monkeypatch, error="Claude Code non ha completato l'estrazione: boom")
    client.post("/api/profile/import", data={"text": CV})
    draft = _settled()["draft"]
    assert draft["status"] == "failed" and "boom" in draft["error"]
    _engine(monkeypatch, answer=RAW)
    assert client.post("/api/profile/draft/retry").status_code == 202
    assert _settled()["draft"]["status"] == "ready"


def test_import_errors_are_explained(monkeypatch):
    r = client.post(
        "/api/profile/import", data={"text": CV}
    )  # no engine on this machine
    assert r.status_code == 400 and "Nessun motore AI collegato" in r.json()["detail"]
    _engine(monkeypatch, answer=RAW)
    r = client.post(
        "/api/profile/import",
        files={"file": ("cv.docx", b"x" * 100, "application/msword")},
    )
    assert r.status_code == 400 and "Formato non supportato" in r.json()["detail"]
    assert client.post("/api/profile/import").status_code == 400
    assert (
        client.post("/api/profile/draft/confirm", json={"profile": P}).status_code
        == 404
    )


def test_one_import_at_a_time_and_cancel(monkeypatch):
    _engine(monkeypatch, answer=RAW, delay=0.3)
    assert client.post("/api/profile/import", data={"text": CV}).status_code == 202
    assert client.post("/api/profile/import", data={"text": CV}).status_code == 409
    assert client.delete("/api/profile/draft").json()["draft"] is None
    for _ in range(100):  # the run finishing late must not bring the draft back
        if not importer.running():
            break
        time.sleep(0.01)
    assert client.get("/api/profile").json()["draft"] is None


def test_restart_fails_running_drafts():
    doc = db.add_document("abc", None, "text/plain", "documents/abc.txt", CV)
    db.create_draft(doc, "claude", None)
    db.fail_running_drafts("interrotta")
    assert db.open_draft()["status"] == "failed"


def test_start_over_deletes_everything(monkeypatch):
    _engine(monkeypatch, answer=RAW)
    client.post("/api/profile/import", data={"text": CV})
    _settled()
    client.put("/api/profile", json={"profile": P})
    up = client.post(
        "/api/profile/files", files={"file": ("me.png", b"\x89PNG....", "image/png")}
    ).json()
    files = list(db.data_dir().rglob("*.*"))
    assert any(f.suffix == ".png" for f in files) and any(
        f.suffix == ".txt" for f in files
    )
    assert client.delete("/api/profile").json() == {
        "profile": None,
        "saved_at": None,
        "draft": None,
    }
    assert client.get(up["url"]).status_code == 404
    assert not list((db.data_dir() / "documents").iterdir())
    assert not list((db.data_dir() / "profile-files").iterdir())


# --- Attachments ----------------------------------------------------------------------------


def test_files_are_served_back_safely():
    r = client.post(
        "/api/profile/files", files={"file": ("me.png", b"\x89PNG....", "image/png")}
    )
    assert r.status_code == 200
    got = client.get(r.json()["url"])
    assert got.content == b"\x89PNG...." and got.headers["content-type"] == "image/png"
    assert got.headers["content-disposition"].startswith("inline")
    page = client.post(
        "/api/profile/files", files={"file": ("x.html", b"<script>", "text/html")}
    ).json()
    got = client.get(page["url"])
    assert got.headers["content-type"] == "application/octet-stream"
    assert got.headers["content-disposition"].startswith("attachment")
    assert got.headers["x-content-type-options"] == "nosniff"
    assert client.get("/api/profile/files/nope").status_code == 404


# --- AI engines -------------------------------------------------------------------------------


def _providers(claude_connected=True):
    return [
        ai.Provider(
            id="claude",
            name="Claude Code",
            command="claude",
            install_url="",
            login="claude",
            installed=True,
            connected=claude_connected,
            plan="Pro",
            path="/x/claude",
            models=list(ai.CLAUDE_MODELS),
        ),
        ai.Provider(
            id="codex",
            name="Codex",
            command="codex",
            install_url="",
            login="codex login",
            installed=True,
            connected=True,
            plan="ChatGPT",
            path="/x/codex",
            models=[ai.Model("gpt-6-luna", "GPT-6-Luna")],
        ),
    ]


def test_engine_choice(monkeypatch):
    monkeypatch.setattr(ai, "detect", _providers)
    body = client.get("/api/ai").json()
    assert [p["id"] for p in body["providers"]] == ["claude", "codex"]
    assert "path" not in body["providers"][0]  # the app may be reachable on the LAN
    assert body["active"] == {"provider": "claude", "model": None}  # first connected
    assert (
        client.put("/api/ai", json={"provider": "codex", "model": "nope"}).status_code
        == 400
    )
    assert client.put("/api/ai", json={"provider": "gemini"}).status_code == 400
    body = client.put(
        "/api/ai", json={"provider": "codex", "model": "gpt-6-luna"}
    ).json()
    assert body["active"] == {"provider": "codex", "model": "gpt-6-luna"}


def test_a_chosen_engine_that_signed_out_is_reported():
    db.set_setting("ai", json.dumps({"provider": "claude", "model": None}))
    with pytest.raises(ai.AiError, match="claude"):
        ai.resolve(_providers(claude_connected=False))
    db.set_setting(
        "ai", json.dumps({"provider": "gemini", "model": None})
    )  # gone: fall back
    assert ai.resolve(_providers())[0].id == "claude"


def test_claude_runner_reads_structured_output(monkeypatch):
    seen = {}

    def fake(args, stdin, cwd, on_start, name):
        seen["args"] = args
        return 0, json.dumps({"is_error": False, "structured_output": {"w": "ok"}}), ""

    monkeypatch.setattr(ai, "_communicate", fake)
    assert ai._run_claude(
        "/x/claude", "sys", "cv", {"type": "object"}, "opus", None
    ) == {"w": "ok"}
    args = seen["args"]
    assert (
        args[args.index("--tools") + 1] == ""
    )  # no tools: the CV can't trigger anything
    assert "--safe-mode" in args and args[args.index("--model") + 1] == "opus"

    monkeypatch.setattr(
        ai,
        "_communicate",
        lambda *a: (1, json.dumps({"is_error": True, "result": "Not logged in"}), ""),
    )
    with pytest.raises(ai.AiError, match="Not logged in"):
        ai._run_claude("/x/claude", "sys", "cv", {}, None, None)


def test_codex_runner_reads_the_last_message(monkeypatch):
    def fake(args, stdin, cwd, on_start, name):
        out = args[args.index("-o") + 1]
        with open(out, "w") as f:
            f.write('{"w": "ok"}')
        assert "read-only" in args and "--ephemeral" in args
        return 0, "", ""

    monkeypatch.setattr(ai, "_communicate", fake)
    assert ai._run_codex("/x/codex", "sys", "cv", {"type": "object"}, None, None) == {
        "w": "ok"
    }
    monkeypatch.setattr(
        ai, "_communicate", lambda *a: (1, "", "ERROR: model not supported\n")
    )
    with pytest.raises(ai.AiError, match="model not supported"):
        ai._run_codex("/x/codex", "sys", "cv", {}, "x", None)


# --- Review fixes -------------------------------------------------------------------------


class _Proc:
    def __init__(self):
        self.terminated = False

    def poll(self):
        return None

    def terminate(self):
        self.terminated = True


def test_cancel_before_the_process_starts_still_kills_it(monkeypatch):
    _engine(monkeypatch, answer=RAW)
    gate, proc = __import__("threading").Event(), _Proc()

    def run(provider, model, system, prompt, schema, on_start=None):
        gate.wait(2)  # the user cancels before the CLI is spawned
        on_start(proc)
        raise ai.AiError("terminated")

    monkeypatch.setattr(ai, "run", run)
    assert client.post("/api/profile/import", data={"text": CV}).status_code == 202
    client.delete("/api/profile/draft")
    assert not importer.running()  # the slot is free at once
    gate.set()
    for _ in range(100):
        if proc.terminated:
            break
        time.sleep(0.01)
    assert proc.terminated
    assert client.get("/api/profile").json()["draft"] is None


def test_encrypted_and_broken_pdfs():
    from pypdf import PdfReader, PdfWriter

    words = "Giulia Ferri Senior Data Engineer at Lumen Analytics since 2022 in Bologna"
    writer = PdfWriter(clone_from=PdfReader(__import__("io").BytesIO(_pdf(words))))
    writer.encrypt(user_password="", owner_password="owner", algorithm="AES-256")
    out = __import__("io").BytesIO()
    writer.write(out)
    assert words in profile.read_upload("locked.pdf", out.getvalue())[2]
    # Whatever pypdf raises on a broken file is "can't read", never a 500
    truncated = _pdf(words)[:-60]
    for data in (truncated, b"%PDF-1.7\n" + b"\x00" * 400):
        try:
            profile.read_upload("bad.pdf", data)
        except ValueError:
            pass


def test_pdf_reader_crash_is_a_readable_error(monkeypatch):
    import pypdf

    def boom(*_a, **_k):
        raise RecursionError("deep")

    monkeypatch.setattr(pypdf, "PdfReader", boom)
    with pytest.raises(ValueError, match="Non riesco a leggere"):
        profile.read_upload("cv.pdf", _pdf("x"))


def test_interrupted_message_follows_the_reader_language():
    doc = db.add_document("abc", None, "text/plain", "documents/abc.txt", CV)
    db.create_draft(doc, "claude", None)
    db.fail_running_drafts()
    en = client.get("/api/profile", headers={"Accept-Language": "en"}).json()
    assert en["draft"]["error"] == "Import interrupted: the server was restarted."
    de = client.get("/api/profile", headers={"Accept-Language": "de"}).json()
    assert de["draft"]["error"].startswith("Import unterbrochen")


def test_a_draft_under_review_is_never_replaced(monkeypatch):
    _engine(monkeypatch, answer=RAW)
    client.post("/api/profile/import", data={"text": CV})
    _settled()
    edited = {**client.get("/api/profile").json()["draft"]["data"], "headline": "Mine"}
    client.put("/api/profile/draft", json={"profile": edited})
    assert client.post("/api/profile/draft/retry").status_code == 409
    r = client.post("/api/profile/import", data={"text": CV})
    assert r.status_code == 409 and "bozza" in r.json()["detail"]
    draft = client.get("/api/profile").json()["draft"]
    assert draft["status"] == "ready" and draft["data"]["headline"] == "Mine"


def test_same_file_twice_is_one_document_on_disk(monkeypatch):
    first = profile.store_upload("cv.md", CV.encode())
    second = profile.store_upload("cv.txt", CV.encode())
    assert first == second
    assert [p.name for p in (db.data_dir() / "documents").iterdir()] == [
        db.get_document(first)["path"].split("/")[-1]
    ]
    assert db.get_document(first)["filename"] == "cv.txt"


def test_replaced_files_are_deleted_after_a_while():
    def upload(name):
        return client.post(
            "/api/profile/files", files={"file": (name, b"\x89PNG....", "image/png")}
        ).json()

    old, kept, fresh = upload("old.png"), upload("kept.png"), upload("fresh.png")
    with db.connect() as conn:  # old and kept were uploaded an hour ago
        conn.execute(
            "UPDATE profile_files SET created_at = '2000-01-01T00:00:00+00:00' WHERE id IN (?, ?)",
            (old["id"], kept["id"]),
        )
    client.put("/api/profile", json={"profile": {**P, "photo": kept["url"]}})
    assert client.get(old["url"]).status_code == 404  # replaced: gone
    assert client.get(kept["url"]).status_code == 200  # in use
    assert (
        client.get(fresh["url"]).status_code == 200
    )  # just uploaded: a dialog may save it


def test_codex_runs_without_tools(monkeypatch):
    seen = {}

    def fake(args, stdin, cwd, on_start, name):
        seen["args"] = args
        with open(args[args.index("-o") + 1], "w") as f:
            f.write("{}")
        return 0, "", ""

    monkeypatch.setattr(ai, "_communicate", fake)
    ai._run_codex("/x/codex", "sys", "cv", {}, None, None)
    for feature in ("shell_tool", "unified_exec", "code_mode_host"):
        assert f"--disable={feature}" in seen["args"]
    assert 'web_search="disabled"' in seen["args"]


def test_choosing_an_engine_checks_the_clis_once(monkeypatch):
    calls = []
    monkeypatch.setattr(ai, "detect", lambda: calls.append(1) or _providers())
    assert client.put("/api/ai", json={"provider": "codex"}).status_code == 200
    assert len(calls) == 1


def test_cv_preferences_are_saved():
    assert client.get("/api/cv/preferences").json() == {
        "language": "job",
        "format": "auto",
        "style": "standard",
        "photo": "auto",
        "photoStyle": "rounded",
        "footer": "",
        "footerCountries": [],
        "locked": [],
        "guidance": "",
    }
    prefs = {
        "language": "de",
        "format": "a4",
        "style": "jake",
        "photo": "never",
        "photoStyle": "circle",
        "footer": " Work permit: B (Switzerland). ",
        "footerCountries": ["ch", "li", "ch"],
        "locked": ["summary", "headline"],
        "guidance": "  Never 'Senior' in the title. ",
    }
    saved = client.put("/api/cv/preferences", json=prefs).json()
    # Sections in their own order, the guidance trimmed.
    clean = {
        **prefs,
        "locked": ["headline", "summary"],
        "guidance": "Never 'Senior' in the title.",
        "footer": "Work permit: B (Switzerland).",
        "footerCountries": ["ch", "li"],
    }
    assert saved == clean
    assert client.get("/api/cv/preferences").json() == clean
    assert (
        client.put("/api/cv/preferences", json={**prefs, "style": "fancy"}).status_code
        == 422
    )
    db.set_setting("cv_prefs", '{"style": "removed-style"}')  # unreadable: defaults
    assert client.get("/api/cv/preferences").json()["style"] == "standard"
    bad = {**prefs, "footerCountries": ["Italy"]}
    assert client.put("/api/cv/preferences", json=bad).status_code == 422


def test_the_old_consent_setting_becomes_a_footer():
    """Italy's consent, for Italian postings ("auto", the old default) or for every CV."""
    from career_agent.profile import ITALIAN_CONSENT

    db.set_setting("cv_prefs", '{"style": "ats", "consent": "auto"}')
    got = client.get("/api/cv/preferences").json()
    assert got["footer"] == ITALIAN_CONSENT and got["footerCountries"] == ["it"]
    db.set_setting("cv_prefs", '{"consent": "always"}')
    assert client.get("/api/cv/preferences").json()["footerCountries"] == []
    db.set_setting("cv_prefs", '{"consent": "never"}')
    assert client.get("/api/cv/preferences").json()["footer"] == ""


def test_a_postings_old_consent_choice_becomes_its_footer_choice():
    from career_agent import profile

    url = "https://www.linkedin.com/jobs/view/1"
    db.set_setting(
        f"cv_overrides:{url}",
        '{"consent": "never", "photoStyle": "square", "style": "ats"}',
    )
    o = profile.cv_overrides(url)
    assert o.footer is False and o.style == "ats"
    db.set_setting(f"cv_overrides:{url}", '{"consent": "always"}')
    assert profile.cv_overrides(url).footer is True
    db.set_setting(f"cv_overrides:{url}", '{"consent": "auto"}')
    assert profile.cv_overrides(url).empty()


def test_pdf_internal_value_error_is_the_readable_message(monkeypatch):
    import pypdf

    def boom(*_a, **_k):
        raise ValueError("invalid literal for int() with base 10: b'x'")

    monkeypatch.setattr(pypdf, "PdfReader", boom)
    with pytest.raises(ValueError, match="Non riesco a leggere"):
        profile.read_upload("cv.pdf", _pdf("x"))
