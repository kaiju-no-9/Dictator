import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter()


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    project_id: str = Field(..., description="UUID of the project")
    current_plan: dict = Field(..., description="The current active EditPlan JSON")
    history: list[ChatMessage] = Field(default=[], description="Conversation history (last N messages)")
    message: str = Field(..., min_length=1, max_length=2000, description="The user's editing instruction")


class ChatResponse(BaseModel):
    reply: str
    plan: dict
    changes: list[str]


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    logger.info(
        "Chat edit | project=%s history_len=%d",
        request.project_id,
        len(request.history),
    )

    if not request.current_plan:
        raise HTTPException(status_code=422, detail="current_plan must not be empty")

    try:
        from src.agent.editor import ChatEditor

        editor = ChatEditor()
        result = await editor.edit(
            current_plan=request.current_plan,
            history=[h.model_dump() for h in request.history],
            message=request.message,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error("ChatEditor failed | project=%s error=%s", request.project_id, exc)
        raise HTTPException(status_code=500, detail=f"Chat editor failed: {exc}")

    logger.info(
        "Chat edit complete | project=%s changes=%d",
        request.project_id,
        len(result["changes"]),
    )

    return ChatResponse(
        reply=result["reply"],
        plan=result["plan"],
        changes=result["changes"],
    )
