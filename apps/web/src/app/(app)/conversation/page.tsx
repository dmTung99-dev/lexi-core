"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { SignInButton } from "@/components/SignInButton";
import { callInterviewAi, hasAiKey } from "@/lib/interviewAi";
import {
  createConversationSession,
  deleteConversationSession,
  listRecentConversationSessions,
  listUnfinishedConversationSessions,
} from "@/lib/conversationSessions";
import { buildScenarioPrompt, parseScenario } from "@/lib/conversationPrompts";
import { getConversationPrep } from "@/lib/conversationPreps";
import { warmUpSpeech } from "@/lib/warmUpSpeechClient";
import { getMicPermission, requestMicPermission, type MicPermission } from "@/lib/micPermission";
import { useInterviewAudio } from "@/lib/useInterviewAudio";
import type { InterviewVoice } from "@/lib/interviewTypes";
import { MAX_USER_TURNS, userTurnCount, type ConversationSession } from "@/lib/conversationTypes";
import {
  ConversationSetupForm,
  DEFAULT_CONVERSATION_DRAFT,
  draftToSetup,
  isDraftReady,
  type ConversationDraft,
} from "@/components/conversation/ConversationSetupForm";
import { CUSTOM_PRESET_ID } from "@/components/conversation/ScenarioCards";
import { RecentConversations } from "@/components/conversation/RecentConversations";
import { ReadinessCard } from "@/components/interview/ReadinessCard";
import { UnfinishedSessions, shortDate } from "@/components/interview/UnfinishedSessions";

const VOICE_SAMPLE = "Hi! Let's have a chat.";

function ConversationSetupContent() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();
  const { settings } = useSettingsContext();
  const [draft, setDraft] = useState<ConversationDraft>(DEFAULT_CONVERSATION_DRAFT);
  const [recent, setRecent] = useState<ConversationSession[]>([]);
  const [unfinished, setUnfinished] = useState<ConversationSession[]>([]);
  const [mic, setMic] = useState<MicPermission>("prompt");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const preview = useInterviewAudio(draft.voice);
  const prepParam = useSearchParams().get("prep");
  const [prepId, setPrepId] = useState<string | null>(null);

  // ?prep=<id>: prefill a role-play from a Chuẩn bị tình huống kit — persona and
  // goals already exist, so the `scenario` call is skipped. A bad id is ignored.
  useEffect(() => {
    if (!user || !prepParam) return;
    let cancelled = false;
    getConversationPrep(user.uid, prepParam)
      .then((p) => {
        if (cancelled || !p) return;
        setPrepId(p.id);
        setDraft((d) => ({
          ...d,
          mode: "roleplay",
          presetId: CUSTOM_PRESET_ID,
          topic: p.title,
          persona: p.persona,
          goals: [...p.goals],
          level: p.level,
        }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, prepParam]);

  useEffect(() => {
    if (!user) return;
    void warmUpSpeech();
    listRecentConversationSessions(user.uid).then(setRecent).catch(() => {});
    listUnfinishedConversationSessions(user.uid).then(setUnfinished).catch(() => {});
    void getMicPermission().then(setMic);
  }, [user]);

  // Runs after the render that applied the newly picked voice, so the audio
  // hook's voice ref is already current.
  useEffect(() => {
    if (previewNonce === 0) return;
    preview.stop();
    void preview.speak(VOICE_SAMPLE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewNonce]);

  if (authLoading) return <p>Đang tải…</p>;
  if (!user) {
    return (
      <div>
        <h2 className="scr-title">Hội thoại tiếng Anh</h2>
        <p className="scr-sub">Đăng nhập để luyện hội thoại.</p>
        <SignInButton />
      </div>
    );
  }

  const aiReady = hasAiKey(settings);
  // Typing works without a microphone, so only AI readiness and a complete
  // draft gate Start.
  const canStart = aiReady && isDraftReady(draft) && !starting;

  function handlePreviewVoice(voice: InterviewVoice) {
    setDraft((d) => ({ ...d, voice }));
    setPreviewNonce((n) => n + 1);
  }

  async function handleBuildScenario() {
    if (!settings) return;
    setBuilding(true);
    setBuildError(null);
    try {
      const { persona, goals } = parseScenario(await callInterviewAi(settings, buildScenarioPrompt(draft.topic, draft.level)));
      setDraft((d) => (d.mode === "roleplay" && d.presetId === CUSTOM_PRESET_ID ? { ...d, persona, goals } : d));
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : "Không dựng được tình huống.");
    }
    setBuilding(false);
  }

  function handleDiscard(id: string) {
    if (!user) return;
    setUnfinished((list) => list.filter((s) => s.id !== id));
    void deleteConversationSession(user.uid, id).catch(() => {});
  }

  async function handleStart() {
    if (!user || !canStart) return;
    setStarting(true);
    setStartError(null);
    try {
      const setup = draftToSetup(draft);
      const id = await createConversationSession(
        user.uid,
        prepId && setup.mode === "roleplay" ? { ...setup, prepId } : setup
      );
      router.push(`/conversation/${id}`);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Không tạo được buổi trò chuyện.");
      setStarting(false);
    }
  }

  return (
    <div className="iv-page">
      <h2 className="scr-title">Hội thoại tiếng Anh</h2>
      <p className="scr-sub">
        Trò chuyện với AI về một chủ đề hoặc nhập vai một tình huống. Nói hoặc gõ đều được; lỗi sẽ được nhận xét ở cuối buổi.
      </p>
      <UnfinishedSessions
        items={unfinished.map((s) => ({
          id: s.id,
          title: `${s.setup.topic} · ${s.setup.level}`,
          detail: `${shortDate(s.createdAt)} · ${s.setup.mode === "roleplay" ? "Nhập vai" : "Chủ đề tự do"} · Lượt ${userTurnCount(s.messages)} / ${MAX_USER_TURNS}`,
          href: `/conversation/${s.id}`,
        }))}
        onDiscard={handleDiscard}
      />
      <div className="iv-setup-layout">
        <section className="iv-card iv-setup-main" aria-label="Thiết lập">
          <ConversationSetupForm
            value={draft}
            onChange={setDraft}
            onPreviewVoice={handlePreviewVoice}
            onBuildScenario={() => void handleBuildScenario()}
            building={building}
            buildError={buildError}
          />
          <div className="iv-row iv-start-row">
            <button type="button" className="btn-primary" disabled={!canStart} onClick={() => void handleStart()}>
              {draft.mode === "roleplay" ? "Bắt đầu nhập vai" : "Bắt đầu trò chuyện"}
            </button>
            {startError && <p className="iv-error" role="alert">{startError}</p>}
          </div>
        </section>
        <aside className="iv-setup-side">
          <Link href="/conversation/prep" className="iv-card prep-entry-card">
            <span className="iv-card-title">Chuẩn bị tình huống</span>
            <span className="iv-muted">Mô tả tình huống sắp tới, AI viết kịch bản mẫu, mẫu câu và từ mới.</span>
          </Link>
          <ReadinessCard aiReady={aiReady} mic={mic} onRequestMic={() => void requestMicPermission().then((ok) => setMic(ok ? "granted" : "denied"))} />
          <RecentConversations sessions={recent} />
        </aside>
      </div>
    </div>
  );
}

export default function ConversationSetupPage() {
  return (
    <Suspense fallback={<p>Đang tải…</p>}>
      <ConversationSetupContent />
    </Suspense>
  );
}
