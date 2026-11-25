"""A search's results, one posting from its link or pasted text, how it meets a search."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import db, feed, fx, job_link, scraper
from ..boards import Order
from ..i18n import t
from ..query import SITES, Query, match, unmet

router = APIRouter()


class FeedRequest(BaseModel):
    query: Query = Field(default_factory=Query)
    order: Order = "relevant"


@router.post("/api/feed")
def jobs_feed(req: FeedRequest):
    """What the search shows, from the searches read in the last hours: never asks a board.
    With each board's requests left and why it's on hold, for the "show more" button."""
    return {
        **feed.view(req.query, req.order),
        "boards": {
            site: dict(zip(("left", "hold"), scraper.board_state(site), strict=True))
            for site in SITES
        },
    }


class OpenLinkRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    currency: str = Field("CHF", pattern=r"^[A-Z]{3}$")  # as Query.salary_currency


@router.post("/api/jobs/open")
def jobs_open(body: OpenLinkRequest):
    """One posting from a pasted link: from the database when saved, else read from the board."""
    try:
        job, known = job_link.open_link(body.url, body.currency)
    except job_link.LinkError as e:
        raise HTTPException(e.status, str(e)) from e
    return {"job": job, "known": known}


@router.get("/api/jobs/saved")
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


@router.post("/api/jobs/paste")
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


class DismissRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    site: str | None = Field(None, max_length=20)
    title: str | None = Field(None, max_length=300)
    company: str | None = Field(None, max_length=300)


@router.get("/api/dismissed")
def dismissed_list():
    """The postings the user hid: the results leave them out, whichever search found them."""
    return {"urls": db.dismissed_urls()}


@router.post("/api/dismissed")
def dismissed_add(body: DismissRequest):
    """Hide a posting from the results ("not interested"). Nothing is asked of the board."""
    db.dismiss(body.url, body.site, body.title, body.company)
    return {"ok": True}


@router.delete("/api/dismissed")
def dismissed_remove(url: str):
    """Show a hidden posting again (undo, or "restore" from the hidden ones)."""
    return {"ok": True, "restored": db.restore(url)}


class MatchRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    query: Query


@router.post("/api/jobs/match")
def jobs_match(body: MatchRequest):
    """How a saved posting meets each condition of the current search (no AI, no request)."""
    job = db.get_job(body.url)
    if job is None:
        raise HTTPException(404, t("score_no_job"))
    _, rates = fx.rates()
    # The cached searches that list it now, and those that did when it was opened.
    places = sorted(set(feed.places(body.url)) | set(db.job_places(body.url)))
    # `excludes`: the check keeps it out of the search's results (the list's same rule).
    out = unmet(body.query, job, places, rates, detailed=True)
    checks = match(body.query, job, places, rates)
    return {"checks": [{**c, "excludes": c["kind"] in out} for c in checks]}
