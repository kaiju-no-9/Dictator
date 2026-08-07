"""
Tool: propose_plan
"""

import json
from typing import Any


def propose_plan(plan_json: str | dict[str, Any]) -> dict[str, Any]:
    """
    Submits a candidate EditPlan JSON.
    """
    if isinstance(plan_json, str):
        try:
            return json.loads(plan_json)
        except Exception as exc:
            return {"error": f"Failed to parse plan_json as JSON: {exc}"}
    return plan_json


PROPOSE_PLAN_SCHEMA = {
    "name": "propose_plan",
    "description": "Submits a candidate EditPlan JSON string for structural validation and finalization.",
    "parameters": {
        "type": "object",
        "properties": {
            "plan_json": {
                "type": "string",
                "description": "Complete EditPlan JSON string matching the DictatorEditPlan schema.",
            }
        },
        "required": ["plan_json"],
    },
}
