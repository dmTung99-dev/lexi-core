"use client";

import { useState } from "react";
import type { VocabRecord } from "@/lib/vocabRecords";
import type { TtsLanguage } from "@/lib/pronunciation";
import { PronunciationButton } from "./PronunciationButton";
import { SpeakableTextBlock } from "@/components/reading/SpeakableTextBlock";

interface HighlightedTextProps {
  text: string;
  variant: "interactive" | "static";
  records?: VocabRecord[];
  ttsLanguage?: TtsLanguage | null;
  highlights?: string[];
  // Wraps the rendered text for select-to-speak. Only pass this for English
  // source text (e.g. Word Radar's "Văn bản" block) — never for Vietnamese
  // text (e.g. "Bản dịch"), matching the reading feature's English-only scope.
  enableSpeak?: boolean;
}

interface Span {
  text: string;
  matchedWord: string | null;
}

// Ports word_radar_screen.dart's _HighlightedText matching algorithm exactly:
// at each step, scan every candidate word for its earliest occurrence in the
// remaining text, highlight whichever candidate's earliest occurrence comes
// first overall, then continue from the end of that match. No length-based
// tie-break, no overlapping highlights — matching Flutter's real behavior.
function splitIntoSpans(text: string, candidates: string[]): Span[] {
  const spans: Span[] = [];
  let remaining = text;
  const nonEmpty = candidates.filter((c) => c.length > 0);

  while (remaining.length > 0) {
    let earliestStart: number | null = null;
    let earliestWord: string | null = null;
    for (const word of nonEmpty) {
      const idx = remaining.toLowerCase().indexOf(word.toLowerCase());
      if (idx >= 0 && (earliestStart === null || idx < earliestStart)) {
        earliestStart = idx;
        earliestWord = word;
      }
    }
    if (earliestStart === null || earliestWord === null) {
      spans.push({ text: remaining, matchedWord: null });
      break;
    }
    if (earliestStart > 0) {
      spans.push({ text: remaining.slice(0, earliestStart), matchedWord: null });
    }
    const matchedText = remaining.slice(earliestStart, earliestStart + earliestWord.length);
    spans.push({ text: matchedText, matchedWord: earliestWord });
    remaining = remaining.slice(earliestStart + earliestWord.length);
  }
  return spans;
}

export function HighlightedText({
  text,
  variant,
  records,
  ttsLanguage,
  highlights,
  enableSpeak,
}: HighlightedTextProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const candidates = variant === "interactive" ? (records ?? []).map((r) => r.headword) : (highlights ?? []);

  if (candidates.length === 0 || text.length === 0) {
    const plain = <p>{text}</p>;
    return enableSpeak ? <SpeakableTextBlock>{plain}</SpeakableTextBlock> : plain;
  }

  const spans = splitIntoSpans(text, candidates);

  function findRecord(matchedWord: string): VocabRecord | undefined {
    return (records ?? []).find((r) => r.headword.toLowerCase() === matchedWord.toLowerCase());
  }

  const rendered = (
    <p>
      {spans.map((span, i) => {
        if (span.matchedWord === null) return <span key={i}>{span.text}</span>;

        if (variant === "static") {
          return (
            <mark key={i} className="known-highlight known-highlight-static">
              {span.text}
            </mark>
          );
        }

        const record = findRecord(span.matchedWord);
        const isOpen = openIndex === i;
        return (
          <span key={i} className="known-highlight-wrap">
            <button
              type="button"
              className="known-highlight known-highlight-interactive"
              onClick={() => setOpenIndex(isOpen ? null : i)}
            >
              {span.text}
            </button>
            {isOpen && record && (
              <span className="word-popover" role="tooltip">
                <span className="pop-head-row">
                  <span className="pop-headword">{record.headword}</span>
                  <PronunciationButton text={record.headword} language={ttsLanguage ?? null} tier="word" />
                </span>
                {record.ipa && <span className="pop-ipa">{record.ipa}</span>}
                <span className="pop-meaning">{record.meaning}</span>
                <span className="cefr-pill">{record.cefrLevel.toUpperCase()}</span>
              </span>
            )}
          </span>
        );
      })}
    </p>
  );

  return enableSpeak ? <SpeakableTextBlock>{rendered}</SpeakableTextBlock> : rendered;
}
