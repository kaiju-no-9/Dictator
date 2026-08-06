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


class TranscriptSegment(BaseModel):
    shot_id: str
    text: str
    start: float
    end: float
    words: list[dict[str, Any]] = []


class AnalyzeResponse(BaseModel):
    project_id: str
    shots: list[ShotResult]
    transcript: list[TranscriptSegment]
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

    all_shots: list[ShotResult] = []
    all_transcripts: list[TranscriptSegment] = []
    all_tags: dict[str, list[str]] = {}
    shot_counter = 0

    for media_file_id in request.media_file_ids:
        local_path = request.local_file_paths.get(media_file_id)
        if not local_path:
            raise HTTPException(
                status_code=422,
                detail=f"No local path provided for media_file_id: {media_file_id}",
            )

        filename = local_path.split("/")[-1]

        logger.info("Running shot detection | file=%s", filename)
        try:
            from src.analysis.shot_detector import detect_shots
            raw_shots = detect_shots(local_path)
        except Exception as exc:
            logger.error("Shot detection failed | file=%s error=%s", filename, exc)
            raise HTTPException(
                status_code=500,
                detail=f"Shot detection failed for {filename}: {exc}",
            )

        logger.info("Running transcription | file=%s shots=%d", filename, len(raw_shots))
        try:
            from src.analysis.transcriber import transcribe_shots
            shot_transcripts = transcribe_shots(local_path, raw_shots)
        except Exception as exc:
            logger.warning("Transcription failed | file=%s error=%s", filename, exc)
            shot_transcripts = {}

        logger.info("Running enrichment | file=%s", filename)
        try:
            from src.analysis.enricher import enrich_shots
            shot_tags = await enrich_shots(raw_shots, shot_transcripts)
        except Exception as exc:
            logger.warning("Enrichment failed | file=%s error=%s", filename, exc)
            shot_tags = {}

        for raw in raw_shots:
            shot_counter += 1
            shot_id = f"shot_{shot_counter:04d}"

            transcript_text = shot_transcripts.get(raw["index"], {}).get("text")
            transcript_words = shot_transcripts.get(raw["index"], {}).get("words", [])
            tags = shot_tags.get(raw["index"], [])

            shot = ShotResult(
                shot_id=shot_id,
                source_file=filename,
                start=raw["start"],
                end=raw["end"],
                duration=round(raw["end"] - raw["start"], 3),
                transcript=transcript_text,
                tags=tags,
            )
            all_shots.append(shot)

            if transcript_text:
                all_transcripts.append(
                    TranscriptSegment(
                        shot_id=shot_id,
                        text=transcript_text,
                        start=raw["start"],
                        end=raw["end"],
                        words=transcript_words,
                    )
                )

            all_tags[shot_id] = tags

    logger.info("Running deduplication | total_shots=%d", len(all_shots))
    try:
        from src.analysis.deduplicator import group_shots
        all_shots = group_shots(all_shots)
    except Exception as exc:
        logger.warning("Deduplication failed | error=%s", exc)

    total_duration = sum(s.duration for s in all_shots)

    logger.info(
        "Analysis complete | project=%s shots=%d duration=%.1fs",
        request.project_id,
        len(all_shots),
        total_duration,
    )

    return AnalyzeResponse(
        project_id=request.project_id,
        shots=all_shots,
        transcript=all_transcripts,
        tags=all_tags,
        total_shots=len(all_shots),
        total_duration_seconds=round(total_duration, 2),
    )
