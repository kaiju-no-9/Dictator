import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter()


class ShotInput(BaseModel):
    shot_id: str
    source_file: str
    start: float
    end: float
    duration: float
    transcript: str | None = None
    tags: list[str] = []
    visual_description: str | None = None
    quality_score: float | None = None
    group_id: str | None = None


class TranscriptSegmentInput(BaseModel):
    shot_id: str
    text: str
    start: float
    end: float


class PlanRequest(BaseModel):
    project_id: str = Field(..., description="UUID of the project")
    shots: list[ShotInput] = Field(..., min_length=1, description="Shots from /analyze")
    transcript: list[TranscriptSegmentInput] = Field(default=[], description="Transcript segments")
    tags: dict[str, list[str]] = Field(default={}, description="shot_id → tags from /analyze")
    style_brief: str | None = Field(default=None, description="Optional style instructions")


class PlanResponse(BaseModel):
    project_id: str
    plan: dict
    agent_iterations: int
    validation_passed: bool
    violations: list[dict] = []


@router.post("", response_model=PlanResponse)
async def generate_plan(request: PlanRequest) -> PlanResponse:
    logger.info(
        "Planning started | project=%s shots=%d",
        request.project_id,
        len(request.shots),
    )

    if not request.shots:
        raise HTTPException(status_code=422, detail="shots list must not be empty")

    try:
        from src.agent.service import AgentService

        service = AgentService(
            project_id=request.project_id,
            shots=[s.model_dump() for s in request.shots],
            transcript=[t.model_dump() for t in request.transcript],
            tags=request.tags,
            style_brief=request.style_brief,
        )

        result = await service.run()

    except Exception as exc:
        logger.error("Planning agent failed | project=%s error=%s", request.project_id, exc)
        raise HTTPException(status_code=500, detail=f"Planning agent failed: {exc}")

    logger.info(
        "Planning complete | project=%s iterations=%d valid=%s",
        request.project_id,
        result["agent_iterations"],
        result["validation_passed"],
    )

    return PlanResponse(
        project_id=request.project_id,
        plan=result["plan"],
        agent_iterations=result["agent_iterations"],
        validation_passed=result["validation_passed"],
        violations=result.get("violations", []),
    )
