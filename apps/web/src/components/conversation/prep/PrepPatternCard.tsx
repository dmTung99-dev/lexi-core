"use client";

import { useState } from "react";
import type { PrepPattern } from "@/lib/conversationPrepTypes";
import { WhyList } from "@/components/conversation/WhyList";
import { SpeakerIcon } from "./SpeakerIcon";
import { Spinner } from "@/components/shared/Spinner";

export interface PrepPatternCardProps {
  pattern: PrepPattern;
  index: number;
  ringed: boolean;
  onSpeak(text: string, key: string): void;
  /** Key of the speaker button whose audio is still loading. */
  speakingKey?: string | null;
}

export function PrepPatternCard({ pattern, index, ringed, onSpeak, speakingKey = null }: PrepPatternCardProps) {
  const [open, setOpen] = useState(false);
  const loading = speakingKey === `pattern-${index}`;
  return (
    <article id={`prep-pattern-${index}`} className={ringed ? "prep-pattern prep-pattern-ringed" : "prep-pattern"}>
      <p className="prep-pattern-frame">{pattern.pattern}</p>
      <p className="prep-pattern-meaning">{pattern.meaning}</p>
      {pattern.example && (
        <div className="prep-example">
          <span>{pattern.example}</span>
          <button
            type="button"
            className="prep-icon-btn"
            aria-label="Nghe ví dụ"
            aria-busy={loading}
            onClick={() => onSpeak(pattern.example, `pattern-${index}`)}
          >
            {loading ? <Spinner /> : <SpeakerIcon />}
          </button>
        </div>
      )}
      {pattern.why.length > 0 && (
        <>
          <button type="button" className="prep-text-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? "Ẩn giải thích" : "Tại sao?"}
          </button>
          {open && <WhyList points={pattern.why} />}
        </>
      )}
    </article>
  );
}
