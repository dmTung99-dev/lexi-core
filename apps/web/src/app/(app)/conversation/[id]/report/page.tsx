"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { useRouteParams } from "@/lib/useRouteParams";
import { SignInButton } from "@/components/SignInButton";
import { callInterviewAi, hasAiKey } from "@/lib/interviewAi";
import { buildConversationReportPrompt, parseConversationReport, userMessageIndexes } from "@/lib/conversationReportPrompt";
import { completeConversationSession, getConversationSession, listRecentConversationSessions } from "@/lib/conversationSessions";
import { getVocabRecordByHeadword, saveVocabRecord } from "@/lib/vocabRecords";
import { capitalizeHeadword } from "@/lib/vocabDisplay";
import { conversationRecordingKey } from "@/lib/recordedAudioStore";
import type { ConversationPhrase, ConversationSession } from "@/lib/conversationTypes";
import { ConversationReportSummary } from "@/components/conversation/ConversationReportSummary";
import { RecurringMistakes } from "@/components/conversation/RecurringMistakes";
import { CorrectionList } from "@/components/conversation/CorrectionList";
import { PhraseSaveList } from "@/components/conversation/PhraseSaveList";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export default function ConversationReportPage({ params }: { params: Promise<{ id: string }> }) {
  const resolved = useRouteParams(params);
  const id = resolved?.id ?? null;
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();
  const { settings } = useSettingsContext();
  const [session, setSession] = useState<ConversationSession | null>(null);
  const [previous, setPrevious] = useState<ConversationSession | null>(null);
  const [missing, setMissing] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [regrading, setRegrading] = useState(false);
  const [regradeError, setRegradeError] = useState<string | null>(null);
  const [phraseSaveError, setPhraseSaveError] = useState<string | null>(null);
  const savingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    getConversationSession(user.uid, id)
      .then(async (s) => {
        if (cancelled) return;
        if (!s) {
          setMissing(true);
          return;
        }
        if (s.status === "in_progress") {
          router.replace(`/conversation/${id}`);
          return;
        }
        setSession(s);
        const recent = await listRecentConversationSessions(user.uid, 10).catch(() => []);
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
        <h2 className="scr-title">Kết quả hội thoại</h2>
        <p className="scr-sub">Đăng nhập để xem kết quả.</p>
        <SignInButton />
      </div>
    );
  }
  if (missing) {
    return (
      <div>
        <h2 className="scr-title">Không tìm thấy buổi trò chuyện</h2>
        <Link href="/conversation">Về trang Hội thoại</Link>
      </div>
    );
  }
  if (!session) return <p>Đang tải…</p>;

  const report = session.report;
  const delta = report && previous?.report ? Math.round((report.overall - previous.report.overall) * 10) / 10 : null;

  async function handleRegrade() {
    if (!user || !settings || !session) return;
    setRegrading(true);
    setRegradeError(null);
    try {
      const next = parseConversationReport(
        await callInterviewAi(
          settings,
          buildConversationReportPrompt(session.setup, session.summary, session.messages, session.goalsDone)
        ),
        userMessageIndexes(session.messages),
        session.setup.mode === "roleplay"
      );
      await completeConversationSession(user.uid, session.id, next);
      setSession({ ...session, report: next, reportError: false });
    } catch (err) {
      setRegradeError(err instanceof Error ? err.message : "Chấm lại thất bại.");
    }
    setRegrading(false);
  }

  async function handleSavePhrase(phrase: ConversationPhrase) {
    if (!user) return;
    // Guards a double-click from firing two saves for the same phrase.
    if (savingRef.current.has(phrase.text)) return;
    savingRef.current.add(phrase.text);
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
          examples: phrase.example ? [phrase.example] : [],
          personalNotes: "Từ luyện Hội thoại tiếng Anh",
          topicIds: [],
          targetLanguage: "english",
          cefrLevel: "b1",
          activeContext: "general",
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
      setPhraseSaveError("Không lưu được cụm từ — thử lại.");
    } finally {
      savingRef.current.delete(phrase.text);
    }
  }

  return (
    <div className="iv-page iv-report">
      <header className="iv-report-head">
        <div>
          <Link href="/conversation">← Hội thoại</Link>
          <h2 className="scr-title">Kết quả hội thoại</h2>
          <p className="iv-muted">
            {`${session.setup.topic} · ${session.setup.level} · ${session.setup.mode === "roleplay" ? "Nhập vai" : "Chủ đề tự do"} · ${formatDate(session.createdAt)}`}
          </p>
        </div>
        <Link href="/conversation" className="btn-primary">Buổi mới</Link>
      </header>

      {report ? (
        <>
          <ConversationReportSummary report={report} delta={delta} />
          <RecurringMistakes items={report.recurringMistakes} />
          <CorrectionList
            items={report.corrections}
            recordingKeyFor={(i) => conversationRecordingKey(session.id, i)}
          />
          {phraseSaveError && <p className="iv-error" role="alert">{phraseSaveError}</p>}
          <PhraseSaveList phrases={report.phrases} saved={saved} onSave={(p) => void handleSavePhrase(p)} />
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
    </div>
  );
}
