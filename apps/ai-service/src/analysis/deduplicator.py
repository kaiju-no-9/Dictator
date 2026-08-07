"""
Deduplicator — Group duplicate takes and flag best takes.

Groups shots by transcript similarity and temporal proximity,
assigning group_id and setting is_best_take.
"""

from __future__ import annotations

import logging
from difflib import SequenceMatcher
from typing import Any

logger = logging.getLogger(__name__)


def deduplicate_shots(
    shots: list[dict[str, Any]],
    similarity_threshold: float = 0.65,
) -> list[dict[str, Any]]:
    """
    Group similar/repeated takes and mark the best take in each group.

    Args:
        shots: List of enriched shot dicts.
        similarity_threshold: Ratio threshold (0.0 to 1.0) above which transcripts are considered takes of the same shot.

    Returns:
        List of shot dicts with updated 'group_id' and 'is_best_take' fields.
    """
    if not shots:
        return []

    logger.info("Deduplicating %d shots | threshold=%.2f", len(shots), similarity_threshold)

    groups: list[list[dict[str, Any]]] = []
    processed_ids: set[str] = set()

    for i, shot_a in enumerate(shots):
        sid_a = shot_a["shot_id"]
        if sid_a in processed_ids:
            continue

        text_a = shot_a.get("transcript", "").strip().lower()
        current_group = [shot_a]
        processed_ids.add(sid_a)

        # Skip text matching for very short / silent shots
        if len(text_a) >= 10:
            for j in range(i + 1, len(shots)):
                shot_b = shots[j]
                sid_b = shot_b["shot_id"]
                if sid_b in processed_ids:
                    continue

                text_b = shot_b.get("transcript", "").strip().lower()
                if len(text_b) < 10:
                    continue

                ratio = SequenceMatcher(None, text_a, text_b).ratio()
                if ratio >= similarity_threshold:
                    current_group.append(shot_b)
                    processed_ids.add(sid_b)

        groups.append(current_group)

    # Process groups and set group_id + is_best_take
    result_shots: list[dict[str, Any]] = []

    for group_idx, group in enumerate(groups, start=1):
        group_id = f"group_{group_idx:03d}" if len(group) > 1 else None

        # Find best take in group based on quality_score and duration
        best_shot_id = None
        if len(group) > 1:
            best_shot = max(
                group,
                key=lambda s: (
                    s.get("quality_score", 3),
                    s.get("duration", s.get("end", 0) - s.get("start", 0)),
                ),
            )
            best_shot_id = best_shot["shot_id"]

        for shot in group:
            s_copy = dict(shot)
            s_copy["group_id"] = group_id
            if group_id:
                s_copy["is_best_take"] = (shot["shot_id"] == best_shot_id)
            else:
                s_copy["is_best_take"] = True
            result_shots.append(s_copy)

    # Preserve original shot order
    shot_map = {s["shot_id"]: s for s in result_shots}
    ordered_result = [shot_map[s["shot_id"]] for s in shots if s["shot_id"] in shot_map]

    logger.info("Deduplication complete | total_groups=%d", len(groups))
    return ordered_result
