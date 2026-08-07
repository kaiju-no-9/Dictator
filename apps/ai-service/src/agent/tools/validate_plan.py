"""
Tool: validate_plan
"""

import json
from typing import Any

from src.validation.structural import validate_edit_plan


def validate_plan(plan_json: str | dict[str, Any]) -> dict[str, Any]:
    """
    Runs structural validation against a candidate EditPlan.
    """
    if isinstance(plan_json, str):
        try:
            parsed = json.loads(plan_json)
        except Exception as exc:
            return {"valid": False, "violations": [{"rule_id": "V-JSON", "severity": "fatal", "message": str(exc)}]}
    else:
        parsed = plan_json

    result = validate_edit_plan(parsed)
    return result.to_dict()


VALIDATE_PLAN_SCHEMA = {
    "name": "validate_plan",
    "description": "Validates a candidate EditPlan against all structural editing rules (V-001 through V-016).",
    "parameters": {
        "type": "object",
        "properties": {
            "plan_json": {
                "type": "string",
                "description": "Complete EditPlan JSON string to validate.",
            }
        },
        "required": ["plan_json"],
    },
}
