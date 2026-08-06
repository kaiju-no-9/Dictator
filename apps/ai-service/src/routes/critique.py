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


class CritiqueIssue(BaseModel):
    severity: str
    category: str
    shot_id: str | None = None
    message: str
    suggestion: str | None = None


class CritiqueResponse(BaseModel):
    project_id: str
    score: float = Field(..., ge=0.0, le=10.0, description="Overall edit quality score 0–10")
    issues: list[CritiqueIssue]
    summary: str
    revised_plan: dict | None = None


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

        service = AgentService(
            project_id=request.project_id,
            shots=request.plan.get("source_shots", []),
            transcript=[],
            tags={},
            style_brief=request.style_brief,
            mode="critique",
            existing_plan=request.plan,
            proxy_url=request.proxy_url,
        )

        result = await service.run()

    except Exception as exc:
        logger.error("Critique agent failed | project=%s error=%s", request.project_id, exc)
        raise HTTPException(status_code=500, detail=f"Critique agent failed: {exc}")

    issues = [CritiqueIssue(**issue) for issue in result.get("issues", [])]

    logger.info(
        "Critique complete | project=%s score=%.1f issues=%d",
        request.project_id,
        result.get("score", 0.0),
        len(issues),
    )

    return CritiqueResponse(
        project_id=request.project_id,
        score=result.get("score", 0.0),
        issues=issues,
        summary=result.get("summary", ""),
        revised_plan=result.get("revised_plan"),
    )
