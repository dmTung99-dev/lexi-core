"use client";

import { useEffect, useRef, useState } from "react";
import type { VocabRecord } from "@/lib/vocabRecords";
import { splitMeaningSenses } from "@/lib/lookup";
import { getPronunciationUrl, ttsLanguageCode } from "@/lib/pronunciation";
import {
  RECALL_CORRECT_MS,
  RECALL_HINTS,
  RECALL_WRONG_MS,
  answersMatch,
  fillSlots,
  hintAvailable,
  hintReveal,
  initialReveal,
  maskHeadword,
  type RecallOutcome,
} from "@/lib/recallHint";

interface RecallTypingCardProps {
  record: VocabRecord;
  onDone(outcome: RecallOutcome): void;
}

export function RecallTypingCard({ record, onDone }: RecallTypingCardProps) {
  const [typed, setTyped] = useState("");
  const [revealed, setRevealed] = useState(() => initialReveal(record.headword, record.cefrLevel));
  const [hintsLeft, setHintsLeft] = useState(RECALL_HINTS);
  const [usedHint, setUsedHint] = useState(false);
  const [result, setResult] = useState<RecallOutcome | null>(null);
  const [audioFailed, setAudioFailed] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playWhenReady = useRef(false);
  const timer = useRef<number | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const ttsLang = ttsLanguageCode(record.targetLanguage);

  useEffect(() => {
    if (!ttsLang) return;
    let alive = true;
    getPronunciationUrl({ text: record.headword, language: ttsLang, tier: "word" })
      .then((url) => {
        if (!alive) return;
        const audio = new Audio(url);
        audio.preload = "auto";
        audioRef.current = audio;
        if (playWhenReady.current) {
          playWhenReady.current = false;
          play(audio);
        }
      })
      .catch(() => {
        if (alive) setAudioFailed(true);
      });
    return () => {
      alive = false;
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
    // Preload once per card (the parent keys this component by word id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function play(audio: HTMLAudioElement) {
    try {
      audio.currentTime = 0;
      void Promise.resolve(audio.play()).catch(() => {});
    } catch {
      // best-effort audio
    }
  }

  function finish(outcome: RecallOutcome) {
    if (result !== null) return;
    setResult(outcome);
    if (audioRef.current) play(audioRef.current);
    else if (ttsLang && !audioFailed) playWhenReady.current = true;
    const ms = outcome === "clean" || outcome === "hinted" ? RECALL_CORRECT_MS : RECALL_WRONG_MS;
    timer.current = window.setTimeout(() => onDoneRef.current(outcome), ms);
  }

  function submit() {
    if (result !== null || typed.trim() === "") return;
    if (answersMatch(typed, record.headword)) finish(usedHint ? "hinted" : "clean");
    else finish("wrong");
  }

  const lettersAvailable = hintsLeft > 0 && hintAvailable(record.headword, revealed, typed);
  const listenMode = !lettersAvailable;

  function handleHint() {
    if (result !== null) return;
    setUsedHint(true);
    if (lettersAvailable) {
      setRevealed(hintReveal(record.headword, revealed, typed));
      setHintsLeft((n) => n - 1);
    } else if (audioRef.current) {
      play(audioRef.current);
    }
  }

  const { slots, overflow } = fillSlots(record.headword, revealed, typed);
  const mask = (t: string) => maskHeadword(t, record.headword);
  const correct = result === "clean" || result === "hinted";
  const showAnswer = result === "wrong" || result === "skipped";
  const inputWrapClass = `recall-input-wrap${correct ? " recall-ok" : ""}${showAnswer ? " recall-bad" : ""}`;

  return (
    <div className="recall-card">
      <span className="recall-level">{record.cefrLevel.toUpperCase()}</span>
      <div className="recall-meaning">
        {splitMeaningSenses(mask(record.meaning)).map((sense, i) => (
          <p key={i}>{sense}</p>
        ))}
      </div>
      {record.definition && <p className="recall-definition">{mask(record.definition)}</p>}

      <div className="recall-pattern" role="group" aria-label="Gợi ý độ dài">
        {slots.map((s, i) =>
          s.kind === "sep" ? (
            <span key={i} className="recall-sep">
              {s.ch === " " ? " " : s.ch}
            </span>
          ) : (
            <span key={i} className={`recall-slot recall-slot-${s.source}`}>
              {s.source === "empty" ? "_" : s.ch}
            </span>
          )
        )}
        {overflow && <span className="recall-overflow">{overflow}</span>}
      </div>

      {showAnswer && (
        <div className="recall-answer">
          <span className="recall-answer-label">Đáp án</span>
          <span className="recall-answer-word">{record.headword}</span>
          {record.ipa && <span className="recall-answer-ipa">{record.ipa}</span>}
        </div>
      )}

      <div className={inputWrapClass}>
        <input
          className="recall-input"
          aria-label="Gõ từ tiếng Anh"
          value={typed}
          readOnly={result !== null}
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
      </div>

      {correct && (
        <div className="recall-feedback recall-feedback-ok">
          <span>✓ Chính xác</span>
          <span className="recall-answer-word">{record.headword}</span>
          {record.ipa && <span className="recall-answer-ipa">{record.ipa}</span>}
        </div>
      )}
      {result === "wrong" && <div className="recall-feedback recall-feedback-bad">✗ Chưa đúng</div>}

      <div className="recall-actions">
        <button
          type="button"
          className="recall-btn"
          onClick={handleHint}
          disabled={result !== null || (listenMode && (audioFailed || !ttsLang))}
        >
          {listenMode ? "Nghe phát âm" : `Gợi ý (${hintsLeft})`}
        </button>
        <button
          type="button"
          className="recall-btn recall-btn-skip"
          onClick={() => finish("skipped")}
          disabled={result !== null || !listenMode}
        >
          Bỏ qua
        </button>
      </div>
    </div>
  );
}
