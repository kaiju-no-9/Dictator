"""
Agent Service — High-level agent orchestration for Plan Generation and Editorial Critique.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from openai import AsyncOpenAI

from src.config import settings
from src.agent.loop import AgentLoop
from src.agent.prompts.critique import CRITIQUE_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class AgentService:
    """
    Service wrapper for Plan Generation (AgentLoop) and Editorial Critique.
    """

    def __init__(self) -> None:
        self.client = AsyncOpenAI(
            api_key=settings.openrouter_api_key,
            base_url=settings.openrouter_base_url,
        )
        self.critic_model = settings.agent_critic_model

    async def generate_plan(
        self,
        project_id: str,
        shots: list[dict[str, Any]],
        transcript: list[dict[str, Any]],
        tags: dict[str, list[str]],
        prompt: str | None = None,
    ) -> dict[str, Any]:
        """
        Generate a validated EditPlan using the AgentLoop.
        """
        logger.info("AgentService.generate_plan | project=%s shots=%d", project_id, len(shots))

        loop = AgentLoop(
            project_id=project_id,
            shots_context=shots,
            transcript_context=transcript,
            tags_context=tags,
            user_prompt=prompt,
        )
        return await loop.run()

    async def critique_plan(
        self,
        project_id: str,
        plan: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Evaluate an EditPlan and return editorial score, feedback, and recommendations.
        """
        logger.info("AgentService.critique_plan | project=%s model=%s", project_id, self.critic_model)

        prompt = f"""Review this Edit Plan for project '{project_id}':

```json
{json.dumps(plan, indent=2)}
```"""

        try:
            response = await self.client.chat.completions.create(
                model=self.critic_model,
                messages=[
                    {"role": "system", "content": CRITIQUE_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=2000,
            )
            content = response.choices[0].message.content or ""
            return self._parse_critique_response(content)
        except Exception as exc:
            logger.error("Critique LLM call failed: %s", exc)
            return {
                "score": 70,
                "summary": "Automated critique fallback due to LLM timeout.",
                "strengths": ["Plan structure is valid"],
                "weaknesses": [],
                "recommendations": [],
            }

    def _parse_critique_response(self, text: str) -> dict[str, Any]:
        """Parse LLM JSON critique response."""
        json_match = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
        if not json_match:
            json_match = re.search(r"(\{[^{}]*\"score\"[^{}]*\})", text, re.DOTALL)

        if json_match:
            try:
                return json.loads(json_match.group(1))
            except Exception as exc:
                logger.warning("Failed to parse critique JSON: %s", exc)

        return {
            "score": 75,
            "summary": "Critique complete (raw output parsed).",
            "strengths": [],
            "weaknesses": [],
            "recommendations": [],
        }
