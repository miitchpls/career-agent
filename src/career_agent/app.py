"""FastAPI app: JSON API + the built React UI (web/ -> static/)."""

import base64
import mimetypes
import re
import unicodedata
import uuid
from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import ai, applications, cv_render, db, fx, geo, job_link, pdf, score, tailor
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
from .query import Query, match
from .review import Reviewer, State
from .scraper import Runner

STATIC = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init()  # here rather than at import, so importing the app never touches the real DB
    db.fail_running_drafts()
    db.fail_running_reviews()
    db.fail_running_scores()
    db.fail_running_cvs()
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
reviewer = Reviewer()
scorer = score.Scorer()
tailorer = tailor.Tailorer()


class JobsRequest(BaseModel):
    query: Query = Field(default_factory=Query)
    sort: db.Sort = "posted"
    direction: db.Direction = "desc"
    offset: int = Field(0, ge=0)
    limit: int = Field(50, ge=1, le=200)
    as_of: int | None = Field(
        None, ge=0
    )  # from the first page; keeps later pages stable


class OpenLinkRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    currency: str = Field("CHF", pattern=r"^[A-Z]{3}$")  # as Query.salary_currency


@app.post("/api/jobs/open")
def jobs_open(body: OpenLinkRequest):
    """One posting from a pasted link: from the database when saved, else read from the board."""
    try:
        job, known = job_link.open_link(body.url, body.currency)
    except job_link.LinkError as e:
        raise HTTPException(e.status, str(e)) from e
    return {"job": job, "known": known}


@app.get("/api/jobs/saved")
def jobs_saved(url: str, currency: str = "CHF"):
    """A posting already saved, by its link: no request to the board (null when not saved)."""
    return {"job": job_link.saved_job(url, currency)}


class PasteJobRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    title: str = Field(min_length=1, max_length=300)
    company: str = Field("", max_length=300)
    location: str = Field("", max_length=300)
    description: str = Field(min_length=1, max_length=50_000)
    currency: str = Field("CHF", pattern=r"^[A-Z]{3}$")


@app.post("/api/jobs/paste")
def jobs_paste(body: PasteJobRequest):
    """A posting the board wouldn't show, from the text the user copied: no request is made."""
    try:
        job, known = job_link.paste_job(
            body.url,
            body.title,
            body.company,
            body.location,
            body.description,
            body.currency,
        )
    except job_link.LinkError as e:
        raise HTTPException(e.status, str(e)) from e
    return {"job": job, "known": known}


class MatchRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    query: Query


@app.post("/api/jobs/match")
def jobs_match(body: MatchRequest):
    """How a saved posting meets each condition of the current search (no AI, no request)."""
    job = db.get_job(body.url)
    if job is None:
        raise HTTPException(404, t("score_no_job"))
    _, rates = fx.rates()
    return {"checks": match(body.query, job, db.hit_places(body.url), rates)}


# --- Applications -------------------------------------------------------------------------------


@app.get("/api/applications")
def applications_list():
    """Every application, newest first, with its events and its posting's last score."""
    return applications.all_()


@app.post("/api/applications")
def applications_add(body: applications.NewApplication):
    """Track a posting; `created` is False when it was already tracked (that one comes back)."""
    try:
        app_, created = applications.add(body)
    except job_link.LinkError as e:
        raise HTTPException(e.status, str(e)) from e
    return {"application": app_, "created": created}


@app.patch("/api/applications/{app_id}")
def applications_update(app_id: int, body: applications.ApplicationPatch):
    app_ = applications.update(app_id, body)
    if app_ is None:
        raise HTTPException(404, t("application_not_found"))
    return app_


@app.delete("/api/applications/{app_id}")
def applications_delete(app_id: int):
    if not applications.delete(app_id):
        raise HTTPException(404, t("application_not_found"))
    return {"ok": True}


# --- Fit score ---------------------------------------------------------------------------------


class ScoreRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2000)


@app.get("/api/jobs/score")
def score_get(url: str):
    """A posting's fit score: running, ready, or failed (with the last finished one)."""
    return score.state(url)


@app.post("/api/jobs/score", status_code=202)
def score_start(body: ScoreRequest):
    """Score a saved posting against the profile with the user's AI CLI."""
    try:
        scorer.start(body.url)
    except LookupError as e:
        raise HTTPException(404, str(e)) from e
    except (ValueError, ai.AiError) as e:
        raise HTTPException(400, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(409, str(e)) from e
    return score.state(body.url)


@app.delete("/api/jobs/score")
def score_cancel(url: str):
    """Stop a posting's running score."""
    scorer.cancel(url)
    return score.state(url)


# --- Tailored CV ---------------------------------------------------------------------------------


class CvRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    # The CV's language: the UI resolves "the posting's language" before asking.
    language: cv_render.CvLanguage


@app.get("/api/jobs/cv")
def cv_get(url: str):
    """A posting's tailored CV: running, ready, or failed (with the last finished one)."""
    return tailor.state(url)


@app.post("/api/jobs/cv", status_code=202)
def cv_start(body: CvRequest):
    """Write a CV for a saved posting from the profile, with the user's AI CLI."""
    try:
        tailorer.start(body.url, body.language)
    except LookupError as e:
        raise HTTPException(404, str(e)) from e
    except (ValueError, ai.AiError) as e:
        raise HTTPException(400, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(409, str(e)) from e
    return tailor.state(body.url)


@app.get("/api/jobs/cv/count")
def cv_count():
    """How many postings have a finished tailored CV."""
    return {"postings": db.count_cv_postings()}


@app.delete("/api/jobs/cv")
def cv_cancel(url: str):
    """Stop a posting's running CV generation."""
    tailorer.cancel(url)
    return tailor.state(url)


class CvPdfRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    template: cv_render.TemplateId
    format: cv_render.PageFormat = "a4"
    photo: bool = False
    consent: bool = False


def _inline_photo(profile: Profile) -> Profile:
    """The photo as a data URL: the PDF is printed from a file, away from the server."""
    m = re.fullmatch(r"/api/profile/files/([0-9a-f]{32})", profile.photo or "")
    row = db.get_file(m[1]) if m else None
    path = db.data_dir() / row["path"] if row else None
    if not row or not path.is_file() or not row["mime"].startswith("image/"):
        # Not an upload we still have (replaced since the CV was written): no photo
        # rather than a broken image.
        return profile.model_copy(update={"photo": None}) if profile.photo else profile
    data = base64.b64encode(path.read_bytes()).decode()
    return profile.model_copy(update={"photo": f"data:{row['mime']};base64,{data}"})


def _pdf_name(name: str, company: str | None) -> str:
    """ "Alex Moretti CV - Acme" as a file name anything accepts: Alex-Moretti-CV-Acme.pdf."""
    words = " ".join(x for x in (name, "CV", company or "") if x)
    ascii_ = unicodedata.normalize("NFKD", words).encode("ascii", "ignore").decode()
    stem = "-".join(re.findall(r"[A-Za-z0-9]+", ascii_))[:80].strip("-")
    return f"{stem or 'CV'}.pdf"


@app.post("/api/jobs/cv/pdf")
def cv_pdf(body: CvPdfRequest):
    """The posting's last finished CV as a PDF, in the template and page format asked."""
    cv = db.last_ready_cv(body.url)
    if cv is None:
        raise HTTPException(404, t("cv_not_found"))
    result = cv["result"]
    profile = _inline_photo(Profile.model_validate(result["profile"]))
    try:
        page = cv_render.render(
            body.template,
            profile,
            result["language"],
            body.format,
            body.photo,
            competencies=result["competencies"],
            consent=body.consent,
            photo_style=cv_prefs().photo_style,
        )
    except ValueError as e:
        raise HTTPException(500, t("cv_render_failed")) from e
    try:
        data = pdf.html_to_pdf(page)
    except pdf.PdfError as e:
        raise HTTPException(503, str(e)) from e
    job = db.get_job(body.url)
    name = _pdf_name(profile.name, job.get("company") if job else None)
    return Response(
        data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@app.get("/api/score/preferences")
def score_prefs_get():
    """What the fit score reads whatever the search: dealbreakers and a note."""
    return score.prefs().model_dump(by_alias=True)


@app.put("/api/score/preferences")
def score_prefs_put(body: score.ScorePrefs):
    return score.save_prefs(body).model_dump(by_alias=True)


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
    """Start over: profile, drafts, reviews, uploaded CVs and attachments are deleted."""
    importer.cancel()
    reviewer.cancel()
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


# --- Profile review ---------------------------------------------------------------------------


def _review_state() -> dict:
    """The latest review, and while it runs or after it fails, the last finished one: its
    open suggestions stay until a newer review finishes."""
    review = db.latest_review()
    if review and review["error"] == db.REVIEW_INTERRUPTED:
        review["error"] = t(db.REVIEW_INTERRUPTED)
    earlier = db.last_ready_review() if review and review["status"] != "ready" else None
    return {"review": review, "earlier": earlier}


@app.get("/api/profile/review")
def review_get():
    """The latest review of the saved profile: running, ready with suggestions, or failed."""
    return _review_state()


@app.post("/api/profile/review", status_code=202)
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


@app.delete("/api/profile/review")
def review_cancel():
    """Stop a running review."""
    reviewer.cancel()
    return _review_state()


class SuggestionBody(BaseModel):
    state: State


@app.patch("/api/profile/review/suggestions/{suggestion_id}")
def suggestion_set(suggestion_id: str, body: SuggestionBody):
    """Record that a suggestion was applied (the UI saved the profile) or dismissed."""
    try:
        reviewer.set_state(suggestion_id, body.state)
    except LookupError as e:
        raise HTTPException(404, str(e)) from e
    return _review_state()


@app.get("/api/cv/preferences")
def cv_preferences():
    """Language, page format, style and photo for tailored CVs."""
    return cv_prefs().model_dump(by_alias=True)


@app.put("/api/cv/preferences")
def cv_preferences_put(prefs: CvPrefs):
    return save_cv_prefs(prefs).model_dump(by_alias=True)


class PreviewRequest(BaseModel):
    templates: list[cv_render.TemplateId] = Field(
        min_length=1, max_length=len(cv_render.TEMPLATES)
    )
    language: cv_render.CvLanguage = "en"
    format: cv_render.PageFormat = "a4"
    photo: bool = False
    # What to show, exactly as given (the draft while reviewing). None: the sample profile.
    profile: Profile | None = None
    # Texts to highlight: what a tailored CV changed.
    marked: list[str] = Field(default_factory=list, max_length=200)
    # A tailored CV's keyword tags, and whether to end with the data-processing consent.
    competencies: list[str] = Field(default_factory=list, max_length=12)
    consent: bool = False


@app.post("/api/cv/preview")
def cv_preview(req: PreviewRequest):
    """CV templates filled with a profile, as HTML documents: one request for a whole gallery."""
    profile = req.profile or cv_render.sample_profile()
    marked = frozenset(req.marked)
    style = cv_prefs().photo_style
    try:
        pages = {
            tid: cv_render.render(
                tid,
                profile,
                req.language,
                req.format,
                req.photo,
                marked,
                req.competencies,
                req.consent,
                style,
            )
            for tid in dict.fromkeys(req.templates)
        }
    except ValueError as e:  # a template this renderer can't fill
        raise HTTPException(500, t("cv_render_failed")) from e
    return {"pages": pages, "sample": req.profile is None}


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
