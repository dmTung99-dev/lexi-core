import os
from unittest.mock import patch

from app import stt


class _FakeSegment:
    def __init__(self, text: str) -> None:
        self.text = text


class _FakeModel:
    def __init__(self) -> None:
        self.seen_path: str | None = None
        self.kwargs: dict = {}

    def transcribe(self, path: str, language=None, **kwargs):
        self.seen_path = path
        self.kwargs = kwargs
        # The temp file must exist and be readable at call time.
        assert os.path.exists(path)
        with open(path, "rb") as f:
            assert f.read() == b"fake-wav-bytes"
        return [_FakeSegment("xin"), _FakeSegment("chao")], None


def test_transcribe_writes_then_cleans_up_temp_file():
    fake_model = _FakeModel()
    with patch("app.stt._load_model", return_value=fake_model):
        result = stt.transcribe(b"fake-wav-bytes", "vi")

    assert result == "xin chao"
    assert fake_model.seen_path is not None
    # Temp file must be deleted after transcribe() returns.
    assert not os.path.exists(fake_model.seen_path)


def test_transcribe_cleans_up_temp_file_even_if_model_raises():
    class _RaisingModel:
        def __init__(self) -> None:
            self.seen_path: str | None = None

        def transcribe(self, path: str, language=None, **kwargs):
            self.seen_path = path
            raise RuntimeError("model failure")

    raising_model = _RaisingModel()
    with patch("app.stt._load_model", return_value=raising_model):
        try:
            stt.transcribe(b"fake-wav-bytes", "vi")
            raise AssertionError("expected RuntimeError to propagate")
        except RuntimeError:
            pass

    assert raising_model.seen_path is not None
    assert not os.path.exists(raising_model.seen_path)


def _run(prompt):
    fake_model = _FakeModel()
    with patch("app.stt._load_model", return_value=fake_model):
        stt.transcribe(b"fake-wav-bytes", "en", prompt)
    return fake_model.kwargs


def test_transcribe_forwards_prompt_as_initial_prompt():
    assert _run("Topic: travel.")["initial_prompt"] == "Topic: travel."


def test_transcribe_trims_prompt():
    assert _run("  Topic: travel.  ")["initial_prompt"] == "Topic: travel."


def test_transcribe_empty_or_whitespace_prompt_becomes_none():
    assert _run("")["initial_prompt"] is None
    assert _run("   \n ")["initial_prompt"] is None
    assert _run(None)["initial_prompt"] is None


def test_transcribe_caps_prompt_to_last_400_chars():
    prompt = "a" * 300 + "b" * 400
    assert _run(prompt)["initial_prompt"] == "b" * 400


def test_transcribe_enables_vad_and_disables_conditioning():
    kwargs = _run(None)
    assert kwargs["vad_filter"] is True
    assert kwargs["vad_parameters"] == {"min_silence_duration_ms": 500}
    assert kwargs["condition_on_previous_text"] is False
    assert kwargs["beam_size"] == 5
