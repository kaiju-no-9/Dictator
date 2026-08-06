import json
import logging
import re
from typing import Any

from openai import AsyncOpenAI

from src.config import settings

logger = logging.getLogger(__name__)


class ChatEditor:
    """
    Uses an LLM (via OpenRouter) to interpret natural language editing
    instructions and return a modified EditPlan JSON.
    """

    def __init__(self) -> None:
        self.client = AsyncOpenAI(
            api_key=settings.openrouter_api_key,
            base_url=settings.openrouter_base_url,
        )
        self.model = settings.agent_planner_model

    def _build_system_prompt(self, current_plan: dict) -> str:
        shot_ids = [s.get("shot_id") for s in current_plan.get("source_shots", [])]
        return f"""You are an expert video editor assistant. You help users edit their video by modifying an Edit Plan JSON.

The Edit Plan has this structure:
- source_shots[]: All available shots. Each has shot_id, source_file, start, end, duration, transcript, tags.
- timeline[]: The actual edit sequence. Each entry references a shot_id from source_shots and has:
  - shot_id: must match a shot in source_shots
  - trim_in, trim_out: start/end trim within the shot (in seconds)
  - transition_in: one of hard_cut, crossfade, dissolve, fade_in, fade_out, wipe_left, wipe_right, dip_to_black, dip_to_white
  - transition_duration: seconds (0-5)
  - source_audio: keep | mute | replace
  - speed: 0.1–10.0 (1.0 = normal)
  - overlay_text: optional text overlay (null to remove)
  - overlay_position: top | center | bottom | lower_third
  - overlay_style: default | bold | subtitle | title_card
- audio: music[], sfx[], voiceover[] tracks
- export_settings: resolution, fps, codec, container

Available shot IDs: {json.dumps(shot_ids)}

RULES:
- Never reference a shot_id that is not in source_shots
- trim_in must always be less than trim_out
- Always return the COMPLETE modified plan (not just the changed parts)
- Keep source_shots unchanged — only modify the timeline and audio sections

RESPONSE FORMAT — you must respond with exactly this structure, no other text:
REPLY: <your conversational reply to the user>
PLAN: <the complete modified EditPlan as valid JSON>"""

    def _extract_reply_and_plan(self, text: str) -> tuple[str, dict]:
        """Extract REPLY and PLAN sections from LLM output. Falls back to regex JSON extraction."""
        reply = ""
        plan_json: dict = {}

        # Try structured REPLY:/PLAN: format first
        reply_match = re.search(r"REPLY:\s*(.+?)(?=PLAN:|$)", text, re.DOTALL)
        if reply_match:
            reply = reply_match.group(1).strip()

        plan_match = re.search(r"PLAN:\s*(\{.*\})", text, re.DOTALL)
        if plan_match:
            try:
                plan_json = json.loads(plan_match.group(1))
                return reply or "Done.", plan_json
            except json.JSONDecodeError:
                pass

        # Fallback: extract any JSON block from the output
        json_match = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
        if not json_match:
            json_match = re.search(r"(\{[^{}]*\"timeline\"[^{}]*\})", text, re.DOTALL)

        if json_match:
            try:
                plan_json = json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

        if not reply:
            # Extract first non-JSON sentence as the reply
            lines = [l.strip() for l in text.split("\n") if l.strip() and not l.strip().startswith("{")]
            reply = lines[0] if lines else "Done."

        return reply, plan_json

    def _describe_changes(self, original_plan: dict, new_plan: dict) -> list[str]:
        """Compute a human-readable list of what changed between two plans."""
        changes: list[str] = []

        orig_timeline = {e["shot_id"]: e for e in original_plan.get("timeline", [])}
        new_timeline = {e["shot_id"]: e for e in new_plan.get("timeline", [])}

        orig_ids = list(orig_timeline.keys())
        new_ids = list(new_timeline.keys())

        # Removed shots
        for sid in orig_ids:
            if sid not in new_ids:
                changes.append(f"Removed {sid} from timeline")

        # Added shots
        for sid in new_ids:
            if sid not in orig_ids:
                changes.append(f"Added {sid} to timeline")

        # Modified shots
        for sid in new_ids:
            if sid in orig_ids:
                o = orig_timeline[sid]
                n = new_timeline[sid]
                if o.get("trim_in") != n.get("trim_in") or o.get("trim_out") != n.get("trim_out"):
                    changes.append(f"Adjusted trim on {sid}: [{n.get('trim_in')}s–{n.get('trim_out')}s]")
                if o.get("transition_in") != n.get("transition_in"):
                    changes.append(f"Changed transition on {sid} to {n.get('transition_in')}")
                if o.get("speed") != n.get("speed"):
                    changes.append(f"Changed speed on {sid} to {n.get('speed')}×")
                if o.get("source_audio") != n.get("source_audio"):
                    changes.append(f"Changed audio on {sid} to {n.get('source_audio')}")
                if o.get("overlay_text") != n.get("overlay_text"):
                    txt = n.get("overlay_text")
                    changes.append(f"{'Added' if txt else 'Removed'} overlay text on {sid}")

        # Reordering
        if orig_ids != new_ids and not changes:
            changes.append("Reordered timeline shots")

        return changes or ["No changes detected"]

    async def edit(
        self,
        current_plan: dict,
        history: list[dict[str, str]],
        message: str,
    ) -> dict[str, Any]:
        system_prompt = self._build_system_prompt(current_plan)

        messages: list[dict] = [{"role": "system", "content": system_prompt}]

        # Add conversation history
        for h in history:
            messages.append({"role": h["role"], "content": h["content"]})

        # Add current plan context + user message
        messages.append({
            "role": "user",
            "content": (
                f"Current plan (for reference):\n```json\n{json.dumps(current_plan, indent=2)}\n```\n\n"
                f"User instruction: {message}"
            ),
        })

        logger.info("Calling ChatEditor LLM | model=%s history_len=%d", self.model, len(history))

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,  # type: ignore
            temperature=0.3,     # low temp for precise JSON editing
            max_tokens=8000,
        )

        raw_output = response.choices[0].message.content or ""
        logger.debug("ChatEditor raw output length=%d", len(raw_output))

        reply, new_plan = self._extract_reply_and_plan(raw_output)

        if not new_plan:
            raise ValueError("LLM did not return a valid plan JSON. Please try rephrasing.")

        changes = self._describe_changes(current_plan, new_plan)

        return {
            "reply": reply,
            "plan": new_plan,
            "changes": changes,
        }
