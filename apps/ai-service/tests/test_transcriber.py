"""
Pytest unit tests for Transcriber (src/analysis/transcriber.py).
"""

from unittest.mock import patch, MagicMock
from src.analysis.transcriber import transcribe_audio


def test_transcribe_audio_missing_file():
    try:
        transcribe_audio("/non/existent/file.wav", [])
        assert False, "Should have raised FileNotFoundError"
    except FileNotFoundError:
        assert True


@patch("faster_whisper.WhisperModel")
def test_transcribe_audio_alignment(mock_whisper_cls, tmp_path):
    media_file = tmp_path / "audio.wav"
    media_file.write_bytes(b"dummy audio")

    # Mock Whisper word output
    mock_word1 = MagicMock()
    mock_word1.word = "Hello"
    mock_word1.start = 1.0
    mock_word1.end = 1.5
    mock_word1.probability = 0.95

    mock_word2 = MagicMock()
    mock_word2.word = "world"
    mock_word2.start = 1.6
    mock_word2.end = 2.0
    mock_word2.probability = 0.90

    mock_seg = MagicMock()
    mock_seg.text = "Hello world"
    mock_seg.start = 1.0
    mock_seg.end = 2.0
    mock_seg.words = [mock_word1, mock_word2]

    mock_info = MagicMock()
    mock_info.language = "en"
    mock_info.language_probability = 0.99

    mock_model = MagicMock()
    mock_model.transcribe.return_value = ([mock_seg], mock_info)
    mock_whisper_cls.return_value = mock_model

    shots = [
        {"shot_id": "shot_0001", "start": 0.0, "end": 5.0},
    ]

    segments = transcribe_audio(str(media_file), shots)
    assert len(segments) == 1
    assert segments[0].shot_id == "shot_0001"
    assert segments[0].text == "Hello world"
    assert len(segments[0].words) == 2
