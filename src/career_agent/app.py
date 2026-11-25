"""FastAPI app: the JSON API (routes/) + the built React UI (web/ -> static/)."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import db
from .i18n import LOCALE, parse_accept_language, t
from .routes import ROUTERS
from .workers import importer, reviewer, runner, scorer, tailorer  # noqa: F401 (tests)

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
for router in ROUTERS:
    app.include_router(router)


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
