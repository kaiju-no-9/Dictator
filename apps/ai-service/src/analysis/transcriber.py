"""
Transcriber — Whisper audio transcription wrapper.

Uses faster-whisper to generate segment and word-level timestamps,
then aligns transcript text with detected shot boundaries.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from src.config import settings

logger = logging.getLogger(__name__)


@dataclass
class WordTimestamp:
    word: str
    start: float
    end: float
    confidence: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "word": self.word,
            "start": self.start,
            "end": self.end,
            "confidence": self.confidence,
        }


@dataclass
class TranscriptSegment:
    shot_id: str
    text: str
    start: float
    end: float
    words: list[WordTimestamp]
    speaker_id: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "shot_id": self.shot_id,
            "text": self.text,
            "start": self.start,
            "end": self.end,
            "speaker_id": self.speaker_id,
            "words": [w.to_dict() for w in self.words],
        }


def transcribe_audio(
    audio_or_video_path: str,
    shots: list[dict[str, Any]],
    model_size: str | None = None,
) -> list[TranscriptSegment]:
    """
    Transcribe audio/video using faster-whisper and map transcript segments to shots.

    Args:
        audio_or_video_path: Local filesystem path to media file.
        shots: List of shot dicts containing at least 'shot_id', 'start', and 'end'.
        model_size: Whisper model size (tiny, base, small, medium, large-v3).

    Returns:
        List of TranscriptSegment objects associated with specific shot_ids.
    """
    if not Path(audio_or_video_path).exists():
        raise FileNotFoundError(f"Media file not found: {audio_or_video_path}")

    effective_model_size = model_size or settings.whisper_model_size
    logger.info(
        "Starting transcription | file=%s model=%s shots_count=%d",
        audio_or_video_path,
        effective_model_size,
        len(shots),
    )

    try:
        from faster_whisper import WhisperModel

        model = WhisperModel(
            effective_model_size,
            device="cpu",
            compute_type="int8",
        )
        segments_raw, info = model.transcribe(
            audio_or_video_path,
            word_timestamps=True,
            beam_size=5,
        )
    except Exception as exc:
        logger.warning(
            "faster-whisper failed (%s) — falling back to mock/empty transcript for testing",
            exc,
        )
        return []

    logger.info(
        "Transcription complete | language=%s probability=%.2f",
        info.language,
        info.language_probability,
    )

    # Collect raw whisper segments with word timestamps
    raw_segments: list[dict] = []
    for segment in segments_raw:
        words: list[WordTimestamp] = []
        if segment.words:
            for w in segment.words:
                words.append(
                    WordTimestamp(
                        word=w.word.strip(),
                        start=round(w.start, 4),
                        end=round(w.end, 4),
                        confidence=round(w.probability, 4),
                    )
                )
        raw_segments.append({
            "text": segment.text.strip(),
            "start": round(segment.start, 4),
            "end": round(segment.end, 4),
            "words": words,
        })

    # Map raw segments to shot intervals
    transcript_by_shot: list[TranscriptSegment] = []
    for shot in shots:
        shot_id = shot["shot_id"]
        shot_start = shot["start"]
        shot_end = shot["end"]

        # Find words falling inside this shot
        matching_words: list[WordTimestamp] = []
        shot_text_parts: list[str] = []

        for seg in raw_segments:
            # Overlap check
            if seg["end"] >= shot_start and seg["start"] <= shot_end:
                for w in seg["words"]:
                    if shot_start <= w.start <= shot_end:
                        matching_words.append(w)
                        shot_text_parts.append(w.word)

        shot_text = " ".join(shot_text_parts).strip()
        if shot_text or matching_words:
            t_start = matching_words[0].start if matching_words else shot_start
            t_end = matching_words[-1].end if matching_words else shot_end
            transcript_by_shot.append(
                TranscriptSegment(
                    shot_id=shot_id,
                    text=shot_text,
                    start=round(t_start, 4),
                    end=round(t_end, 4),
                    words=matching_words,
                )
            )

    logger.info("Mapped transcript segments to %d shots", len(transcript_by_shot))
    return transcript_by_shot
