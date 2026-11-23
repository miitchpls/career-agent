"""FastAPI app: JSON API + the built React UI (web/ -> static/)."""

import mimetypes
import re
import uuid
from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import ai, cv_render, db, geo
from .i18n import LOCALE, parse_accept_language, t
from .profile import (
    MAX_UPLOAD_MB,
    CvPrefs,
    Importer,
    Profile,
    cv_prefs,
    save_cv_prefs,
    store_upload,
)
from .query import Query
from .scraper import Runner

STATIC = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init()  # here rather than at import, so importing the app never touches the real DB
    db.fail_running_drafts()
    yield


async def use_locale(request: Request) -> None:
    """Messages in the UI's language. Async on purpose: it runs in the request's own
    context, which the (sync) endpoints then inherit."""
    LOCALE.set(parse_accept_language(request.headers.get("accept-language")))


app = FastAPI(
    title="career-agent", lifespan=lifespan, dependencies=[Depends(use_locale)]
)
runner = Runner()
importer = Importer()


class JobsRequest(BaseModel):
    query: Query = Field(default_factory=Query)
    sort: db.Sort = "posted"
    direction: db.Direction = "desc"
    offset: int = Field(0, ge=0)
    limit: int = Field(50, ge=1, le=200)
    as_of: int | None = Field(
        None, ge=0
    )  # from the first page; keeps later pages stable


@app.get("/api/places")
def places(q: str = ""):
    """City autocomplete, proxied so the browser never talks to third parties directly.
    Falls back to the offline catalogue when the geocoding API is unreachable."""
    results, offline = geo.search(q, lang=LOCALE.get())
    return {"places": results, "offline": offline}


@app.post("/api/jobs")
def jobs(req: JobsRequest):
    return db.search(
        req.query, req.sort, req.offset, req.limit, req.as_of, req.direction
    )


@app.post("/api/search")
def search(q: Query, force: bool = False):
    """Start a portal search right away (the user asked for it by pressing the button).

    `force`: rerun identical searches made in the last hours too («Aggiorna comunque»).
    """
    try:
        return runner.start(q, force=force)
    except (RuntimeError, ValueError) as e:
        raise HTTPException(400, str(e)) from e


class SaveRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    query: Query


@app.get("/api/saved")
def saved_list():
    return db.list_saved()


@app.post("/api/saved")
def saved_create(req: SaveRequest):
    row, created = db.save_search(req.name.strip(), req.query)
    return {**row, "created": created}


@app.delete("/api/saved/{saved_id}")
def saved_delete(saved_id: int):
    if not db.delete_saved(saved_id):
        raise HTTPException(404, t("saved_not_found"))
    return {"ok": True}


@app.post("/api/saved/{saved_id}/run")
def saved_run(saved_id: int, force: bool = False):
    """Run a saved search (from its «Esegui» button); `force` as in /api/search."""
    saved = db.get_saved(saved_id)
    if not saved:
        raise HTTPException(404, t("saved_not_found"))
    try:
        summary = runner.start(Query.model_validate(saved["query"]), force=force)
    except (RuntimeError, ValueError) as e:
        raise HTTPException(400, str(e)) from e
    db.mark_saved_run(saved_id)
    return summary


@app.post("/api/cancel")
def cancel():
    runner.cancel()
    return {"ok": True}


@app.get("/api/status")
def status():
    st = runner.state
    return {**asdict(st), "done_steps": st.done_steps, "total_steps": st.total_steps}


# --- AI engines -------------------------------------------------------------------------------


@app.get("/api/ai")
def ai_engines():
    """The AI CLIs found on this computer, the saved default and what a run would use."""
    return ai.describe(ai.detect())


class AiChoice(BaseModel):
    provider: str
    model: str | None = None


@app.put("/api/ai")
def ai_choose(choice: AiChoice):
    providers = ai.detect()  # once per request: each check runs every CLI
    try:
        ai.choose(choice.provider, choice.model or None, providers)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return ai.describe(providers)


# --- Profile ----------------------------------------------------------------------------------


def _profile_state() -> dict:
    saved = db.latest_profile()
    draft = db.open_draft()
    if draft and draft["error"] == db.INTERRUPTED:
        draft["error"] = t(db.INTERRUPTED)
    return {
        "profile": saved["data"] if saved else None,
        "saved_at": saved["created_at"] if saved else None,
        "draft": draft,
    }


def _drop_unused_files() -> None:
    """After a save: forget photos and attachments the profile no longer shows."""
    for row in db.unused_files():
        (db.data_dir() / row["path"]).unlink(missing_ok=True)
        db.delete_file(row["id"])


@app.get("/api/profile")
def profile_get():
    """The saved profile (None before the first save) and the open import draft, if any."""
    return _profile_state()


class ProfileBody(BaseModel):
    profile: Profile


@app.put("/api/profile")
def profile_put(body: ProfileBody):
    """Save the profile as edited by hand: every save is a new revision."""
    db.save_profile(body.profile.dump(), "manual")
    _drop_unused_files()
    return _profile_state()


@app.delete("/api/profile")
def profile_delete():
    """Start over: profile, drafts, uploaded CVs and attachments are deleted."""
    importer.cancel()
    for rel in db.clear_profile():
        (db.data_dir() / rel).unlink(missing_ok=True)
    return _profile_state()


@app.post("/api/profile/import", status_code=202)
def profile_import(
    file: Annotated[UploadFile | None, File()] = None,
    text: Annotated[str | None, Form()] = None,
):
    """Draft a profile from a CV (file, or pasted text) with the user's AI CLI."""
    if importer.running():
        raise HTTPException(409, t("import_busy"))
    draft = db.open_draft()
    if draft and draft["status"] == "ready":  # a new import would silently drop it
        raise HTTPException(409, t("draft_pending"))
    if file is not None:
        data, name = (
            file.file.read(MAX_UPLOAD_MB * 1024 * 1024 + 1),
            file.filename or "cv",
        )
    elif text and text.strip():
        data, name = text.encode(), None
    else:
        raise HTTPException(400, t("import_nothing"))
    try:
        doc_id = store_upload(name, data)
        importer.start(doc_id)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(409, str(e)) from e
    except ai.AiError as e:
        raise HTTPException(400, str(e)) from e
    return _profile_state()


@app.post("/api/profile/draft/retry", status_code=202)
def draft_retry():
    """Run the last import again on the same document (after a failure)."""
    draft = db.open_draft()
    if not draft or draft["status"] != "failed":  # never restart over a draft in review
        raise HTTPException(409 if draft else 404, t("draft_not_found"))
    try:
        importer.start(draft["document_id"])
    except RuntimeError as e:
        raise HTTPException(409, str(e)) from e
    except ai.AiError as e:
        raise HTTPException(400, str(e)) from e
    return _profile_state()


def _ready_draft() -> dict:
    draft = db.open_draft()
    if not draft or draft["status"] != "ready":
        raise HTTPException(404, t("draft_not_found"))
    return draft


@app.put("/api/profile/draft")
def draft_put(body: ProfileBody):
    """Keep the user's edits to the draft while they review it."""
    draft = _ready_draft()
    db.update_draft(
        draft["id"],
        when_status="ready",
        data=body.profile.model_dump_json(by_alias=True),
    )
    return _profile_state()


@app.post("/api/profile/draft/confirm")
def draft_confirm(body: ProfileBody):
    """The user checked the draft: it becomes the profile."""
    draft = _ready_draft()
    profile = body.profile.dump()
    db.save_profile(profile, "import", draft["document_id"])
    db.update_draft(draft["id"], when_status="ready", status="confirmed")
    _drop_unused_files()
    return _profile_state()


@app.delete("/api/profile/draft")
def draft_delete():
    """Cancel a running import, or throw away a draft or a failed one."""
    importer.cancel()
    draft = db.open_draft()
    if draft:
        db.update_draft(draft["id"], status="discarded")
    return _profile_state()


@app.get("/api/cv/preferences")
def cv_preferences():
    """Language, page format, style and photo for tailored CVs."""
    return cv_prefs().model_dump()


@app.put("/api/cv/preferences")
def cv_preferences_put(prefs: CvPrefs):
    return save_cv_prefs(prefs).model_dump()


class PreviewRequest(BaseModel):
    template: cv_render.TemplateId
    language: cv_render.CvLanguage = "en"
    format: cv_render.PageFormat = "a4"
    photo: bool = False
    # The profile to show, as on screen (the draft while reviewing); None: the sample.
    profile: Profile | None = None


@app.post("/api/cv/preview")
def cv_preview(req: PreviewRequest):
    """A CV template filled with the profile, as an HTML document for the preview."""
    p = req.profile
    empty = p is None or not (p.name or p.experiences or p.education)
    html = cv_render.render(
        req.template,
        cv_render.sample_profile() if empty else p,
        req.language,
        req.format,
        req.photo,
    )
    return {"html": html, "sample": empty}


# Browsers may display these; anything else is downloaded, so an uploaded HTML page can
# never run in the app's origin.
_INLINE = {
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/avif",
    "application/pdf",
}


@app.post("/api/profile/files")
def profile_file_upload(file: Annotated[UploadFile, File()]):
    """A photo or an attachment: kept under data/profile-files/, served back by id."""
    data = file.file.read(MAX_UPLOAD_MB * 1024 * 1024 + 1)
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(400, t("import_too_big", mb=MAX_UPLOAD_MB))
    name = file.filename or "file"
    mime = (
        file.content_type or mimetypes.guess_type(name)[0] or "application/octet-stream"
    ).lower()
    ext = Path(name).suffix.lower()
    ext = ext if re.fullmatch(r"\.[a-z0-9]{1,8}", ext) else ""
    file_id = uuid.uuid4().hex
    rel = f"profile-files/{file_id}{ext}"
    path = db.data_dir() / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    db.add_file(file_id, name, mime, rel)
    return {
        "id": file_id,
        "url": f"/api/profile/files/{file_id}",
        "name": name,
        "mime": mime,
    }


@app.get("/api/profile/files/{file_id}")
def profile_file(file_id: str):
    row = db.get_file(file_id)
    path = db.data_dir() / row["path"] if row else None
    if not row or not path.is_file():
        raise HTTPException(404, t("file_not_found"))
    inline = row["mime"] in _INLINE
    return FileResponse(
        path,
        media_type=row["mime"] if inline else "application/octet-stream",
        filename=row["filename"],
        content_disposition_type="inline" if inline else "attachment",
        headers={"X-Content-Type-Options": "nosniff"},
    )


if (STATIC / "assets").exists():
    app.mount("/assets", StaticFiles(directory=STATIC / "assets"), name="assets")


@app.get("/{path:path}")
def spa(path: str):
    """Serve the SPA; unknown paths fall back to index.html for client-side routing."""
    if path.startswith("api/"):
        raise HTTPException(404)
    file = (STATIC / path).resolve()
    if path and file.is_file() and STATIC.resolve() in file.parents:
        return FileResponse(file)
    index = STATIC / "index.html"
    if not index.exists():
        raise HTTPException(503, t("ui_not_built"))
    return FileResponse(index)
