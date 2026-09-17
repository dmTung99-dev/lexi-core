"use client";

import { useRef, type ReactNode } from "react";
import { ambientZoomFactor, MAX_SELECTION_SPEAK_LENGTH } from "@/lib/selectionSpeak";
import { useTextSelectionSpeak } from "./useTextSelectionSpeak";
import { SelectionSpeakButton } from "./SelectionSpeakButton";

interface SpeakableTextBlockProps {
  children: ReactNode;
  className?: string;
}

// Reusable select-to-speak wiring (container ref + useTextSelectionSpeak +
// SelectionSpeakButton + ambient-zoom correction) for English text blocks
// outside PassageReview — PassageReview.tsx keeps its own inline wiring
// rather than being refactored onto this, since its selection/hover
// interplay is already hard-won and tested.
export function SpeakableTextBlock({ children, className }: SpeakableTextBlockProps) {
  const ref = useRef<HTMLDivElement>(null);
  const selection = useTextSelectionSpeak(ref);

  return (
    <div className={className} ref={ref}>
      {children}
      {selection && (
        <SelectionSpeakButton
          text={selection.text}
          rect={selection.rect}
          tooLong={selection.text.length > MAX_SELECTION_SPEAK_LENGTH}
          zoomFactor={ref.current ? ambientZoomFactor(ref.current) : 1}
        />
      )}
    </div>
  );
}
