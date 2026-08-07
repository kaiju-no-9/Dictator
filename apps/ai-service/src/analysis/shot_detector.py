"""
Shot Detector — PySceneDetect wrapper.

Segments a video into shots using content-aware scene detection.
Returns a list of Shot dicts with timing and frame information.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from src.config import settings

logger = logging.getLogger(__name__)


@dataclass
class DetectedShot:
    shot_id: str
    source_file: str
    start: float          # seconds
    end: float            # seconds
    duration: float       # seconds
    frame_start: int
    frame_end: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "shot_id": self.shot_id,
            "source_file": self.source_file,
            "start": self.start,
            "end": self.end,
            "duration": self.duration,
            "frame_start": self.frame_start,
            "frame_end": self.frame_end,
        }


def detect_shots(video_path: str, threshold: float | None = None) -> list[DetectedShot]:
    """
    Detect shot boundaries in a video file using PySceneDetect.

    Args:
        video_path: Local filesystem path to the video file.
        threshold: Scene-change sensitivity (0–100). Lower = more sensitive.
                   Defaults to SCENEDETECT_THRESHOLD env var (default 27.0).

    Returns:
        Ordered list of DetectedShot objects.

    Raises:
        FileNotFoundError: If the video file does not exist.
        RuntimeError: If PySceneDetect fails to open or process the video.
    """
    from scenedetect import SceneManager, open_video
    from scenedetect.detectors import ContentDetector

    if not Path(video_path).exists():
        raise FileNotFoundError(f"Video file not found: {video_path}")

    effective_threshold = threshold if threshold is not None else settings.scenedetect_threshold
    logger.info(
        "Starting shot detection | file=%s threshold=%.1f",
        video_path,
        effective_threshold,
    )

    video = open_video(video_path)
    fps = video.frame_rate

    scene_manager = SceneManager()
    scene_manager.add_detector(ContentDetector(threshold=effective_threshold))
    scene_manager.detect_scenes(video, show_progress=False)

    scene_list = scene_manager.get_scene_list()
    logger.info("PySceneDetect found %d scenes in %s", len(scene_list), video_path)

    if not scene_list:
        # Treat entire video as a single shot
        logger.warning("No scenes detected — treating entire video as one shot.")
        duration = video.duration.get_seconds() if video.duration else 0.0
        return [
            DetectedShot(
                shot_id="shot_0001",
                source_file=video_path,
                start=0.0,
                end=duration,
                duration=duration,
                frame_start=0,
                frame_end=int(duration * fps),
            )
        ]

    shots: list[DetectedShot] = []
    for idx, (start_time, end_time) in enumerate(scene_list, start=1):
        start_sec = start_time.get_seconds()
        end_sec = end_time.get_seconds()
        duration_sec = end_sec - start_sec
        frame_start = start_time.get_frames()
        frame_end = end_time.get_frames()

        shot = DetectedShot(
            shot_id=f"shot_{idx:04d}",
            source_file=video_path,
            start=round(start_sec, 4),
            end=round(end_sec, 4),
            duration=round(duration_sec, 4),
            frame_start=frame_start,
            frame_end=frame_end,
        )
        shots.append(shot)

    logger.info("Shot detection complete | total_shots=%d", len(shots))
    return shots
