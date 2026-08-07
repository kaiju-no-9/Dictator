"""
Tool: get_transcript
"""

from typing import Any


def get_transcript(
    transcript_context: list[dict[str, Any]],
    shot_id: str | None = None,
) -> list[dict[str, Any]]:
    """
    Returns transcript segments. If shot_id is provided, returns only that shot's transcript.
    """
    if shot_id:
        return [t for t in transcript_context if t.get("shot_id") == shot_id]
    return transcript_context


GET_TRANSCRIPT_SCHEMA = {
    "name": "get_transcript",
    "description": "Returns dialogue transcript segments. Optionally filter by shot_id.",
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
