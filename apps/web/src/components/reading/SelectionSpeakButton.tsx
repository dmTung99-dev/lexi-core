"use client";

import { useEffect, useState } from "react";
import { synthesizeSpeech, toAudioDataUrl } from "@/lib/synthesizeSpeechClient";

interface SelectionSpeakButtonProps {
  text: string;
  rect: DOMRect;
  // True when `text` exceeds the server's TTS length limit. Still rendered
  // (disabled, with an explanation) rather than omitted outright — a
  // selection that simply grows past the limit used to make the button
  // disappear with no indication why.
  tooLong?: boolean;
}

// Matches .pron-btn's fixed size and .selection-speak-btn's CSS
// translate(3px, calc(-100% - 4px)) offset (bloom.css) — the button floats
// ABOVE its anchor point, not below: this passage's line-height (1.8) is
// generous enough that anchoring below the selection (this component's
// first version used rect.bottom) landed the button visually inside the
// *next* line's own text, especially for a single-line selection near the
// end of a line. Floating above avoids that regardless of line-height.
// BUTTON_OFFSET/ABOVE_LINE_GAP are kept deliberately small — the anchor
// point is already the real mouse-release position (see
// useTextSelectionSpeak.ts), so on top of that any natural imprecision in
// where the user actually let go, a larger added gap here just compounds
// into a bigger felt distance between the button and the selection.
// Kept in sync here so the button can be clamped to stay fully inside the
// viewport instead of rendering off-screen for a selection near an edge.
const BUTTON_SIZE = 26;
const BUTTON_OFFSET = 3;
const ABOVE_LINE_GAP = 4;
const VIEWPORT_MARGIN = 8;

export function SelectionSpeakButton({ text, rect, tooLong = false }: SelectionSpeakButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const maxLeft = window.innerWidth - BUTTON_SIZE - BUTTON_OFFSET - VIEWPORT_MARGIN;
  const minTop = BUTTON_SIZE + ABOVE_LINE_GAP + VIEWPORT_MARGIN;
  const left = Math.max(0, Math.min(rect.right, maxLeft));
  const top = Math.max(minTop, rect.top);

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

  const title = tooLong
    ? `Vùng chọn quá dài để đọc (tối đa 500 ký tự, đang chọn ${text.length}) — chọn đoạn ngắn hơn`
    : "Nghe phát âm";

  return (
    <button
      type="button"
      className="pron-btn selection-speak-btn"
      style={{ top, left }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={tooLong ? undefined : () => void handlePlay()}
      disabled={loading || tooLong}
      aria-label={tooLong ? title : `Nghe phát âm: ${text}`}
      title={title}
    >
      {tooLong ? "🔇" : loading ? "…" : error ? "⚠️" : "🔊"}
    </button>
  );
}
