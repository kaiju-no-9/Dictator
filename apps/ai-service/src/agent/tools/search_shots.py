"""
Tool: search_shots
"""

from typing import Any


def search_shots(
    shots_context: list[dict[str, Any]],
    query: str,
) -> list[dict[str, Any]]:
    """
    Search shots by transcript keyword or tag matching.
    """
    q = query.lower().strip()
    matching: list[dict[str, Any]] = []

    for s in shots_context:
        text = str(s.get("transcript") or "").lower()
        tags = [str(t).lower() for t in s.get("tags", [])]
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
