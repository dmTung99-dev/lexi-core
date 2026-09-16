"use client";

import { useEffect, useState } from "react";
import { synthesizeSpeech, toAudioDataUrl } from "@/lib/synthesizeSpeechClient";

interface SelectionSpeakButtonProps {
  text: string;
  rect: DOMRect;
}

// Matches .pron-btn's fixed size and .selection-speak-btn's CSS
// translate(6px, 6px) offset (bloom.css) — kept in sync here so the button
// can be clamped to stay fully inside the viewport instead of rendering
// off-screen for a selection that ends near an edge.
const BUTTON_SIZE = 26;
const BUTTON_OFFSET = 6;
const VIEWPORT_MARGIN = 8;

export function SelectionSpeakButton({ text, rect }: SelectionSpeakButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const maxLeft = window.innerWidth - BUTTON_SIZE - BUTTON_OFFSET - VIEWPORT_MARGIN;
  const maxTop = window.innerHeight - BUTTON_SIZE - BUTTON_OFFSET - VIEWPORT_MARGIN;
  const left = Math.max(0, Math.min(rect.right, maxLeft));
  const top = Math.max(0, Math.min(rect.bottom, maxTop));

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
      style={{ top, left }}
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
