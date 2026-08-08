import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    agent_planner_model: str = "anthropic/claude-3.5-sonnet"
    agent_critic_model: str = "openai/gpt-4o-mini"
    agent_max_retries: int = 3
    agent_max_tool_calls: int = 20

    whisper_model_size: str = "base"
    scenedetect_threshold: float = 27.0
    proxy_resolution: int = 720

    ai_service_port: int = 8001
    log_level: str = "info"

    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env", "src/.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
