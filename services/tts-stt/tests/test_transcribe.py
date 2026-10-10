from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_transcribe_returns_text():
    fake_audio = b"RIFF....fake-wav-bytes"
    with patch("app.main.stt.transcribe", return_value="xin chao ban") as mock_transcribe:
        response = client.post(
            "/transcribe?language=vi",
            content=fake_audio,
            headers={"Content-Type": "audio/wav"},
        )

    assert response.status_code == 200
    assert response.json() == {"text": "xin chao ban", "language": "vi"}
    mock_transcribe.assert_called_once_with(fake_audio, "vi", None)


def test_transcribe_rejects_empty_body():
    response = client.post("/transcribe", content=b"", headers={"Content-Type": "audio/wav"})
    assert response.status_code == 400


def test_transcribe_rejects_unsupported_language():
    response = client.post(
        "/transcribe?language=fr",
        content=b"fake",
        headers={"Content-Type": "audio/wav"},
    )
    assert response.status_code == 400


def test_transcribe_rejects_audio_over_10mb():
    response = client.post(
        "/transcribe",
        content=b"a" * 10_000_001,
        headers={"Content-Type": "audio/wav"},
    )
    assert response.status_code == 400


def test_transcribe_language_is_optional():
    with patch("app.main.stt.transcribe", return_value="hello") as mock_transcribe:
        response = client.post(
            "/transcribe",
            content=b"fake-wav-bytes",
            headers={"Content-Type": "audio/wav"},
        )

    assert response.status_code == 200
    assert response.json() == {"text": "hello", "language": "auto"}
    mock_transcribe.assert_called_once_with(b"fake-wav-bytes", None, None)


def test_transcribe_forwards_prompt():
    with patch("app.main.stt.transcribe", return_value="hello") as mock_transcribe:
        response = client.post(
            "/transcribe?language=en&prompt=Topic%3A%20travel.",
            content=b"fake-wav-bytes",
            headers={"Content-Type": "audio/wav"},
        )

    assert response.status_code == 200
    mock_transcribe.assert_called_once_with(b"fake-wav-bytes", "en", "Topic: travel.")


def test_transcribe_accepts_prompt_of_exactly_600_chars():
    with patch("app.main.stt.transcribe", return_value="hello") as mock_transcribe:
        response = client.post(
            "/transcribe",
            params={"prompt": "a" * 600},
            content=b"fake-wav-bytes",
            headers={"Content-Type": "audio/wav"},
        )

    assert response.status_code == 200
    mock_transcribe.assert_called_once_with(b"fake-wav-bytes", None, "a" * 600)


def test_transcribe_rejects_prompt_over_600_chars():
    with patch("app.main.stt.transcribe", return_value="hello") as mock_transcribe:
        response = client.post(
            "/transcribe",
            params={"prompt": "a" * 601},
            content=b"fake-wav-bytes",
            headers={"Content-Type": "audio/wav"},
        )

    assert response.status_code == 400
    assert "600" in response.json()["detail"]
    mock_transcribe.assert_not_called()
