"""
Pytest unit tests for Shot Detector (src/analysis/shot_detector.py).
"""

from unittest.mock import MagicMock, patch
import pytest

from src.analysis.shot_detector import detect_shots


def test_detect_shots_file_not_found():
    with pytest.raises(FileNotFoundError):
        detect_shots("/non/existent/video.mp4")


@patch("scenedetect.open_video")
@patch("scenedetect.SceneManager")
def test_detect_shots_fallback_single_shot(mock_scene_manager, mock_open_video, tmp_path):
    video_file = tmp_path / "test.mp4"
    video_file.write_bytes(b"dummy video content")

    mock_vid = MagicMock()
    mock_vid.frame_rate = 30.0
    mock_vid.duration.get_seconds.return_value = 10.0
    mock_open_video.return_value = mock_vid

    mock_sm = MagicMock()
    mock_sm.get_scene_list.return_value = []
    mock_scene_manager.return_value = mock_sm

    shots = detect_shots(str(video_file))
    assert len(shots) == 1
    assert shots[0].shot_id == "shot_0001"
    assert shots[0].start == 0.0
    assert shots[0].end == 10.0
