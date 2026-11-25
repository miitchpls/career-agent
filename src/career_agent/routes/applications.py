"""Applications: the postings followed or applied to."""

from fastapi import APIRouter, HTTPException

from .. import applications, job_link
from ..i18n import t

router = APIRouter()


@router.get("/api/applications")
def applications_list():
    """Every application, newest first, with its events and its posting's last score."""
    return applications.all_()


@router.post("/api/applications")
def applications_add(body: applications.NewApplication):
    """Track a posting; `created` is False when it was already tracked (that one comes back)."""
    try:
        app_, created = applications.add(body)
    except job_link.LinkError as e:
        raise HTTPException(e.status, str(e)) from e
    return {"application": app_, "created": created}


@router.patch("/api/applications/{app_id}")
def applications_update(app_id: int, body: applications.ApplicationPatch):
    app_ = applications.update(app_id, body)
    if app_ is None:
        raise HTTPException(404, t("application_not_found"))
    return app_


@router.delete("/api/applications/{app_id}")
def applications_delete(app_id: int):
    if not applications.delete(app_id):
        raise HTTPException(404, t("application_not_found"))
    return {"ok": True}
