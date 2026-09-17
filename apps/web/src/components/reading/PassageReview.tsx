"use client";

import { useRef, useState } from "react";
import { highlightVocabWords, type BilingualSentence } from "@/lib/readingPassage";
import { useTextSelectionSpeak } from "./useTextSelectionSpeak";
import { SelectionSpeakButton } from "./SelectionSpeakButton";

interface PassageReviewProps {
  sentences: BilingualSentence[];
}

// Mirrors functions/src/synthesizeSpeech.ts's 500-character server-side limit
// — a too-long selection still shows the button (so it doesn't just vanish
// with no explanation), but disabled with a tooltip, instead of letting the
// user click it into a guaranteed, unexplained ⚠️.
const MAX_SELECTION_SPEAK_LENGTH = 500;

// The "cỡ chữ" (font size) setting applies CSS `zoom` to the whole app
// (`.app-frame.fs-small`/`.app-frame.fs-large`, bloom.css) — non-standard
// `zoom`, unlike `transform`, re-scales the effective CSS pixel unit for
// its entire subtree, including `position: fixed` descendants. Any raw
// `top`/`left` px value set on an element inside a zoomed ancestor gets
// re-multiplied by that ambient zoom when the browser actually paints it,
// so a naive true-viewport-pixel position (from mouse coordinates / Range
// geometry, both always reported in true, unzoomed pixels) lands
// increasingly far from the real cursor the larger that raw value is —
// exactly the "the more I select, the further off it drifts" symptom
// reported live. `getBoundingClientRect().width / offsetWidth` gives the
// cumulative ambient zoom factor directly, independent of how many nested
// zoomed ancestors produced it, so SelectionSpeakButton can divide its
// computed position by it to cancel the browser's own re-multiplication.
export function ambientZoomFactor(el: HTMLElement): number {
  const trueWidth = el.getBoundingClientRect().width;
  const layoutWidth = el.offsetWidth;
  return trueWidth > 0 && layoutWidth > 0 ? trueWidth / layoutWidth : 1;
}

export function PassageReview({ sentences }: PassageReviewProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const passageRef = useRef<HTMLParagraphElement>(null);
  const selection = useTextSelectionSpeak(passageRef);

  if (sentences.length === 0) return null;

  return (
    <div className="reading-review">
      <p className="reading-passage reading-review-passage" ref={passageRef}>
        {sentences.map((sentence, sIdx) => (
          <span
            key={sIdx}
            data-testid={`en-sentence-${sIdx}`}
            className={sIdx === hoveredIndex ? "reading-sentence-hover" : undefined}
            onMouseEnter={() => setHoveredIndex(sIdx)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {highlightVocabWords(sentence.target, sentence.vocabWords).map((seg, segIdx) =>
              seg.highlighted ? (
                <mark className="reading-vocab-highlight" key={segIdx}>
                  {seg.text}
                </mark>
              ) : (
                <span key={segIdx}>{seg.text}</span>
              )
            )}{" "}
          </span>
        ))}
      </p>
      <p className="reading-review-translation">
        {sentences.map((sentence, sIdx) => (
          <span
            key={sIdx}
            data-testid={`vi-sentence-${sIdx}`}
            className={sIdx === hoveredIndex ? "reading-sentence-hover" : undefined}
            onMouseEnter={() => setHoveredIndex(sIdx)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {sentence.vietnamese}{" "}
          </span>
        ))}
      </p>
      {selection && (
        <SelectionSpeakButton
          text={selection.text}
          rect={selection.rect}
          tooLong={selection.text.length > MAX_SELECTION_SPEAK_LENGTH}
          zoomFactor={passageRef.current ? ambientZoomFactor(passageRef.current) : 1}
        />
      )}
    </div>
  );
}
