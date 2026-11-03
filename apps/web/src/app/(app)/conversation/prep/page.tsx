"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { SignInButton } from "@/components/SignInButton";
import { callInterviewAi, hasAiKey } from "@/lib/interviewAi";
import { buildPrepPrompt, parsePrep } from "@/lib/conversationPrepPrompt";
import { CONVERSATION_LEVELS, type ConversationLevel } from "@/lib/conversationTypes";
import { PREP_SUGGESTIONS, type ConversationPrep, type NewConversationPrep } from "@/lib/conversationPrepTypes";
import { createConversationPrep, deleteConversationPrep, listRecentConversationPreps } from "@/lib/conversationPreps";
import { RecentPreps } from "@/components/conversation/prep/RecentPreps";

const PROGRESS = ["Đang viết kịch bản…", "Đang chọn mẫu câu…", "Đang chọn từ mới…"];

export default function ConversationPrepPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();
  const { settings } = useSettingsContext();
  const [situation, setSituation] = useState("");
  const [level, setLevel] = useState<ConversationLevel>("B1");
  const [recent, setRecent] = useState<ConversationPrep[]>([]);
  const [generating, setGenerating] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // A parsed kit whose Firestore write failed: Thử lại re-saves it without a new AI call.
  const pendingRef = useRef<NewConversationPrep | null>(null);
  // Once the user picks a level or starts generating, the late-arriving "latest kit" default must not change it.
  const levelLockedRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    listRecentConversationPreps(user.uid)
      .then((list) => {
        setRecent(list);
        if (list[0] && !levelLockedRef.current) setLevel(list[0].level);
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!generating) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => (s + 1) % PROGRESS.length), 4000);
    return () => clearInterval(t);
  }, [generating]);

  if (authLoading) return <p>Đang tải…</p>;
  if (!user) {
    return (
      <div>
        <h2 className="scr-title">Chuẩn bị tình huống</h2>
        <p className="scr-sub">Đăng nhập để chuẩn bị tình huống.</p>
        <SignInButton />
      </div>
    );
  }

  const aiReady = hasAiKey(settings);
  const canCreate = aiReady && situation.trim().length > 0 && !generating;

  async function handleCreate() {
    if (!user || !settings || !aiReady || !situation.trim() || generating) return;
    levelLockedRef.current = true;
    setGenerating(true);
    setError(null);
    const text = situation.trim();
    let phase: "ai" | "save" = "ai";
    try {
      let pending = pendingRef.current;
      if (!pending || pending.situation !== text || pending.level !== level) {
        const content = parsePrep(await callInterviewAi(settings, buildPrepPrompt(text, level)), text);
        pending = { ...content, situation: text, level };
        pendingRef.current = pending;
      }
      phase = "save";
      const id = await createConversationPrep(user.uid, pending);
      pendingRef.current = null;
      router.push(`/conversation/prep/${id}`);
    } catch (err) {
      setError(
        phase === "save"
          ? "Không lưu được bộ tài liệu — thử lại."
          : err instanceof Error
            ? err.message
            : "Không tạo được bộ tài liệu — thử lại."
      );
      setGenerating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!user) return;
    try {
      await deleteConversationPrep(user.uid, id);
      setRecent((list) => list.filter((p) => p.id !== id));
    } catch {
      setError("Không xoá được bộ tài liệu — thử lại.");
    }
  }

  const chip = (active: boolean) => (active ? "vb-chip active" : "vb-chip");

  return (
    <div className="iv-page prep-page">
      <Link href="/conversation">← Hội thoại</Link>
      <h2 className="scr-title">Chuẩn bị tình huống</h2>
      <p className="scr-sub">Mô tả tình huống sắp tới, AI viết kịch bản mẫu, mẫu câu hay dùng và từ mới cho bạn.</p>
      <div className="prep-layout">
        <section className="iv-card prep-form" aria-label="Tạo bộ tài liệu">
          <label htmlFor="prep-situation" className="prep-label">Bạn sắp gặp tình huống gì?</label>
          <textarea
            id="prep-situation"
            className="prep-textarea"
            rows={4}
            maxLength={800}
            placeholder="VD: Tôi chuẩn bị báo cáo với khách hàng về tiến độ task A…"
            value={situation}
            disabled={generating}
            onChange={(e) => setSituation(e.target.value)}
          />
          <div className="prep-chips" aria-label="Gợi ý">
            {PREP_SUGGESTIONS.map((s) => (
              <button key={s.label} type="button" className="vb-chip" disabled={generating} onClick={() => setSituation(s.text)}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="prep-chips" role="group" aria-label="Trình độ">
            {CONVERSATION_LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                className={chip(level === l)}
                aria-pressed={level === l}
                disabled={generating}
                onClick={() => {
                  levelLockedRef.current = true;
                  setLevel(l);
                }}
              >
                {l}
              </button>
            ))}
          </div>
          <button type="button" className="btn-primary" disabled={!canCreate} onClick={() => void handleCreate()}>
            {generating ? "Đang tạo…" : "Tạo kịch bản"}
          </button>
          {generating && (
            <p className="prep-progress" aria-live="polite">
              {PROGRESS[step]}
            </p>
          )}
          {error && (
            <div className="iv-row">
              <p className="iv-error" role="alert">{error}</p>
              {!generating && situation.trim() && aiReady && (
                <button type="button" className="btn-secondary" onClick={() => void handleCreate()}>
                  Thử lại
                </button>
              )}
            </div>
          )}
          {!aiReady && (
            <p className="iv-muted">
              Chưa có AI key — thêm trong <Link href="/settings">Cài đặt</Link>.
            </p>
          )}
        </section>
        <RecentPreps preps={recent} onDelete={(id) => void handleDelete(id)} />
      </div>
    </div>
  );
}
