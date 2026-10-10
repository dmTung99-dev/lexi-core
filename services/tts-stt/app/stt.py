import tempfile
from pathlib import Path

from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio
from faster_whisper.vad import VadOptions, collect_chunks, get_speech_timestamps

MODEL_DIR = Path(__file__).resolve().parent.parent / "models" / "whisper"

# Multilingual (not "small.en"): auto mode must be able to recognise Vietnamese.
MODEL_NAME = "small"

_model: WhisperModel | None = None


def _load_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(
            MODEL_NAME,
            device="cpu",
            compute_type="int8",
            download_root=str(MODEL_DIR),
        )
    return _model


MAX_PROMPT_CHARS = 400

SAMPLING_RATE = 16000
# Each chunk must fit one 30 s Whisper window.
MAX_CHUNK_SECONDS = 25
MIN_SILENCE_MS = 500
# Auto mode only ever picks English or Vietnamese, biased to English: a chunk
# is Vietnamese only when Whisper is fairly sure of it.
VI_MIN_PROBABILITY = 0.6


def _choose_language(all_language_probs) -> str:
    probs = dict(all_language_probs)
    p_en = probs.get("en", 0.0)
    p_vi = probs.get("vi", 0.0)
    if p_vi >= VI_MIN_PROBABILITY and p_vi > p_en:
        return "vi"
    return "en"


def _segments_text(segments) -> str:
    return " ".join(segment.text.strip() for segment in segments).strip()


def _transcribe_auto(model: WhisperModel, path: str, initial_prompt: str | None) -> str:
    audio = decode_audio(path, sampling_rate=SAMPLING_RATE)
    speech = get_speech_timestamps(
        audio,
        VadOptions(
            min_silence_duration_ms=MIN_SILENCE_MS,
            max_speech_duration_s=MAX_CHUNK_SECONDS,
        ),
        sampling_rate=SAMPLING_RATE,
    )
    if not speech:
        return ""
    chunks, _metadata = collect_chunks(
        audio, speech, sampling_rate=SAMPLING_RATE, max_duration=MAX_CHUNK_SECONDS
    )
    texts: list[str] = []
    for chunk in chunks:
        if len(chunk) == 0:
            continue
        _top_language, _top_probability, all_language_probs = model.detect_language(audio=chunk)
        segments, _info = model.transcribe(
            chunk,
            language=_choose_language(all_language_probs),
            beam_size=5,
            initial_prompt=initial_prompt,
            # Silence is already removed by the chunking above.
            vad_filter=False,
            condition_on_previous_text=False,
        )
        text = _segments_text(segments)
        if text:
            texts.append(text)
    return " ".join(texts)


def transcribe(audio_bytes: bytes, language: str | None = None, prompt: str | None = None) -> str:
    # Whisper's initial_prompt biases decoding toward the conversation's
    # vocabulary. Keep only the most recent context if it is long.
    initial_prompt = (prompt or "").strip()[-MAX_PROMPT_CHARS:].strip() or None
    model = _load_model()
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    try:
        tmp.write(audio_bytes)
        tmp.close()
        if language is None:
            return _transcribe_auto(model, tmp.name, initial_prompt)
        segments, _info = model.transcribe(
            tmp.name,
            language=language,
            beam_size=5,
            initial_prompt=initial_prompt,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": MIN_SILENCE_MS},
            condition_on_previous_text=False,
        )
        return _segments_text(segments)
    finally:
        Path(tmp.name).unlink(missing_ok=True)
