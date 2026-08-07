"""
Enricher — Semantic tagging and visual description via OpenRouter.

Generates semantic tags, visual descriptions, and quality scores for detected shots.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from openai import AsyncOpenAI

from src.config import settings

logger = logging.getLogger(__name__)


class ShotEnricher:
    """
    Calls OpenRouter LLM to produce metadata (tags, visual description, quality score)
    for each shot based on its transcript and context.
    """

    def __init__(self) -> None:
        self.client = AsyncOpenAI(
            api_key=settings.openrouter_api_key,
            base_url=settings.openrouter_base_url,
        )
        self.model = settings.agent_critic_model  # Fast, efficient model for tagging

    async def enrich_shots(
        self,
        shots: list[dict[str, Any]],
        transcripts: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """
        Enrich shots with tags, visual_description, and quality_score.

        Args:
            shots: List of shot dicts.
            transcripts: List of transcript segment dicts.

        Returns:
            List of enriched shot dicts.
        """
        if not shots:
            return []

        # Create transcript map by shot_id
        tx_map = {t["shot_id"]: t.get("text", "") for t in transcripts}

        # Build shot summary payload for LLM batch enrichment
        shot_summaries = []
        for s in shots:
            sid = s["shot_id"]
            shot_summaries.append({
                "shot_id": sid,
                "duration": s.get("duration", s.get("end", 0) - s.get("start", 0)),
                "transcript": tx_map.get(sid, ""),
            })

        prompt = f"""You are a video metadata tagger. Analyze these video shots and return semantic metadata for each shot.

Shots list:
{json.dumps(shot_summaries, indent=2)}

Return a valid JSON array of objects with these exact keys for each shot:
- shot_id: string (must match input shot_id)
- tags: array of strings (e.g., ["talking_head", "b_roll", "interview", "outdoor", "product_demo", "action"])
- visual_description: string (1 concise sentence describing what is visible or taking place)
- quality_score: number (1 to 5, where 5 is highest editorial quality)
- role: string ("primary", "b_roll", "cutaway", "establishing", "reaction", "alternate_take")

Respond with JSON ONLY:
```json
[
  {{
    "shot_id": "shot_0001",
    "tags": ["interview", "talking_head"],
    "visual_description": "Speaker talking directly to camera in studio.",
    "quality_score": 4,
    "role": "primary"
  }}
]
```"""

        logger.info("Enriching %d shots via LLM | model=%s", len(shots), self.model)

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                max_tokens=4000,
            )
            content = response.choices[0].message.content or ""
            enrichment_map = self._parse_enrichment_response(content)
        except Exception as exc:
            logger.error("LLM shot enrichment failed | error=%s", exc)
            enrichment_map = {}

        # Merge enrichments back into shots
        enriched_shots: list[dict[str, Any]] = []
        for shot in shots:
            sid = shot["shot_id"]
            enr = enrichment_map.get(sid, {})

            enriched = dict(shot)
            enriched["tags"] = enr.get("tags", ["general"])
            enriched["visual_description"] = enr.get("visual_description", "Shot content")
            enriched["quality_score"] = enr.get("quality_score", 3)
            enriched["role"] = enr.get("role", "primary")
            enriched["transcript"] = tx_map.get(sid, "")
            enriched_shots.append(enriched)

        logger.info("Shot enrichment complete for %d shots", len(enriched_shots))
        return enriched_shots

    def _parse_enrichment_response(self, text: str) -> dict[str, dict[str, Any]]:
        """Parse LLM JSON array response into map keyed by shot_id."""
        json_match = re.search(r"```json\s*(\[.*?\])\s*```", text, re.DOTALL)
        if json_match:
            raw_json = json_match.group(1)
        else:
            json_match = re.search(r"(\[.*\])", text, re.DOTALL)
            raw_json = json_match.group(1) if json_match else "[]"

        try:
            items = json.loads(raw_json)
            if isinstance(items, list):
                return {item["shot_id"]: item for item in items if isinstance(item, dict) and "shot_id" in item}
        except Exception as exc:
            logger.warning("Failed to parse LLM enrichment JSON: %s", exc)

        return {}
