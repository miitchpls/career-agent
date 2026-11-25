"""The profile: saves, CV import and its draft, the AI review, photos and attachments."""

import mimetypes
import re
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .. import ai, db
from ..i18n import t
from ..profile import (
    MAX_UPLOAD_MB,
    Profile,
    store_upload,
)
from ..review import State
from ..workers import importer, reviewer

router = APIRouter()


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


@router.get("/api/profile")
def profile_get():
    """The saved profile (None before the first save) and the open import draft, if any."""
    return _profile_state()


class ProfileBody(BaseModel):
    profile: Profile


@router.put("/api/profile")
def profile_put(body: ProfileBody):
    """Save the profile as edited by hand: every save is a new revision."""
    db.save_profile(body.profile.dump(), "manual")
    _drop_unused_files()
    return _profile_state()


@router.delete("/api/profile")
def profile_delete():
    """Start over: profile, drafts, reviews, uploaded CVs and attachments are deleted."""
    importer.cancel()
    reviewer.cancel()
    for rel in db.clear_profile():
        (db.data_dir() / rel).unlink(missing_ok=True)
    return _profile_state()


@router.post("/api/profile/import", status_code=202)
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


@router.post("/api/profile/draft/retry", status_code=202)
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


@router.put("/api/profile/draft")
def draft_put(body: ProfileBody):
    """Keep the user's edits to the draft while they review it."""
    draft = _ready_draft()
    db.update_draft(
        draft["id"],
        when_status="ready",
        data=body.profile.model_dump_json(by_alias=True),
    )
    return _profile_state()


@router.post("/api/profile/draft/confirm")
def draft_confirm(body: ProfileBody):
    """The user checked the draft: it becomes the profile."""
    draft = _ready_draft()
    profile = body.profile.dump()
    db.save_profile(profile, "import", draft["document_id"])
    db.update_draft(draft["id"], when_status="ready", status="confirmed")
    _drop_unused_files()
    return _profile_state()


@router.delete("/api/profile/draft")
def draft_delete():
    """Cancel a running import, or throw away a draft or a failed one."""
    importer.cancel()
    draft = db.open_draft()
    if draft:
        db.update_draft(draft["id"], status="discarded")
    return _profile_state()


def _review_state() -> dict:
    """The latest review, and while it runs or after it fails, the last finished one: its
    open suggestions stay until a newer review finishes."""
    review = db.latest_review()
    if review and review["error"] == db.REVIEW_INTERRUPTED:
        review["error"] = t(db.REVIEW_INTERRUPTED)
    earlier = db.last_ready_review() if review and review["status"] != "ready" else None
    return {"review": review, "earlier": earlier}


@router.get("/api/profile/review")
def review_get():
    """The latest review of the saved profile: running, ready with suggestions, or failed."""
    return _review_state()


@router.post("/api/profile/review", status_code=202)
def review_start():
    """Review the saved profile with the user's AI CLI."""
    draft = db.open_draft()
    if draft and draft["status"] in ("running", "ready"):
        raise HTTPException(409, t("review_draft_pending"))
    try:
        reviewer.start()
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(409, str(e)) from e
    except ai.AiError as e:
        raise HTTPException(400, str(e)) from e
    return _review_state()


@router.delete("/api/profile/review")
def review_cancel():
    """Stop a running review."""
    reviewer.cancel()
    return _review_state()


class SuggestionBody(BaseModel):
    state: State


@router.patch("/api/profile/review/suggestions/{suggestion_id}")
def suggestion_set(suggestion_id: str, body: SuggestionBody):
    """Record that a suggestion was applied (the UI saved the profile) or dismissed."""
    try:
        reviewer.set_state(suggestion_id, body.state)
    except LookupError as e:
        raise HTTPException(404, str(e)) from e
    return _review_state()


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


@router.post("/api/profile/files")
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


@router.get("/api/profile/files/{file_id}")
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
