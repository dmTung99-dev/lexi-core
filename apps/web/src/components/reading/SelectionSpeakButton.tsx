"use client";

import { useEffect, useState } from "react";
import { synthesizeSpeech, toAudioDataUrl } from "@/lib/synthesizeSpeechClient";

interface SelectionSpeakButtonProps {
  text: string;
  rect: DOMRect;
}

export function SelectionSpeakButton({ text, rect }: SelectionSpeakButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // A new selection (different text) starts from a clean idle state rather
  // than carrying over a previous selection's error/loading flag.
  useEffect(() => {
    setError(false);
    setLoading(false);
  }, [text]);

  async function handlePlay() {
    setError(false);
    setLoading(true);
    try {
      const { audioBase64 } = await synthesizeSpeech({ text, language: "en" });
      await new Audio(toAudioDataUrl(audioBase64)).play();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className="pron-btn selection-speak-btn"
      style={{ top: rect.bottom, left: rect.right }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => void handlePlay()}
      disabled={loading}
      aria-label={`Nghe phát âm: ${text}`}
      title="Nghe phát âm"
    >
      {loading ? "…" : error ? "⚠️" : "🔊"}
    </button>
  );
}
