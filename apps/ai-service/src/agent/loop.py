"""
Agent Loop — Tool-calling loop using AsyncOpenAI / OpenRouter.

Executes an iterative function-calling loop against OpenRouter until the LLM
proposes a valid EditPlan or reaches max_iterations.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from openai import AsyncOpenAI

from src.config import settings
from src.agent.prompts.system import SYSTEM_PROMPT
from src.agent.tools.get_shots import GET_SHOTS_SCHEMA, get_shots
from src.agent.tools.get_transcript import GET_TRANSCRIPT_SCHEMA, get_transcript
from src.agent.tools.get_tags import GET_TAGS_SCHEMA, get_tags
from src.agent.tools.search_shots import SEARCH_SHOTS_SCHEMA, search_shots
from src.agent.tools.propose_plan import PROPOSE_PLAN_SCHEMA, propose_plan
from src.agent.tools.validate_plan import VALIDATE_PLAN_SCHEMA, validate_plan

logger = logging.getLogger(__name__)


TOOLS_SCHEMAS = [
    {"type": "function", "function": GET_SHOTS_SCHEMA},
    {"type": "function", "function": GET_TRANSCRIPT_SCHEMA},
    {"type": "function", "function": GET_TAGS_SCHEMA},
    {"type": "function", "function": SEARCH_SHOTS_SCHEMA},
    {"type": "function", "function": PROPOSE_PLAN_SCHEMA},
    {"type": "function", "function": VALIDATE_PLAN_SCHEMA},
]


class AgentLoop:
    """
    Manages state and tool calls for generating an EditPlan via OpenRouter.
    """

    def __init__(
        self,
        project_id: str,
        shots_context: list[dict[str, Any]],
        transcript_context: list[dict[str, Any]],
        tags_context: dict[str, list[str]],
        user_prompt: str | None = None,
    ) -> None:
        self.project_id = project_id
        self.shots_context = shots_context
        self.transcript_context = transcript_context
        self.tags_context = tags_context
        self.user_prompt = user_prompt

        self.client = AsyncOpenAI(
            api_key=settings.openrouter_api_key,
            base_url=settings.openrouter_base_url,
        )
        self.model = settings.agent_planner_model
        self.max_iterations = settings.agent_max_tool_calls

        self._last_proposed_plan: dict[str, Any] | None = None

    async def run(self) -> dict[str, Any]:
        """Run the tool-calling loop until a valid plan is produced."""
        logger.info(
            "Starting AgentLoop | project=%s model=%s shots=%d",
            self.project_id,
            self.model,
            len(self.shots_context),
        )

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Generate an Edit Plan for project '{self.project_id}'. "
                    f"Available shots: {len(self.shots_context)} shots.\n"
                    f"{'Instruction: ' + self.user_prompt if self.user_prompt else ''}\n"
                    "Start by inspecting shots with `get_shots` and dialogue with `get_transcript`."
                ),
            },
        ]

        for iteration in range(1, self.max_iterations + 1):
            logger.debug("AgentLoop iteration %d/%d", iteration, self.max_iterations)

            try:
                response = await self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,  # type: ignore
                    tools=TOOLS_SCHEMAS,  # type: ignore
                    tool_choice="auto",
                    temperature=0.3,
                    max_tokens=4000,
                )
            except Exception as exc:
                logger.error("LLM tool call error on iteration %d: %s", iteration, exc)
                raise RuntimeError(f"OpenRouter API call failed: {exc}")

            message = response.choices[0].message
            tool_calls = message.tool_calls

            # Append assistant message
            assistant_msg: dict[str, Any] = {"role": "assistant"}
            if message.content:
                assistant_msg["content"] = message.content
            if tool_calls:
                assistant_msg["tool_calls"] = [tc.model_dump() for tc in tool_calls]
            messages.append(assistant_msg)

            if not tool_calls:
                # Agent returned text without calling tools
                logger.info("Agent turn ended without tool calls on iteration %d", iteration)

                # Check if text contains JSON plan fallback
                if message.content:
                    extracted = self._extract_json_plan(message.content)
                    if extracted:
                        val = validate_plan(extracted)
                        if val.get("valid"):
                            return extracted

                # Prompt agent to submit via propose_plan
                messages.append({
                    "role": "user",
                    "content": "Please submit your complete Edit Plan using the `propose_plan` tool.",
                })
                continue

            # Execute tool calls
            for tc in tool_calls:
                func_name = tc.function.name
                func_args = json.loads(tc.function.arguments or "{}")

                logger.info("Tool invocation | tool=%s args=%s", func_name, func_args)
                tool_output = self._dispatch_tool(func_name, func_args)

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(tool_output),
                })

                # Check if propose_plan or validate_plan succeeded
                if func_name == "propose_plan" and isinstance(tool_output, dict) and "error" not in tool_output:
                    self._last_proposed_plan = tool_output

                if func_name == "validate_plan" and isinstance(tool_output, dict):
                    if tool_output.get("valid") and self._last_proposed_plan:
                        logger.info("Validated plan achieved on iteration %d", iteration)
                        return self._last_proposed_plan

        # If loop finishes without explicit valid plan, return last proposed if valid
        if self._last_proposed_plan:
            val = validate_plan(self._last_proposed_plan)
            if val.get("valid"):
                return self._last_proposed_plan

        raise TimeoutError(f"Agent did not produce a valid plan within {self.max_iterations} tool call iterations.")

    def _dispatch_tool(self, name: str, args: dict[str, Any]) -> Any:
        """Execute local tool implementation."""
        if name == "get_shots":
            return get_shots(self.shots_context)
        elif name == "get_transcript":
            return get_transcript(self.transcript_context, args.get("shot_id"))
        elif name == "get_tags":
            return get_tags(self.tags_context, args.get("shot_id"))
        elif name == "search_shots":
            return search_shots(self.shots_context, args.get("query", ""))
        elif name == "propose_plan":
            return propose_plan(args.get("plan_json", ""))
        elif name == "validate_plan":
            return validate_plan(args.get("plan_json", ""))
        else:
            return {"error": f"Unknown tool: {name}"}

    def _extract_json_plan(self, text: str) -> dict[str, Any] | None:
        """Regex fallback to extract EditPlan JSON block if agent outputs plain text."""
        match = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
        if not match:
            match = re.search(r"(\{[^{}]*\"timeline\"[^{}]*\})", text, re.DOTALL)

        if match:
            try:
                return json.loads(match.group(1))
            except Exception:
                pass
        return None
