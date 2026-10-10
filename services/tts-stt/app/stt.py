import tempfile
from pathlib import Path

from faster_whisper import WhisperModel

MODEL_DIR = Path(__file__).resolve().parent.parent / "models" / "whisper"

_model: WhisperModel | None = None


def _load_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(
            "base",
            device="cpu",
            compute_type="int8",
            download_root=str(MODEL_DIR),
        )
    return _model


MAX_PROMPT_CHARS = 400


def transcribe(audio_bytes: bytes, language: str | None = None, prompt: str | None = None) -> str:
    # Whisper's initial_prompt biases decoding toward the conversation's
    # vocabulary. Keep only the most recent context if it is long.
    initial_prompt = (prompt or "").strip()[-MAX_PROMPT_CHARS:].strip() or None
    model = _load_model()
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    try:
        tmp.write(audio_bytes)
        tmp.close()
        segments, _info = model.transcribe(
            tmp.name,
            language=language,
            beam_size=5,
            initial_prompt=initial_prompt,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            condition_on_previous_text=False,
        )
        return " ".join(segment.text.strip() for segment in segments).strip()
    finally:
        Path(tmp.name).unlink(missing_ok=True)
