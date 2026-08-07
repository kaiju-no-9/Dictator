import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter()


class CritiqueRequest(BaseModel):
    project_id: str = Field(..., description="UUID of the project")
    plan: dict = Field(..., description="The EditPlan JSON to critique")
    proxy_url: str | None = Field(default=None, description="Optional proxy render video URL")
    style_brief: str | None = Field(default=None, description="Original style brief")


class CritiqueResponse(BaseModel):
    project_id: str
    score: float = Field(..., ge=0.0, le=100.0, description="Overall edit quality score 0–100")
    summary: str
    strengths: list[str] = []
    weaknesses: list[str] = []
    recommendations: list[str] = []


@router.post("", response_model=CritiqueResponse)
async def critique(request: CritiqueRequest) -> CritiqueResponse:
    logger.info(
        "Critique started | project=%s has_proxy=%s",
        request.project_id,
        request.proxy_url is not None,
    )

    if not request.plan:
        raise HTTPException(status_code=422, detail="plan must not be empty")

    try:
        from src.agent.service import AgentService

        service = AgentService()
        res = await service.critique_plan(
            project_id=request.project_id,
            plan=request.plan,
        )

    except Exception as exc:
        logger.error("Critique agent failed | project=%s error=%s", request.project_id, exc)
        raise HTTPException(status_code=500, detail=f"Critique agent failed: {exc}")

    logger.info(
        "Critique complete | project=%s score=%.1f",
        request.project_id,
        float(res.get("score", 0)),
    )

    return CritiqueResponse(
        project_id=request.project_id,
        score=float(res.get("score", 0)),
        summary=res.get("summary", ""),
        strengths=res.get("strengths", []),
        weaknesses=res.get("weaknesses", []),
        recommendations=res.get("recommendations", []),
    )
