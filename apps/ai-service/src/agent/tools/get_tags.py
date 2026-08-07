"""
Tool: get_tags
"""

from typing import Any


def get_tags(
    tags_context: dict[str, list[str]],
    shot_id: str | None = None,
) -> dict[str, list[str]]:
    """
    Returns semantic tags for shots.
    """
    if shot_id:
        return {shot_id: tags_context.get(shot_id, [])}
    return tags_context


GET_TAGS_SCHEMA = {
    "name": "get_tags",
    "description": "Returns semantic tags for shots. Optionally filter by shot_id.",
    "parameters": {
        "type": "object",
        "properties": {
            "shot_id": {
                "type": "string",
                "description": "Optional shot_id filter (e.g. shot_0001)",
            }
        },
        "required": [],
    },
}
