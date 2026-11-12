"""FastAPI app: JSON API + the built React UI (web/ -> static/)."""

from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import db, geo
from .query import Query
from .scraper import Runner

STATIC = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init()  # here rather than at import, so importing the app never touches the real DB
    yield


app = FastAPI(title="career-agent", lifespan=lifespan)
runner = Runner()


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
    results, offline = geo.search(q)
    return {"places": results, "offline": offline}


@app.post("/api/jobs")
def jobs(req: JobsRequest):
    return db.search(
        req.query, req.sort, req.offset, req.limit, req.as_of, req.direction
    )


@app.delete("/api/jobs")
def clear_jobs():
    if runner.state.running:
        raise HTTPException(400, "Ricerca in corso")
    db.clear()
    return {"ok": True}


@app.post("/api/search")
def search(q: Query):
    """Start a portal search right away (the user asked for it by pressing the button)."""
    try:
        return runner.start(q)
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
        raise HTTPException(404, "Ricerca salvata non trovata")
    return {"ok": True}


@app.post("/api/saved/{saved_id}/run")
def saved_run(saved_id: int):
    """Run a saved search (from its «Esegui» button)."""
    saved = db.get_saved(saved_id)
    if not saved:
        raise HTTPException(404, "Ricerca salvata non trovata")
    try:
        summary = runner.start(Query.model_validate(saved["query"]))
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
        raise HTTPException(503, "UI non compilata: esegui `npm run build` in web/")
    return FileResponse(index)
