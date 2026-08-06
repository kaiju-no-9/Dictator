import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.routes.analysis import router as analysis_router
from src.routes.planning import router as planning_router
from src.routes.critique import router as critique_router
from src.routes.chat import router as chat_router

logging.basicConfig(
    level=settings.log_level.upper(),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Dictator AI Service",
    description="Stateless AI service for Dictator video editor.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["system"])
async def health():
    return {
        "status": "ok",
        "service": "dictator-ai-service",
        "version": "0.1.0",
        "planner_model": settings.agent_planner_model,
        "critic_model": settings.agent_critic_model,
        "whisper_model": settings.whisper_model_size,
    }


app.include_router(analysis_router, prefix="/analyze", tags=["analysis"])
app.include_router(planning_router, prefix="/plan", tags=["planning"])
app.include_router(critique_router, prefix="/critique", tags=["critique"])
app.include_router(chat_router, prefix="/chat", tags=["chat"])

logger.info(
    f"Dictator AI Service ready — planner={settings.agent_planner_model} critic={settings.agent_critic_model}"
)
