"use client";

import { useRef, useState } from "react";
import { highlightVocabWords, type BilingualSentence } from "@/lib/readingPassage";
import { ambientZoomFactor, MAX_SELECTION_SPEAK_LENGTH } from "@/lib/selectionSpeak";
import { useTextSelectionSpeak } from "./useTextSelectionSpeak";
import { SelectionSpeakButton } from "./SelectionSpeakButton";

interface PassageReviewProps {
  sentences: BilingualSentence[];
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
