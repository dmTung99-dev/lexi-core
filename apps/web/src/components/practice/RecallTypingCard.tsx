"use client";

import { useEffect, useRef, useState } from "react";
import type { VocabRecord } from "@/lib/vocabRecords";
import { splitMeaningSenses } from "@/lib/lookup";
import { getPronunciationUrl, ttsLanguageCode } from "@/lib/pronunciation";
import {
  RECALL_HINTS,
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

  const inputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playWhenReady = useRef(false);
  const doneSent = useRef(false);
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
  }

  // The learner moves on with a second Enter (or the Tiếp tục button) once
  // they have read the result; there is no auto-advance timer.
  function next() {
    if (result === null || doneSent.current) return;
    doneSent.current = true;
    onDoneRef.current(result);
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
    inputRef.current?.focus();
  }

  const hintDisabled = listenMode && (audioFailed || !ttsLang);
  const canReplay = !!ttsLang && !audioFailed;

  // Tab = the hint button (letter hint, then listen); after grading it replays
  // the pronunciation. Shift+Tab still moves focus for keyboard navigation.
  function handleTab() {
    if (result === null) {
      if (!hintDisabled) handleHint();
    } else if (audioRef.current) {
      play(audioRef.current);
    }
  }

  function handleSkip() {
    finish("skipped");
    inputRef.current?.focus();
  }

  const { slots, overflow } = fillSlots(record.headword, revealed, typed);
  // Group letter slots per word part so lines wrap only at separators.
  const parts: Array<{ sep: boolean; items: typeof slots }> = [];
  for (const s of slots) {
    const sep = s.kind === "sep";
    const last = parts[parts.length - 1];
    if (!sep && last && !last.sep) last.items.push(s);
    else parts.push({ sep, items: [s] });
  }
  const mask = (t: string) => maskHeadword(t, record.headword);
  const correct = result === "clean" || result === "hinted";
  const showAnswer = result === "wrong" || result === "skipped";
  const inputWrapClass = `recall-input-wrap${correct ? " recall-ok" : ""}${showAnswer ? " recall-bad" : ""}`;
  const kindLabel = /\s/.test(record.headword.trim()) ? "cụm từ" : "từ";
  const actionNote = !listenMode
    ? `Bỏ qua mở sau khi dùng hết ${RECALL_HINTS} lần gợi ý`
    : `Hết gợi ý chữ — nghe lại bao nhiêu lần cũng được${usedHint ? " · từ này sẽ quay lại ôn sớm" : ""}`;

  return (
    <div className="recall-card">
      <div className="recall-meta">
        <span className="recall-level">{record.cefrLevel.toUpperCase()}</span>
        <span className="recall-kind">{kindLabel}</span>
      </div>
      <div className="recall-prompt">
        <div className="recall-meaning">
          {splitMeaningSenses(mask(record.meaning)).map((sense, i) => (
            <p key={i}>{sense}</p>
          ))}
        </div>
        {record.definition && <p className="recall-definition">{mask(record.definition)}</p>}
      </div>

      {correct ? (
        <div className="recall-reveal recall-reveal-ok">
          <span className="recall-answer-word">{record.headword}</span>
          {record.ipa && <span className="recall-answer-ipa">{record.ipa}</span>}
          <SpeakerIcon />
        </div>
      ) : showAnswer ? (
        <div className="recall-answer">
          <span className="recall-answer-label">Đáp án</span>
          <div className="recall-reveal">
            <span className="recall-answer-word">{record.headword}</span>
            {record.ipa && <span className="recall-answer-ipa">{record.ipa}</span>}
            <SpeakerIcon />
          </div>
        </div>
      ) : (
        <div className="recall-pattern" role="group" aria-label="Gợi ý độ dài">
          {parts.map((p, i) =>
            p.sep ? (
              <span key={i} className={p.items[0].ch === " " ? "recall-gap" : "recall-sep"}>
                {p.items[0].ch === " " ? "" : p.items[0].ch}
              </span>
            ) : (
              <span key={i} className="recall-word">
                {p.items.map((s, j) => (
                  <span key={j} className={`recall-slot recall-slot-${s.source}`}>
                    {s.source === "empty" ? "" : s.ch}
                  </span>
                ))}
              </span>
            )
          )}
          {overflow && <span className="recall-overflow">{overflow}</span>}
        </div>
      )}

      <label className="recall-field">
        <span className="recall-field-label">Gõ từ tiếng Anh rồi bấm Enter</span>
        <div className={inputWrapClass}>
          <input
            ref={inputRef}
            aria-label="Gõ từ tiếng Anh"
            className={`recall-input${result === "wrong" ? " recall-input-struck" : ""}`}
            value={typed}
            readOnly={result !== null}
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                // A held-down Enter must not grade and then skip past the result.
                if (e.repeat) return;
                if (result === null) submit();
                else next();
              } else if (e.key === "Tab" && !e.shiftKey) {
                // Always keep focus in the input (also mid-IME composition, e.g.
                // macOS Vietnamese Telex), but only act outside a composition.
                e.preventDefault();
                // Holding Tab must not burn every hint at once.
                if (!e.repeat && !e.nativeEvent.isComposing) handleTab();
              }
            }}
          />
          {correct && <span className="recall-badge recall-badge-ok">✓ Chính xác</span>}
          {result === "wrong" && <span className="recall-badge recall-badge-bad">✗ Chưa đúng</span>}
          {result === "skipped" && <span className="recall-badge recall-badge-bad">Đã bỏ qua</span>}
        </div>
      </label>

      {result !== null ? (
        <div className="recall-actions">
          <button
            type="button"
            className="recall-btn recall-btn-next"
            onMouseDown={(e) => e.preventDefault()}
            onClick={next}
          >
            Tiếp tục
            <kbd className="recall-kbd" aria-hidden="true">
              Enter
            </kbd>
          </button>
          <span className="recall-note">
            Bấm Enter để sang từ tiếp theo{canReplay ? " · Tab để nghe lại" : ""}
          </span>
        </div>
      ) : (
        <div className="recall-actions">
          <button
            type="button"
            className={`recall-btn${listenMode ? " recall-btn-listen" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleHint}
            disabled={hintDisabled}
          >
            {listenMode && <SpeakerIcon />}
            {listenMode ? "Nghe phát âm" : `Gợi ý (${hintsLeft})`}
            {!hintDisabled && (
              <kbd className="recall-kbd" aria-hidden="true">
                Tab
              </kbd>
            )}
          </button>
          <button
            type="button"
            className="recall-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSkip}
            disabled={!listenMode}
          >
            Bỏ qua
          </button>
          <span className="recall-note">{actionNote}</span>
        </div>
      )}
    </div>
  );
}

function SpeakerIcon() {
  return (
    <svg
      className="recall-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5L6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 010 7" />
    </svg>
  );
}
