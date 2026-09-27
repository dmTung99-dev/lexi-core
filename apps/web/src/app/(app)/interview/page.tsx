"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { SignInButton } from "@/components/SignInButton";
import { hasAiKey } from "@/lib/interviewAi";
import { createInterviewSession, listRecentInterviewSessions } from "@/lib/interviewSessions";
import { getCvProfile } from "@/lib/cvProfile";
import { warmUpSpeech } from "@/lib/warmUpSpeechClient";
import { getMicPermission, requestMicPermission, type MicPermission } from "@/lib/micPermission";
import { useInterviewAudio } from "@/lib/useInterviewAudio";
import type { InterviewCvProfile, InterviewSession, InterviewVoice } from "@/lib/interviewTypes";
import { DEFAULT_SETUP_DRAFT, SetupForm, type SetupDraft } from "@/components/interview/SetupForm";
import { CvUpload } from "@/components/interview/CvUpload";
import { ReadinessCard } from "@/components/interview/ReadinessCard";
import { RecentSessions } from "@/components/interview/RecentSessions";

const VOICE_SAMPLE = "Hi, I'll be your interviewer today.";

export default function InterviewSetupPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();
  const { settings } = useSettingsContext();
  const [draft, setDraft] = useState<SetupDraft>(DEFAULT_SETUP_DRAFT);
  const [cv, setCv] = useState<InterviewCvProfile | null>(null);
  const [recent, setRecent] = useState<InterviewSession[]>([]);
  const [mic, setMic] = useState<MicPermission>("prompt");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const preview = useInterviewAudio(draft.voice);

  useEffect(() => {
    if (!user) return;
    void warmUpSpeech();
    getCvProfile(user.uid).then(setCv).catch(() => {});
    listRecentInterviewSessions(user.uid).then(setRecent).catch(() => {});
    void getMicPermission().then(setMic);
  }, [user]);

  // Runs after the render that applied the newly picked voice, so the
  // audio hook's voice ref is already current.
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
        <h2 className="scr-title">Phỏng vấn tiếng Anh</h2>
        <p className="scr-sub">Đăng nhập để luyện phỏng vấn.</p>
        <SignInButton />
      </div>
    );
  }

  const aiReady = hasAiKey(settings);
  const canStart = aiReady && draft.role.trim().length > 0 && mic !== "denied" && mic !== "unsupported" && !starting;

  function handlePreviewVoice(voice: InterviewVoice) {
    setDraft((d) => ({ ...d, voice }));
    setPreviewNonce((n) => n + 1);
  }

  async function handleRequestMic() {
    setMic((await requestMicPermission()) ? "granted" : "denied");
  }

  async function handleStart() {
    if (!user || !canStart) return;
    setStarting(true);
    setStartError(null);
    try {
      const id = await createInterviewSession(user.uid, {
        ...draft,
        role: draft.role.trim(),
        jd: draft.jd.trim(),
        cvSummary: cv?.summary ?? null,
      });
      router.push(`/interview/${id}`);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Không tạo được buổi phỏng vấn.");
      setStarting(false);
    }
  }

  return (
    <div className="iv-page">
      <h2 className="scr-title">Phỏng vấn tiếng Anh</h2>
      <p className="scr-sub">
        Luyện trả lời phỏng vấn bằng giọng nói với người phỏng vấn AI. Nói xong một câu, AI nghe, hỏi tiếp, và chấm chi tiết ở cuối buổi.
      </p>
      <div className="iv-setup-layout">
        <section className="iv-card iv-setup-main" aria-label="Thiết lập">
          <SetupForm
            value={draft}
            onChange={setDraft}
            onPreviewVoice={handlePreviewVoice}
            cvSlot={settings ? <CvUpload uid={user.uid} settings={settings} profile={cv} onChange={setCv} /> : null}
          />
          <div className="iv-row iv-start-row">
            <button type="button" className="btn-primary" disabled={!canStart} onClick={() => void handleStart()}>
              Bắt đầu phỏng vấn
            </button>
            {startError && <p className="iv-error" role="alert">{startError}</p>}
          </div>
        </section>
        <aside className="iv-setup-side">
          <ReadinessCard aiReady={aiReady} mic={mic} onRequestMic={() => void handleRequestMic()} />
          <RecentSessions sessions={recent} />
        </aside>
      </div>
    </div>
  );
}
