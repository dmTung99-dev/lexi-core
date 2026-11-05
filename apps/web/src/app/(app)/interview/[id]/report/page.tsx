"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { useRouteParams } from "@/lib/useRouteParams";
import { SignInButton } from "@/components/SignInButton";
import { callInterviewAi, hasAiKey } from "@/lib/interviewAi";
import { answeredMainIndexes, buildReportPrompt, parseReport } from "@/lib/interviewReportPrompt";
import { completeInterviewSession, getInterviewSession, listRecentInterviewSessions } from "@/lib/interviewSessions";
import { applyGradingMemory, loadGradingMemory, toReportMemoryInput } from "@/lib/learnerMemoryGrading";
import { parseMemoryUpdate } from "@/lib/learnerMemoryPrompt";
import { isPhraseSaved } from "@/lib/savePhraseToVocab";
import type { PhraseSource } from "@/lib/phraseEnrich";
import { useInterviewAudio } from "@/lib/useInterviewAudio";
import { interviewRecordingKey } from "@/lib/recordedAudioStore";
import {
  INTERVIEW_LEVELS,
  INTERVIEW_TYPES,
  combinedAnswer,
  type InterviewSession,
} from "@/lib/interviewTypes";
import { ScoreSummary } from "@/components/interview/ScoreSummary";
import { ImprovementList } from "@/components/interview/ImprovementList";
import { QuestionReview, sentenceContaining } from "@/components/interview/QuestionReview";
import { PhraseSaveBar, usePhraseVocabSaver } from "@/components/shared/PhraseVocabSaver";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export default function InterviewReportPage({ params }: { params: Promise<{ id: string }> }) {
  const resolved = useRouteParams(params);
  const id = resolved?.id ?? null;
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();
  const { settings } = useSettingsContext();
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [previous, setPrevious] = useState<InterviewSession | null>(null);
  const [missing, setMissing] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [regrading, setRegrading] = useState(false);
  const [regradeError, setRegradeError] = useState<string | null>(null);
  const saver = usePhraseVocabSaver({
    uid: user?.uid ?? null,
    settings,
    level: "B1",
    note: "Từ luyện Phỏng vấn tiếng Anh",
    activeContext: "business",
  });
  const { markSaved } = saver;
  // Every phrase across the questions, each with the model-answer sentence it came from.
  const phraseItems = useMemo<PhraseSource[]>(() => {
    const seen = new Set<string>();
    return (session?.report?.questions ?? []).flatMap((q) =>
      q.phrases.flatMap((p) => {
        if (seen.has(p.text)) return [];
        seen.add(p.text);
        return [{ text: p.text, meaning: p.meaning, example: sentenceContaining(q.modelAnswer, p.text) }];
      })
    );
  }, [session?.report]);

  // Phrases already in the vocab bank show as saved straight away.
  useEffect(() => {
    if (!user || phraseItems.length === 0) return;
    let cancelled = false;
    void Promise.all(phraseItems.map((p) => isPhraseSaved(user.uid, p.text).catch(() => false))).then((flags) => {
      if (!cancelled) markSaved(phraseItems.filter((_, i) => flags[i]).map((p) => p.text));
    });
    return () => {
      cancelled = true;
    };
  }, [user, phraseItems, markSaved]);
  const audio = useInterviewAudio(session?.setup.voice ?? "male2");

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    getInterviewSession(user.uid, id)
      .then(async (s) => {
        if (cancelled) return;
        if (!s) {
          setMissing(true);
          return;
        }
        if (s.status === "in_progress") {
          router.replace(`/interview/${id}`);
          return;
        }
        setSession(s);
        setExpanded(answeredMainIndexes(s.turns)[0] ?? null);
        const recent = await listRecentInterviewSessions(user.uid, 10).catch(() => []);
        if (!cancelled) setPrevious(recent.find((r) => r.id !== s.id && r.createdAt < s.createdAt && r.report) ?? null);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, id, router]);

  if (authLoading || (user && !resolved)) return <p>Đang tải…</p>;
  if (!user) {
    return (
      <div>
        <h2 className="scr-title">Kết quả phỏng vấn</h2>
        <p className="scr-sub">Đăng nhập để xem kết quả.</p>
        <SignInButton />
      </div>
    );
  }
  if (missing) {
    return (
      <div>
        <h2 className="scr-title">Không tìm thấy buổi phỏng vấn</h2>
        <Link href="/interview">Về trang Phỏng vấn</Link>
      </div>
    );
  }
  if (!session) return <p>Đang tải…</p>;

  const report = session.report;
  const delta =
    report && previous?.report ? Math.round((report.overall - previous.report.overall) * 10) / 10 : null;
  const typeLabel = INTERVIEW_TYPES.find((t) => t.id === session.setup.type)?.label ?? session.setup.type;
  const levelLabel = INTERVIEW_LEVELS.find((l) => l.id === session.setup.level)?.label ?? session.setup.level;
  const answered = answeredMainIndexes(session.turns);
  const touched = [...new Set(session.turns.map((t) => t.mainIndex))].sort((a, b) => a - b);

  async function handleRegrade() {
    if (!user || !settings || !session) return;
    setRegrading(true);
    setRegradeError(null);
    try {
      // Same once-per-session memory update as the session page's grading step.
      const gm = await loadGradingMemory(user.uid, { kind: "interview", session }).catch(() => null);
      const raw = await callInterviewAi(settings, buildReportPrompt(session.setup, session.plan, session.turns, toReportMemoryInput(gm)));
      const next = parseReport(raw, answeredMainIndexes(session.turns));
      await completeInterviewSession(user.uid, session.id, next);
      if (gm) {
        await applyGradingMemory(user.uid, session.id, gm, parseMemoryUpdate(raw, gm.mistakes?.map((m) => m.id) ?? [], "interview"));
      }
      setSession({ ...session, report: next, reportError: false, ...(gm ? { memoryApplied: true } : {}) });
    } catch (err) {
      setRegradeError(err instanceof Error ? err.message : "Chấm lại thất bại.");
    }
    setRegrading(false);
  }

  return (
    <div className="iv-page iv-report">
      <header className="iv-report-head">
        <div>
          <Link href="/interview">← Phỏng vấn</Link>
          <h2 className="scr-title">Kết quả buổi phỏng vấn</h2>
          <p className="iv-muted">
            {`${session.setup.role} · ${typeLabel} · ${levelLabel} · ${answered.length}/${session.plan.length} câu · ${formatDate(session.createdAt)}`}
          </p>
        </div>
        <Link href="/interview" className="btn-primary">Buổi mới</Link>
      </header>

      {report ? (
        <>
          <ScoreSummary report={report} delta={delta} />
          <ImprovementList items={report.improvements} />
        </>
      ) : (
        <section className="iv-card">
          <p>Chưa chấm được buổi này.</p>
          <div className="iv-row">
            <button type="button" className="btn-primary" disabled={regrading || !hasAiKey(settings)} onClick={() => void handleRegrade()}>
              Chấm lại
            </button>
            {regrading && <span className="iv-muted">Đang chấm…</span>}
          </div>
          {regradeError && <p className="iv-error" role="alert">{regradeError}</p>}
        </section>
      )}

      <section className="iv-qr-list" aria-label="Từng câu hỏi">
        <h3 className="iv-card-title">Từng câu hỏi</h3>
        <PhraseSaveBar saver={saver} items={phraseItems} />
        {saver.modal}
        {touched.map((i) => (
          <QuestionReview
            key={i}
            number={i + 1}
            question={session.plan[i]?.en ?? ""}
            answer={combinedAnswer(session.turns, i)}
            skipped={!answered.includes(i)}
            item={report?.questions.find((q) => q.mainIndex === i)}
            expanded={expanded === i}
            onToggle={() => setExpanded(expanded === i ? null : i)}
            onPlayModel={(text) => {
              audio.stop();
              void audio.speak(text);
            }}
            savedPhrases={saver.saved}
            onSavePhrase={(p, ex) => void saver.saveOne({ text: p.text, meaning: p.meaning, example: ex })}
            recordingKeys={session.turns.flatMap((t, ti) =>
              t.mainIndex === i && !t.skipped ? [interviewRecordingKey(session.id, ti)] : []
            )}
          />
        ))}
      </section>
    </div>
  );
}
