"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { recordDailyActivity } from "@/lib/dailyActivity";
import { SignInButton } from "@/components/SignInButton";
import { getVocabRecords, updateVocabRecordSm2, type VocabRecord } from "@/lib/vocabRecords";
import { getTopics, type Topic } from "@/lib/topics";
import { TopicFilterPopover } from "@/components/vocab-bank/TopicFilterPopover";
import { SimpleDropdown, type SimpleDropdownOption } from "@/components/shared/SimpleDropdown";
import { selectSessionWords, type SessionWordFilters } from "@/lib/practiceSession";
import { FlashcardCard } from "@/components/practice/FlashcardCard";
import { MultipleChoiceCard } from "@/components/practice/MultipleChoiceCard";
import { FillInBlankCard } from "@/components/practice/FillInBlankCard";
import { TranslationCard } from "@/components/practice/TranslationCard";
import { generateExercise, type PracticeExercise } from "@/lib/practiceExercise";
import { drawSessionAiRatio, shouldUseFlashcard } from "@/lib/pickExercise";
import { PronunciationButton } from "@/components/shared/PronunciationButton";
import { ttsLanguageCode } from "@/lib/pronunciation";
import { RecallTypingCard } from "@/components/practice/RecallTypingCard";
import type { RecallOutcome } from "@/lib/recallHint";
import { computeSm2, type Sm2Fields } from "@/lib/sm2";

type CefrLevel = VocabRecord["cefrLevel"];
const CEFR_LEVELS: CefrLevel[] = ["a1", "a2", "b1", "b2", "c1", "c2"];
const WORD_COUNT_OPTIONS = [5, 10, 20, null] as const;
const DEFAULT_WORD_COUNT = 10;

const CEFR_DROPDOWN_OPTIONS: SimpleDropdownOption<string>[] = [
  { value: "", label: "Tất cả" },
  ...CEFR_LEVELS.map((level) => ({ value: level as string, label: `Tối đa ${level.toUpperCase()}` })),
];

const WORD_COUNT_DROPDOWN_OPTIONS: SimpleDropdownOption<string>[] = WORD_COUNT_OPTIONS.map((count) => ({
  value: count === null ? "all" : String(count),
  label: count === null ? "Tất cả" : `${count} từ`,
}));

type Phase = "setup" | "session" | "result";

export interface SessionGradeResult {
  vocabRecordId: string;
  quality: 1 | 5;
  outcome?: RecallOutcome;
}

type PracticeMode = "flashcard" | "mixed" | "recall";

// Recall (Gõ từ) needs a typeable headword, so sentence records are out of its pool.
function poolFor(records: VocabRecord[], mode: PracticeMode): VocabRecord[] {
  return mode === "recall" ? records.filter((r) => r.inputType !== "sentence") : records;
}

function PracticePageContent() {
  const { user, loading: authLoading } = useAuthUser();
  const { settings } = useSettingsContext();
  const activeConfig = settings ? settings.providers[settings.activeProvider] : null;
  const aiAvailable = Boolean(activeConfig?.apiKeyCiphertext);
  const searchParams = useSearchParams();
  const action = searchParams.get("action");
  const autoStartTriggeredRef = useRef(false);
  const [records, setRecords] = useState<VocabRecord[] | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set());
  const [maxCefr, setMaxCefr] = useState<CefrLevel | null>(null);
  const [wordCount, setWordCount] = useState<number | null>(DEFAULT_WORD_COUNT);

  const [phase, setPhase] = useState<Phase>("setup");
  const [sessionWords, setSessionWords] = useState<VocabRecord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionResults, setSessionResults] = useState<SessionGradeResult[]>([]);
  const sm2WrittenRef = useRef(false);

  // A parallel array to `sessionWords`: the resolved exercise for each word, or
  // `null` while its AI generation is still in flight. `exercisesRef` mirrors it
  // so `generateAt` can check "already generated?" without closing over a stale
  // `exercises` value. `sessionTokenRef` is bumped on every session start — a
  // slow `generateExercise` from an abandoned session compares its captured
  // token against the current one and discards its result.
  const [exercises, setExercises] = useState<(PracticeExercise | null)[]>([]);
  const exercisesRef = useRef<(PracticeExercise | null)[]>([]);
  const sessionTokenRef = useRef(0);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("flashcard");
  const aiRatioRef = useRef(0);

  useEffect(() => {
    exercisesRef.current = exercises;
  }, [exercises]);

  const generateAt = useCallback(
    async (index: number, words: VocabRecord[], token: number) => {
      if (index < 0 || index >= words.length) return;
      if (exercisesRef.current[index]) return;
      const word = words[index];
      let ex: PracticeExercise;
      if (shouldUseFlashcard(word, aiAvailable, aiRatioRef.current)) {
        ex = { type: "flashcard", record: word };
      } else if (activeConfig?.apiKeyCiphertext) {
        ex = await generateExercise(word, {
          provider: settings!.activeProvider,
          model: activeConfig.model,
          apiKeyCiphertext: activeConfig.apiKeyCiphertext,
        });
      } else {
        ex = { type: "flashcard", record: word };
      }
      if (token !== sessionTokenRef.current) return;
      setExercises((prev) => {
        if (prev[index]) return prev;
        const next = [...prev];
        next[index] = ex;
        return next;
      });
    },
    [aiAvailable, activeConfig, settings]
  );

  useEffect(() => {
    if (!user || !settings) return;
    setLoadError(null);
    Promise.all([getVocabRecords(user.uid, settings.targetLanguage), getTopics(user.uid)])
      .then(([r, t]) => {
        setRecords(r);
        setTopics(t);
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, [user, settings]);

  useEffect(() => {
    if (action !== "start" || !records || autoStartTriggeredRef.current) return;
    autoStartTriggeredRef.current = true;
    // Every currently-due word, not the picker's own default 10-word cap —
    // the dashboard's "Ôn N từ ngay" button promises exactly N words.
    const words = selectSessionWords(records, { topicIds: new Set(), maxCefr: null, count: null });
    if (words.length === 0) return;
    setSessionWords(words);
    setCurrentIndex(0);
    setSessionResults([]);
    sm2WrittenRef.current = false;
    setPhase("session");
    aiRatioRef.current = practiceMode === "flashcard" ? 0 : drawSessionAiRatio();
    const token = ++sessionTokenRef.current;
    setExercises(new Array(words.length).fill(null));
    exercisesRef.current = new Array(words.length).fill(null);
    void generateAt(0, words, token);
    void generateAt(1, words, token);
  }, [action, records, generateAt, practiceMode]);

  useEffect(() => {
    if (phase !== "result" || sm2WrittenRef.current || !user) return;
    sm2WrittenRef.current = true;
    recordDailyActivity(user.uid, sessionResults.length).catch((err: unknown) => {
      console.error("Failed to record daily activity", err);
    });
    const now = new Date();
    const updatedFieldsById = new Map<string, Sm2Fields>();
    for (const result of sessionResults) {
      const record = sessionWords.find((w) => w.id === result.vocabRecordId);
      if (!record) continue;
      const fields = computeSm2(record, result.quality, now);
      updatedFieldsById.set(result.vocabRecordId, fields);
      updateVocabRecordSm2(user.uid, result.vocabRecordId, fields, record.targetLanguage).catch((err: unknown) => {
        console.error("Failed to save SM-2 result", err);
      });
    }
    // Merge the just-written SM-2 fields into local state so a second
    // "Ôn tập lại" session (still within this page load) selects from
    // up-to-date nextReviewAt/repetitions instead of the pre-session
    // snapshot — otherwise a just-reviewed word would still look due and
    // computeSm2 would run from its stale base on a repeat grade.
    setRecords((prev) =>
      prev
        ? prev.map((r) => {
            const updated = updatedFieldsById.get(r.id);
            return updated ? { ...r, ...updated } : r;
          })
        : prev
    );
  }, [phase, sessionResults, sessionWords, user]);

  // `mode` defaults to the current toggle state (the normal "Bắt đầu" path);
  // "Ôn tập lại ngay" (result phase) passes "flashcard" explicitly so this
  // session honors the reset immediately — `setPracticeMode` is async, so the
  // `practiceMode` closure here would otherwise still read the stale value in
  // the same tick a sibling `setPracticeMode("flashcard")` call is made.
  function handleStart(mode: PracticeMode = practiceMode) {
    if (!records) return;
    const filters: SessionWordFilters = { topicIds: selectedTopicIds, maxCefr, count: wordCount };
    const words = selectSessionWords(poolFor(records, mode), filters);
    if (words.length === 0) return;
    setSessionWords(words);
    setCurrentIndex(0);
    setSessionResults([]);
    sm2WrittenRef.current = false;
    setPhase("session");
    aiRatioRef.current = mode !== "mixed" ? 0 : drawSessionAiRatio();
    const token = ++sessionTokenRef.current;
    setExercises(new Array(words.length).fill(null));
    exercisesRef.current = new Array(words.length).fill(null);
    if (mode === "recall") return; // recall sessions need no AI exercises
    void generateAt(0, words, token);
    void generateAt(1, words, token);
  }

  function handleGrade(quality: 1 | 5, outcome?: RecallOutcome) {
    const current = sessionWords[currentIndex];
    const nextResults = [...sessionResults, { vocabRecordId: current.id, quality, outcome }];
    setSessionResults(nextResults);

    if (currentIndex + 1 < sessionWords.length) {
      setCurrentIndex(currentIndex + 1);
      const token = sessionTokenRef.current;
      // `currentIndex + 1` was already seeded (at session start for index 1,
      // or by the previous grade). Only the new lookahead slot needs seeding —
      // firing `+1` again could start a duplicate in-flight generateExercise
      // while its first call is still pending (the exercisesRef guard is null).
      if (practiceMode !== "recall") void generateAt(currentIndex + 2, sessionWords, token);
    } else {
      setPhase("result");
      // The batch SM-2 update runs in the useEffect above once phase becomes "result".
    }
  }

  function handleRecallDone(outcome: RecallOutcome) {
    handleGrade(outcome === "clean" ? 5 : 1, outcome);
  }

  if (authLoading) return <p>Đang tải…</p>;

  if (!user) {
    return (
      <div>
        <h2 className="scr-title">Ôn tập</h2>
        <p className="scr-sub">Đăng nhập để ôn tập.</p>
        <SignInButton />
      </div>
    );
  }

  if (loadError) return <p role="alert">Lỗi: {loadError}</p>;
  if (records === null) return <p>Đang tải từ vựng…</p>;

  if (phase === "setup") {
    const previewWords = selectSessionWords(
      poolFor(records, practiceMode),
      { topicIds: selectedTopicIds, maxCefr, count: wordCount },
      new Date()
    );

    return (
      <div>
        <h2 className="scr-title">Ôn tập</h2>
        <p className="scr-sub">Chọn bộ lọc rồi bắt đầu phiên ôn tập.</p>
        <div className="practice-filters">
          <TopicFilterPopover
            topics={topics}
            selectedTopicIds={selectedTopicIds}
            onApply={setSelectedTopicIds}
          />
          <SimpleDropdown
            triggerLabel={maxCefr ? `Tối đa ${maxCefr.toUpperCase()}` : "Tất cả"}
            ariaLabel="Chọn trình độ tối đa"
            options={CEFR_DROPDOWN_OPTIONS}
            value={maxCefr ?? ""}
            onChange={(v) => setMaxCefr((v || null) as CefrLevel | null)}
            active={maxCefr !== null}
          />
          <SimpleDropdown
            triggerLabel={wordCount === null ? "Tất cả" : `${wordCount} từ`}
            ariaLabel="Chọn số từ"
            options={WORD_COUNT_DROPDOWN_OPTIONS}
            value={wordCount === null ? "all" : String(wordCount)}
            onChange={(v) => setWordCount(v === "all" ? null : Number(v))}
            active={wordCount !== DEFAULT_WORD_COUNT}
          />
        </div>
        <div className="chip-row" role="group" aria-label="Kiểu bài">
          <button
            type="button"
            className={`vb-chip${practiceMode === "flashcard" ? " active" : ""}`}
            aria-pressed={practiceMode === "flashcard"}
            onClick={() => setPracticeMode("flashcard")}
          >
            Flashcard
          </button>
          <button
            type="button"
            className={`vb-chip${practiceMode === "mixed" ? " active" : ""}`}
            aria-pressed={practiceMode === "mixed"}
            onClick={() => setPracticeMode("mixed")}
          >
            Trộn AI
          </button>
          <button
            type="button"
            className={`vb-chip${practiceMode === "recall" ? " active" : ""}`}
            aria-pressed={practiceMode === "recall"}
            onClick={() => setPracticeMode("recall")}
          >
            Gõ từ
          </button>
        </div>
        {practiceMode === "recall" && (
          <p className="practice-mode-note">
            Xem nghĩa và định nghĩa, gõ lại đầy đủ từ tiếng Anh. Chỉ ôn từ và cụm từ (bỏ qua mục dạng câu).
          </p>
        )}
        <p className="practice-preview-count">{previewWords.length} từ khớp bộ lọc hiện tại.</p>
        <button className="btn-primary" onClick={() => handleStart()} disabled={previewWords.length === 0}>
          Bắt đầu
        </button>
      </div>
    );
  }

  if (phase === "session") {
    const progressPct = Math.round(((currentIndex + 1) / sessionWords.length) * 100);
    const ex = exercises[currentIndex] ?? null;
    const word = sessionWords[currentIndex];
    return (
      <div>
        <div className="practice-progress-row">
          <span>
            Từ {currentIndex + 1} / {sessionWords.length}
          </span>
          <span>Ôn tập</span>
        </div>
        <div className="practice-progress-track">
          <div className="practice-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        {practiceMode === "recall" ? (
          <RecallTypingCard key={word.id} record={word} onDone={handleRecallDone} />
        ) : ex === null ? (
          <p className="pe-loading" role="status">Đang tạo bài tập…</p>
        ) : ex.type === "flashcard" ? (
          <FlashcardCard key={word.id} record={word} onGrade={handleGrade} />
        ) : ex.type === "multiple_choice" ? (
          <MultipleChoiceCard key={word.id} exercise={ex} onGrade={handleGrade} />
        ) : ex.type === "fill_in_blank" ? (
          <FillInBlankCard key={word.id} exercise={ex} onGrade={handleGrade} />
        ) : (
          <TranslationCard key={word.id} exercise={ex} onGrade={handleGrade} />
        )}
      </div>
    );
  }

  const isRecall = sessionResults.some((r) => r.outcome !== undefined);
  const recallGroups: {
    title: string;
    note: string;
    className: string;
    items: SessionGradeResult[];
  }[] = [
    {
      title: "Tự nhớ được",
      note: "Giãn lịch ôn như bình thường",
      className: "practice-result-item-ok",
      items: sessionResults.filter((r) => r.outcome === "clean"),
    },
    {
      title: "Đúng nhờ gợi ý",
      note: "Sẽ quay lại ôn sớm",
      className: "practice-result-item-hint",
      items: sessionResults.filter((r) => r.outcome === "hinted"),
    },
    {
      title: "Sai / bỏ qua",
      note: "Sẽ quay lại ôn sớm",
      className: "practice-result-item-no",
      items: sessionResults.filter((r) => r.outcome === "wrong" || r.outcome === "skipped"),
    },
  ];
  const renderResultRow = (result: SessionGradeResult, className: string, mark: string) => {
    const record = sessionWords.find((w) => w.id === result.vocabRecordId);
    if (!record) return null;
    return (
      <li key={result.vocabRecordId} className={className}>
        <span>{mark}</span>
        <span className="practice-result-headword">{record.headword}</span>
        <span className="practice-result-meaning">{record.meaning}</span>
        <PronunciationButton
          text={record.headword}
          language={ttsLanguageCode(record.targetLanguage)}
          tier="word"
        />
      </li>
    );
  };
  const correctCount = sessionResults.filter((r) => r.quality === 5).length;
  const totalCount = sessionResults.length;
  const percent = totalCount === 0 ? 0 : Math.round((correctCount / totalCount) * 100);

  return (
    <div>
      {isRecall ? (
        <div className="practice-result-header">
          <div
            className="practice-result-circle practice-result-circle-recall"
            style={{ ["--pct" as unknown as string]: `${percent}%` }}
          >
            <span>{percent}%</span>
          </div>
          <div>
            <h2 className="scr-title">Kết quả ôn tập</h2>
            <p className="practice-result-sub">
              Tự nhớ được {correctCount} / {totalCount} từ · {recallGroups[1].items.length} từ nhờ gợi ý ·{" "}
              {recallGroups[2].items.length} từ sai hoặc bỏ qua
            </p>
          </div>
        </div>
      ) : (
        <>
          <h2 className="scr-title">Kết quả ôn tập</h2>
          <div className="practice-result-circle" style={{ ["--pct" as unknown as string]: `${percent}%` }}>
            <span>{percent}%</span>
          </div>
          <p className="practice-result-sub">
            Đúng {correctCount} / {totalCount} từ
          </p>
        </>
      )}
      {isRecall ? (
        <div className="practice-result-columns">
          {recallGroups
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <section key={g.title} className={`practice-result-col ${g.className}`}>
                <header className="practice-result-col-head">
                  <h3 className="practice-result-group-title">{g.title}</h3>
                  <span className="practice-result-col-count">{g.items.length}</span>
                </header>
                <p className="practice-result-col-note">{g.note}</p>
                <ul className="practice-result-col-list">
                  {g.items.map((result) => {
                    const record = sessionWords.find((w) => w.id === result.vocabRecordId);
                    if (!record) return null;
                    return (
                      <li key={result.vocabRecordId}>
                        <div className="practice-result-col-text">
                          <span className="practice-result-headword">{record.headword}</span>
                          <span className="practice-result-meaning">{record.meaning}</span>
                        </div>
                        <PronunciationButton
                          text={record.headword}
                          language={ttsLanguageCode(record.targetLanguage)}
                          tier="word"
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
        </div>
      ) : (
        <ul className="practice-result-list">
          {sessionResults.map((result) =>
            renderResultRow(
              result,
              result.quality === 5 ? "practice-result-item-ok" : "practice-result-item-no",
              result.quality === 5 ? "✔" : "✘"
            )
          )}
        </ul>
      )}
      <div className={`practice-result-actions${isRecall ? " practice-result-actions-recall" : ""}`}>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setPracticeMode("flashcard");
            setPhase("setup");
          }}
        >
          Về Ôn tập
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            const next: PracticeMode = isRecall ? "recall" : "flashcard";
            setPracticeMode(next);
            handleStart(next);
          }}
        >
          {isRecall ? "Ôn tập lại ngay (Gõ từ)" : "Ôn tập lại ngay"}
        </button>
      </div>
    </div>
  );
}

export default function PracticePage() {
  return (
    <Suspense fallback={<p>Đang tải…</p>}>
      <PracticePageContent />
    </Suspense>
  );
}
