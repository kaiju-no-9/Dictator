"""
Tool: get_shots
"""

from typing import Any


def get_shots(shots_context: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Returns the complete list of available source shots.
    """
    return [
        {
            "shot_id": s["shot_id"],
            "source_file": s.get("source_file", ""),
            "start": s.get("start", 0.0),
            "end": s.get("end", 0.0),
            "duration": s.get("duration", 0.0),
            "group_id": s.get("group_id"),
            "role": s.get("role", "primary"),
            "is_best_take": s.get("is_best_take", True),
            "quality_score": s.get("quality_score", 3),
        }
        for s in shots_context
    ]


GET_SHOTS_SCHEMA = {
    "name": "get_shots",
    "description": "Returns the complete list of available source shots for the project.",
    "parameters": {
        "type": "object",
        "properties": {},
        "required": [],
    },
}
