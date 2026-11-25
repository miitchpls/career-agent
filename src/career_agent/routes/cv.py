"""Tailored CVs, their PDF, the CV preferences and the template previews."""

import base64
import re
import unicodedata

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import AliasChoices, BaseModel, Field

from .. import ai, cv_render, db, pdf, tailor
from ..i18n import t
from ..profile import (
    CvOverrides,
    CvPrefs,
    PhotoStylePref,
    Profile,
    cv_overrides,
    cv_prefs,
    effective_cv_prefs,
    save_cv_overrides,
    save_cv_prefs,
)
from ..workers import tailorer

router = APIRouter()


class CvRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    # The CV's language: the UI resolves "the posting's language" before asking.
    language: cv_render.CvLanguage


@router.get("/api/jobs/cv")
def cv_get(url: str):
    """A posting's tailored CV: running, ready, or failed (with the last finished one)."""
    return tailor.state(url)


@router.post("/api/jobs/cv", status_code=202)
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


class CvSettingsBody(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    settings: CvOverrides


@router.get("/api/jobs/cv/settings")
def cv_settings_get(url: str):
    """A posting's own CV settings: each one set replaces the default for it only."""
    return cv_overrides(url).model_dump(by_alias=True)


@router.put("/api/jobs/cv/settings")
def cv_settings_put(body: CvSettingsBody):
    return save_cv_overrides(body.url, body.settings).model_dump(by_alias=True)


@router.get("/api/jobs/cv/count")
def cv_count():
    """How many postings have a finished tailored CV."""
    return {"postings": db.count_cv_postings()}


@router.delete("/api/jobs/cv")
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
    """ "Michele Greco CV - Acme" as a file name anything accepts: Michele-Greco-CV-Acme.pdf."""
    words = " ".join(x for x in (name, "CV", company or "") if x)
    ascii_ = unicodedata.normalize("NFKD", words).encode("ascii", "ignore").decode()
    stem = "-".join(re.findall(r"[A-Za-z0-9]+", ascii_))[:80].strip("-")
    return f"{stem or 'CV'}.pdf"


@router.post("/api/jobs/cv/pdf")
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
            photo_style=effective_cv_prefs(body.url).photo_style,
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


@router.get("/api/cv/preferences")
def cv_preferences():
    """Language, page format, style and photo for tailored CVs."""
    return cv_prefs().model_dump(by_alias=True)


@router.put("/api/cv/preferences")
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
    # A posting's own photo shape; by default the saved preference. The UI sends camelCase.
    photo_style: PhotoStylePref | None = Field(
        None, validation_alias=AliasChoices("photoStyle", "photo_style")
    )


@router.post("/api/cv/preview")
def cv_preview(req: PreviewRequest):
    """CV templates filled with a profile, as HTML documents: one request for a whole gallery."""
    profile = req.profile or cv_render.sample_profile()
    marked = frozenset(req.marked)
    style = req.photo_style or cv_prefs().photo_style
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
