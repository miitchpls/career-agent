"""A posting's fit score, and what it reads whatever the search."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import ai, score
from ..workers import scorer

router = APIRouter()


class ScoreRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2000)


@router.get("/api/jobs/score")
def score_get(url: str):
    """A posting's fit score: running, ready, or failed (with the last finished one)."""
    return score.state(url)


@router.post("/api/jobs/score", status_code=202)
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


@router.delete("/api/jobs/score")
def score_cancel(url: str):
    """Stop a posting's running score."""
    scorer.cancel(url)
    return score.state(url)


@router.get("/api/score/preferences")
def score_prefs_get():
    """What the fit score reads whatever the search: dealbreakers and a note."""
    return score.prefs().model_dump(by_alias=True)


@router.put("/api/score/preferences")
def score_prefs_put(body: score.ScorePrefs):
    return score.save_prefs(body).model_dump(by_alias=True)
