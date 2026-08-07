import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter()


class AnalyzeRequest(BaseModel):
    project_id: str = Field(..., description="UUID of the project")
    media_file_ids: list[str] = Field(..., min_length=1, description="DB IDs of media_files to analyze")
    local_file_paths: dict[str, str] = Field(
        ...,
        description="Map of media_file_id → absolute local path on disk",
    )


class ShotResult(BaseModel):
    shot_id: str
    source_file: str
    start: float
    end: float
    duration: float
    transcript: str | None = None
    tags: list[str] = []
    visual_description: str | None = None
    quality_score: float | None = None
    group_id: str | None = None
    is_best_take: bool = True
    role: str = "primary"


class TranscriptSegmentResult(BaseModel):
    shot_id: str
    text: str
    start: float
    end: float
    speaker_id: int | None = None
    words: list[dict[str, Any]] = []


class AnalyzeResponse(BaseModel):
    project_id: str
    shots: list[ShotResult]
    transcript: list[TranscriptSegmentResult]
    tags: dict[str, list[str]]
    total_shots: int
    total_duration_seconds: float


@router.post("", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    logger.info(
        "Analysis started | project=%s files=%d",
        request.project_id,
        len(request.media_file_ids),
    )

    raw_shots_list: list[dict[str, Any]] = []
    raw_transcripts_list: list[dict[str, Any]] = []

    for media_file_id in request.media_file_ids:
        local_path = request.local_file_paths.get(media_file_id)
        if not local_path:
            raise HTTPException(
                status_code=422,
                detail=f"No local path provided for media_file_id: {media_file_id}",
            )

        filename = local_path.split("/")[-1]

        # 1. Shot Detection
        logger.info("Running shot detection | file=%s", filename)
        try:
            from src.analysis.shot_detector import detect_shots
            detected = detect_shots(local_path)
            file_shots = [s.to_dict() for s in detected]
        except Exception as exc:
            logger.error("Shot detection failed | file=%s error=%s", filename, exc)
            raise HTTPException(
                status_code=500,
                detail=f"Shot detection failed for {filename}: {exc}",
            )

        # 2. Transcription
        logger.info("Running transcription | file=%s shots=%d", filename, len(file_shots))
        try:
            from src.analysis.transcriber import transcribe_audio
            file_transcripts = transcribe_audio(local_path, file_shots)
            file_transcripts_dict = [t.to_dict() for t in file_transcripts]
        except Exception as exc:
            logger.warning("Transcription failed | file=%s error=%s", filename, exc)
            file_transcripts_dict = []

        raw_shots_list.extend(file_shots)
        raw_transcripts_list.extend(file_transcripts_dict)

    # Re-index shot_ids globally across all media files
    id_remapping: dict[str, str] = {}
    for idx, shot in enumerate(raw_shots_list, start=1):
        old_id = shot["shot_id"]
        new_id = f"shot_{idx:04d}"
        id_remapping[old_id] = new_id
        shot["shot_id"] = new_id

    for t in raw_transcripts_list:
        t["shot_id"] = id_remapping.get(t["shot_id"], t["shot_id"])

    # 3. Enrichment
    logger.info("Running enrichment | total_shots=%d", len(raw_shots_list))
    try:
        from src.analysis.enricher import ShotEnricher
        enricher = ShotEnricher()
        enriched_shots = await enricher.enrich_shots(raw_shots_list, raw_transcripts_list)
    except Exception as exc:
        logger.warning("Enrichment failed | error=%s", exc)
        enriched_shots = raw_shots_list

    # 4. Deduplication
    logger.info("Running deduplication | total_shots=%d", len(enriched_shots))
    try:
        from src.analysis.deduplicator import deduplicate_shots
        final_shots = deduplicate_shots(enriched_shots)
    except Exception as exc:
        logger.warning("Deduplication failed | error=%s", exc)
        final_shots = enriched_shots

    # Prepare response objects
    shots_out: list[ShotResult] = []
    tags_out: dict[str, list[str]] = {}

    for s in final_shots:
        sid = s["shot_id"]
        shots_out.append(
            ShotResult(
                shot_id=sid,
                source_file=s.get("source_file", ""),
                start=s.get("start", 0.0),
                end=s.get("end", 0.0),
                duration=s.get("duration", 0.0),
                transcript=s.get("transcript"),
                tags=s.get("tags", []),
                visual_description=s.get("visual_description"),
                quality_score=s.get("quality_score"),
                group_id=s.get("group_id"),
                is_best_take=s.get("is_best_take", True),
                role=s.get("role", "primary"),
            )
        )
        tags_out[sid] = s.get("tags", [])

    transcripts_out = [TranscriptSegmentResult(**t) for t in raw_transcripts_list]
    total_duration = sum(s.duration for s in shots_out)

    logger.info(
        "Analysis complete | project=%s shots=%d duration=%.1fs",
        request.project_id,
        len(shots_out),
        total_duration,
    )

    return AnalyzeResponse(
        project_id=request.project_id,
        shots=shots_out,
        transcript=transcripts_out,
        tags=tags_out,
        total_shots=len(shots_out),
        total_duration_seconds=round(total_duration, 2),
    )
