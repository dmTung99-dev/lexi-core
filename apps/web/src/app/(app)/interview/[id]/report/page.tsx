"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { useRouteParams } from "@/lib/useRouteParams";
import { SignInButton } from "@/components/SignInButton";
import { callInterviewAi, hasAiKey } from "@/lib/interviewAi";
import { answeredMainIndexes, buildReportPrompt, parseReport } from "@/lib/interviewReportPrompt";
import { completeInterviewSession, getInterviewSession, listRecentInterviewSessions } from "@/lib/interviewSessions";
import { getVocabRecordByHeadword, saveVocabRecord } from "@/lib/vocabRecords";
import { capitalizeHeadword } from "@/lib/vocabDisplay";
import { useInterviewAudio } from "@/lib/useInterviewAudio";
import {
  INTERVIEW_LEVELS,
  INTERVIEW_TYPES,
  combinedAnswer,
  type InterviewPhrase,
  type InterviewSession,
} from "@/lib/interviewTypes";
import { ScoreSummary } from "@/components/interview/ScoreSummary";
import { ImprovementList } from "@/components/interview/ImprovementList";
import { QuestionReview } from "@/components/interview/QuestionReview";

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
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [regrading, setRegrading] = useState(false);
  const [regradeError, setRegradeError] = useState<string | null>(null);
  const [phraseSaveError, setPhraseSaveError] = useState<string | null>(null);
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
      const next = parseReport(
        await callInterviewAi(settings, buildReportPrompt(session.setup, session.plan, session.turns)),
        answeredMainIndexes(session.turns)
      );
      await completeInterviewSession(user.uid, session.id, next);
      setSession({ ...session, report: next, reportError: false });
    } catch (err) {
      setRegradeError(err instanceof Error ? err.message : "Chấm lại thất bại.");
    }
    setRegrading(false);
  }

  async function handleSavePhrase(phrase: InterviewPhrase, example: string) {
    if (!user) return;
    const headword = capitalizeHeadword(phrase.text.trim());
    setPhraseSaveError(null);
    try {
      const existing = await getVocabRecordByHeadword(user.uid, headword, "english");
      if (!existing) {
        const now = new Date().toISOString();
        await saveVocabRecord(user.uid, {
          headword,
          inputType: "phrase",
          ipa: "",
          meaning: phrase.meaning,
          examples: example ? [example] : [],
          personalNotes: "Từ luyện Phỏng vấn tiếng Anh",
          topicIds: [],
          targetLanguage: "english",
          cefrLevel: "b1",
          activeContext: "business",
          createdAt: now,
          updatedAt: now,
          nextReviewAt: null,
          sm2Repetitions: 0,
          sm2EaseFactor: 2.5,
          sm2Interval: 1,
          definition: "",
          synonyms: [],
        });
      }
      setSaved((prev) => new Set(prev).add(phrase.text));
    } catch {
      // Leave it unsaved; the user can click again.
      setPhraseSaveError("Không lưu được cụm từ — thử lại.");
    }
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
        {phraseSaveError && <p className="iv-error" role="alert">{phraseSaveError}</p>}
        {touched.map((i) => (
          <QuestionReview
            key={i}
            number={i + 1}
            question={session.plan[i] ?? ""}
            answer={combinedAnswer(session.turns, i)}
            skipped={!answered.includes(i)}
            item={report?.questions.find((q) => q.mainIndex === i)}
            expanded={expanded === i}
            onToggle={() => setExpanded(expanded === i ? null : i)}
            onPlayModel={(text) => {
              audio.stop();
              void audio.speak(text);
            }}
            savedPhrases={saved}
            onSavePhrase={(p, ex) => void handleSavePhrase(p, ex)}
          />
        ))}
      </section>
    </div>
  );
}
