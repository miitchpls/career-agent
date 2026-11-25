"""A search's results, one posting from its link or pasted text, how it meets a search."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import db, feed, fx, job_link, scraper
from ..boards import Order
from ..i18n import t
from ..query import SITES, Query, match

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
            site: {
                "left": scraper.requests_left(site),
                "hold": scraper.hold_reason(site),
            }
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
    return {"checks": match(body.query, job, places, rates)}
