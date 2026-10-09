"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { SignInButton } from "@/components/SignInButton";
import { callInterviewAi, hasAiKey } from "@/lib/interviewAi";
import { createConversationSession, listRecentConversationSessions } from "@/lib/conversationSessions";
import { buildScenarioPrompt, parseScenario } from "@/lib/conversationPrompts";
import { warmUpSpeech } from "@/lib/warmUpSpeechClient";
import { getMicPermission, requestMicPermission, type MicPermission } from "@/lib/micPermission";
import { useInterviewAudio } from "@/lib/useInterviewAudio";
import type { InterviewVoice } from "@/lib/interviewTypes";
import type { ConversationSession } from "@/lib/conversationTypes";
import {
  ConversationSetupForm,
  DEFAULT_CONVERSATION_DRAFT,
  draftToSetup,
  isDraftReady,
  type ConversationDraft,
} from "@/components/conversation/ConversationSetupForm";
import { RecentConversations } from "@/components/conversation/RecentConversations";
import { ReadinessCard } from "@/components/interview/ReadinessCard";

const VOICE_SAMPLE = "Hi! Let's have a chat.";

export default function ConversationSetupPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();
  const { settings } = useSettingsContext();
  const [draft, setDraft] = useState<ConversationDraft>(DEFAULT_CONVERSATION_DRAFT);
  const [recent, setRecent] = useState<ConversationSession[]>([]);
  const [mic, setMic] = useState<MicPermission>("prompt");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const preview = useInterviewAudio(draft.voice);

  useEffect(() => {
    if (!user) return;
    void warmUpSpeech();
    listRecentConversationSessions(user.uid).then(setRecent).catch(() => {});
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
      setDraft((d) => ({ ...d, persona, goals }));
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : "Không dựng được tình huống.");
    }
    setBuilding(false);
  }

  async function handleStart() {
    if (!user || !canStart) return;
    setStarting(true);
    setStartError(null);
    try {
      const id = await createConversationSession(user.uid, draftToSetup(draft));
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
          <ReadinessCard aiReady={aiReady} mic={mic} onRequestMic={() => void requestMicPermission().then((ok) => setMic(ok ? "granted" : "denied"))} />
          <RecentConversations sessions={recent} />
        </aside>
      </div>
    </div>
  );
}
