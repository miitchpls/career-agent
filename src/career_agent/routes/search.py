"""Board searches: start, follow, stop; saved searches; the place autocomplete."""

from dataclasses import asdict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import db, geo
from ..boards import Order
from ..i18n import LOCALE, t
from ..query import Query
from ..workers import runner

router = APIRouter()


@router.get("/api/places")
def places(q: str = ""):
    """City autocomplete, proxied so the browser never talks to third parties directly.
    Falls back to the offline catalogue when the geocoding API is unreachable."""
    results, offline = geo.search(q, lang=LOCALE.get())
    return {"places": results, "offline": offline}


@router.post("/api/search")
def search(
    q: Query, order: Order = "relevant", more: bool = False, force: bool = False
):
    """Start a portal search right away (the user asked for it by pressing the button).

    Reads each search's first page unless it's cached. `more`: the next page of each («Mostra
    altre»). `force`: read the first pages again even when cached («Aggiorna»).
    """
    try:
        return runner.start(q, order, more=more, force=force)
    except (RuntimeError, ValueError) as e:
        raise HTTPException(400, str(e)) from e


class SaveRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    query: Query


@router.get("/api/saved")
def saved_list():
    return db.list_saved()


@router.post("/api/saved")
def saved_create(req: SaveRequest):
    row, created = db.save_search(req.name.strip(), req.query)
    return {**row, "created": created}


@router.delete("/api/saved/{saved_id}")
def saved_delete(saved_id: int):
    if not db.delete_saved(saved_id):
        raise HTTPException(404, t("saved_not_found"))
    return {"ok": True}


@router.post("/api/saved/{saved_id}/run")
def saved_run(saved_id: int, order: Order = "relevant", force: bool = False):
    """Run a saved search (from its «Esegui» button); `force` as in /api/search."""
    saved = db.get_saved(saved_id)
    if not saved:
        raise HTTPException(404, t("saved_not_found"))
    try:
        summary = runner.start(Query.model_validate(saved["query"]), order, force=force)
    except (RuntimeError, ValueError) as e:
        raise HTTPException(400, str(e)) from e
    db.mark_saved_run(saved_id)
    return summary


@router.post("/api/cancel")
def cancel():
    runner.cancel()
    return {"ok": True}


@router.get("/api/status")
def status():
    st = runner.state
    return {**asdict(st), "done_steps": st.done_steps, "total_steps": st.total_steps}
