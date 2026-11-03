"use client";

import { useState, type ReactNode } from "react";
import type { PrepLine, PrepPattern } from "@/lib/conversationPrepTypes";
import { lineHighlights } from "@/lib/prepHighlight";
import { SpeakerIcon } from "./SpeakerIcon";

export interface PrepDialogueProps {
  lines: PrepLine[];
  patterns: PrepPattern[];
  onSpeak(text: string): void;
  onPatternClick(patternIndex: number): void;
}

function renderLine(text: string, patterns: PrepPattern[], onPatternClick: (i: number) => void): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const h of lineHighlights(text, patterns)) {
    if (h.start > cursor) parts.push(text.slice(cursor, h.start));
    parts.push(
      <button key={h.start} type="button" className="prep-mark" onClick={() => onPatternClick(h.patternIndex)}>
        {text.slice(h.start, h.end)}
      </button>
    );
    cursor = h.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

export function PrepDialogue({ lines, patterns, onSpeak, onPatternClick }: PrepDialogueProps) {
  const [shown, setShown] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <ol className="prep-dialogue">
      {lines.map((l, i) => {
        const showVi = shown.has(i);
        return (
          <li key={i} className={l.speaker === "you" ? "prep-line prep-line-you" : "prep-line prep-line-partner"}>
            <span className="prep-speaker">{l.speaker === "you" ? "Bạn" : l.partnerRole || "Đối phương"}</span>
            <div className="prep-bubble">
              <p className="prep-en">{renderLine(l.en, patterns, onPatternClick)}</p>
              {showVi && <p className="prep-vi">{l.vi}</p>}
              <div className="prep-line-actions">
                <button type="button" className="prep-icon-btn" aria-label="Nghe câu này" onClick={() => onSpeak(l.en)}>
                  <SpeakerIcon />
                </button>
                {l.vi && (
                  <button type="button" className="prep-text-btn" aria-expanded={showVi} onClick={() => toggle(i)}>
                    {showVi ? "Ẩn dịch" : "Dịch"}
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
