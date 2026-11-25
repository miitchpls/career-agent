"""The AI CLIs found on this computer and the one to use."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import ai

router = APIRouter()


@router.get("/api/ai")
def ai_engines():
    """The AI CLIs found on this computer, the saved default and what a run would use."""
    return ai.describe(ai.detect())


class AiChoice(BaseModel):
    provider: str
    model: str | None = None


@router.put("/api/ai")
def ai_choose(choice: AiChoice):
    providers = ai.detect()  # once per request: each check runs every CLI
    try:
        ai.choose(choice.provider, choice.model or None, providers)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return ai.describe(providers)
