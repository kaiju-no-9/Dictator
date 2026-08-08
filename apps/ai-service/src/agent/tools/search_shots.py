"""
Tool: search_shots
"""

from typing import Any


def search_shots(
    shots_context: list[dict[str, Any]],
    query: str,
    transcript_context: list[dict[str, Any]] | None = None,
    tags_context: dict[str, list[str]] | None = None,
) -> list[dict[str, Any]]:
    """
    Search shots by transcript keyword or tag matching.
    """
    q = query.lower().strip()
    matching: list[dict[str, Any]] = []

    tx_by_shot: dict[str, str] = {}
    if transcript_context:
        for item in transcript_context:
            shot_id = item.get("shot_id")
            if shot_id:
                tx_by_shot[shot_id] = str(item.get("text") or "").lower()

    for s in shots_context:
        shot_id = s.get("shot_id")
        text = str(s.get("transcript") or (tx_by_shot.get(shot_id) if shot_id else "")).lower()

        shot_tags = s.get("tags")
        if shot_tags is None and tags_context and shot_id:
            shot_tags = tags_context.get(shot_id, [])
        tags = [str(t).lower() for t in (shot_tags or [])]

        desc = str(s.get("visual_description") or "").lower()

        if q in text or q in desc or any(q in tag for tag in tags):
            matching.append(s)

    return matching


SEARCH_SHOTS_SCHEMA = {
    "name": "search_shots",
    "description": "Searches available shots by keyword matching against transcripts, tags, and visual descriptions.",
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Keyword or topic search query (e.g. 'intro', 'beach', 'interview')",
            }
        },
        "required": ["query"],
    },
}
