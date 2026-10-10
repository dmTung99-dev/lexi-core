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


# --- Model choice -----------------------------------------------------------


def test_load_model_uses_multilingual_small_int8_cpu():
    with patch("app.stt._model", None), patch("app.stt.WhisperModel") as mock_cls:
        stt._load_model()
    args, kwargs = mock_cls.call_args
    assert args == ("small",)
    assert kwargs["device"] == "cpu"
    assert kwargs["compute_type"] == "int8"


# --- Auto (language=None) mode: per-chunk en/vi detection --------------------


class _ChunkModel:
    """Fake model for auto mode. Chunks are plain strings (e.g. "c1"); each
    maps to the language probabilities detect_language reports and the text
    transcribe returns for it."""

    def __init__(self, probs_by_chunk: dict, text_by_chunk: dict) -> None:
        self.probs_by_chunk = probs_by_chunk
        self.text_by_chunk = text_by_chunk
        self.detect_calls: list = []
        self.transcribe_calls: list = []

    def detect_language(self, audio=None, **kwargs):
        self.detect_calls.append(audio)
        probs = sorted(self.probs_by_chunk[audio].items(), key=lambda kv: -kv[1])
        top_lang, top_p = probs[0]
        return top_lang, top_p, probs

    def transcribe(self, audio, language=None, **kwargs):
        self.transcribe_calls.append((audio, language, kwargs))
        return [_FakeSegment(t) for t in self.text_by_chunk[audio].split("|")], None


def _run_auto(model, chunks, speech=None, prompt=None):
    speech = [{"start": 0, "end": 16000}] if speech is None else speech
    seen = {}

    def fake_decode(path, sampling_rate=16000, **kwargs):
        seen["decode_path"] = path
        seen["sampling_rate"] = sampling_rate
        with open(path, "rb") as f:
            seen["decode_bytes"] = f.read()
        return "decoded-audio"

    def fake_timestamps(audio, vad_options=None, sampling_rate=16000, **kwargs):
        seen["vad_audio"] = audio
        seen["vad_options"] = vad_options
        return speech

    def fake_collect(audio, chunks_ts, sampling_rate=16000, max_duration=float("inf")):
        seen["collect_args"] = (audio, chunks_ts, sampling_rate, max_duration)
        return list(chunks), [{} for _ in chunks]

    with patch("app.stt._load_model", return_value=model), patch(
        "app.stt.decode_audio", side_effect=fake_decode
    ), patch("app.stt.get_speech_timestamps", side_effect=fake_timestamps), patch(
        "app.stt.collect_chunks", side_effect=fake_collect
    ):
        result = stt.transcribe(b"fake-wav-bytes", None, prompt)
    return result, seen


def test_auto_detects_language_per_chunk_and_joins_in_order():
    model = _ChunkModel(
        {"c1": {"en": 0.9, "vi": 0.05}, "c2": {"vi": 0.8, "en": 0.1}, "c3": {"en": 0.7}},
        {"c1": "I live in", "c2": "Hà Nội", "c3": "near the|lake."},
    )
    result, _ = _run_auto(model, ["c1", "c2", "c3"])
    assert result == "I live in Hà Nội near the lake."
    assert model.detect_calls == ["c1", "c2", "c3"]
    assert [(a, lang) for a, lang, _ in model.transcribe_calls] == [
        ("c1", "en"),
        ("c2", "vi"),
        ("c3", "en"),
    ]


def test_auto_decodes_temp_file_and_chunks_with_vad_at_most_25s():
    model = _ChunkModel({"c1": {"en": 0.9}}, {"c1": "hello"})
    speech = [{"start": 0, "end": 8000}, {"start": 20000, "end": 30000}]
    _, seen = _run_auto(model, ["c1"], speech=speech)
    assert seen["decode_bytes"] == b"fake-wav-bytes"
    assert seen["sampling_rate"] == 16000
    assert seen["vad_audio"] == "decoded-audio"
    assert seen["vad_options"].min_silence_duration_ms == 500
    assert seen["vad_options"].max_speech_duration_s <= 25
    audio, ts, sr, max_duration = seen["collect_args"]
    assert audio == "decoded-audio"
    assert ts == speech
    assert sr == 16000
    assert max_duration == 25
    # The temp file is cleaned up in auto mode too.
    assert not os.path.exists(seen["decode_path"])


def test_auto_chunk_transcription_reuses_params_without_second_vad_pass():
    model = _ChunkModel({"c1": {"en": 0.9}}, {"c1": "hello"})
    _run_auto(model, ["c1"], prompt="  Topic: travel.  ")
    _, _, kwargs = model.transcribe_calls[0]
    assert kwargs["initial_prompt"] == "Topic: travel."
    assert kwargs["beam_size"] == 5
    assert kwargs["condition_on_previous_text"] is False
    assert kwargs.get("vad_filter", False) is False


def test_auto_vi_needs_at_least_point_six():
    model = _ChunkModel({"c1": {"vi": 0.59, "en": 0.2}}, {"c1": "x"})
    _run_auto(model, ["c1"])
    assert model.transcribe_calls[0][1] == "en"


def test_auto_vi_at_exactly_point_six_and_above_en_is_vi():
    model = _ChunkModel({"c1": {"vi": 0.6, "en": 0.3}}, {"c1": "x"})
    _run_auto(model, ["c1"])
    assert model.transcribe_calls[0][1] == "vi"


def test_auto_tie_between_vi_and_en_is_en():
    # Not realistic for softmax output, but pins the strict ">" rule.
    model = _ChunkModel({"c1": {"vi": 0.7, "en": 0.7}}, {"c1": "x"})
    _run_auto(model, ["c1"])
    assert model.transcribe_calls[0][1] == "en"


def test_auto_low_confidence_everywhere_is_en():
    model = _ChunkModel({"c1": {"ja": 0.3, "vi": 0.25, "en": 0.2}}, {"c1": "x"})
    _run_auto(model, ["c1"])
    assert model.transcribe_calls[0][1] == "en"


def test_auto_other_languages_are_ignored():
    # Top language is Chinese; never transcribe as anything but en/vi.
    model = _ChunkModel(
        {"c1": {"zh": 0.9, "en": 0.05, "vi": 0.01}, "c2": {"vi": 0.65, "zh": 0.3}},
        {"c1": "a", "c2": "b"},
    )
    _run_auto(model, ["c1", "c2"])
    assert [lang for _, lang, _ in model.transcribe_calls] == ["en", "vi"]


def test_auto_missing_en_and_vi_probabilities_default_to_en():
    model = _ChunkModel({"c1": {"fr": 0.99}}, {"c1": "x"})
    _run_auto(model, ["c1"])
    assert model.transcribe_calls[0][1] == "en"


def test_auto_no_speech_returns_empty_without_calling_model():
    model = _ChunkModel({}, {})
    result, seen = _run_auto(model, [], speech=[])
    assert result == ""
    assert "collect_args" not in seen
    assert model.detect_calls == []
    assert model.transcribe_calls == []


def test_auto_skips_empty_chunks_and_blank_texts():
    model = _ChunkModel(
        {"c1": {"en": 0.9}, "c2": {"en": 0.9}}, {"c1": "hello", "c2": "  "}
    )
    result, _ = _run_auto(model, ["", "c1", "c2"])
    assert result == "hello"
    assert model.detect_calls == ["c1", "c2"]


def test_forced_language_skips_detection_and_chunking():
    class _ForcedModel(_FakeModel):
        def detect_language(self, *args, **kwargs):
            raise AssertionError("detect_language must not run when language is forced")

    for lang in ("en", "vi"):
        model = _ForcedModel()
        with patch("app.stt._load_model", return_value=model), patch(
            "app.stt.get_speech_timestamps",
            side_effect=AssertionError("no chunking when forced"),
        ), patch("app.stt.decode_audio", side_effect=AssertionError("no decode when forced")):
            assert stt.transcribe(b"fake-wav-bytes", lang) == "xin chao"
        assert model.kwargs["vad_filter"] is True


def test_forced_language_is_passed_through():
    seen = {}

    class _LangModel(_FakeModel):
        def transcribe(self, path, language=None, **kwargs):
            seen["language"] = language
            return super().transcribe(path, language, **kwargs)

    with patch("app.stt._load_model", return_value=_LangModel()):
        stt.transcribe(b"fake-wav-bytes", "vi")
    assert seen["language"] == "vi"
