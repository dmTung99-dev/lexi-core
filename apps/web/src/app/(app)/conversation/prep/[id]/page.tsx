"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { useRouteParams } from "@/lib/useRouteParams";
import { useInterviewAudio } from "@/lib/useInterviewAudio";
import { useSpeakPending } from "@/lib/useSpeakPending";
import { SignInButton } from "@/components/SignInButton";
import { getConversationPrep } from "@/lib/conversationPreps";
import { isPhraseSaved } from "@/lib/savePhraseToVocab";
import type { ConversationPrep } from "@/lib/conversationPrepTypes";
import { PrepDialogue } from "@/components/conversation/prep/PrepDialogue";
import { PrepPatternCard } from "@/components/conversation/prep/PrepPatternCard";
import { PrepVocabList } from "@/components/conversation/prep/PrepVocabList";
import { PhraseSaveBar, usePhraseVocabSaver } from "@/components/shared/PhraseVocabSaver";

export default function ConversationPrepKitPage({ params }: { params: Promise<{ id: string }> }) {
  const resolved = useRouteParams(params);
  const id = resolved?.id ?? null;
  const { user, loading: authLoading } = useAuthUser();
  const [prep, setPrep] = useState<ConversationPrep | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [ringed, setRinged] = useState<number | null>(null);
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useInterviewAudio("female1");
  const speaker = useSpeakPending(audio);
  const { settings } = useSettingsContext();
  const saver = usePhraseVocabSaver({
    uid: user?.uid ?? null,
    settings,
    level: prep?.level ?? "B1",
    note: "Từ Chuẩn bị tình huống",
  });
  const { markSaved } = saver;

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    getConversationPrep(user.uid, id)
      .then(async (p) => {
        if (cancelled) return;
        if (!p) {
          setMissing(true);
          return;
        }
        setPrep(p);
        const flags = await Promise.all(p.vocab.map((v) => isPhraseSaved(user.uid, v.text).catch(() => false)));
        if (!cancelled) markSaved(p.vocab.filter((_, i) => flags[i]).map((v) => v.text));
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, id, reloadKey, markSaved]);

  useEffect(() => () => {
    if (ringTimer.current) clearTimeout(ringTimer.current);
  }, []);

  if (authLoading || (user && !resolved)) return <p>Đang tải…</p>;
  if (!user) {
    return (
      <div>
        <h2 className="scr-title">Chuẩn bị tình huống</h2>
        <p className="scr-sub">Đăng nhập để xem bộ tài liệu.</p>
        <SignInButton />
      </div>
    );
  }
  if (loadError) {
    return (
      <div>
        <h2 className="scr-title">Không tải được bộ tài liệu</h2>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setLoadError(false);
            setReloadKey((k) => k + 1);
          }}
        >
          Thử lại
        </button>
        <p>
          <Link href="/conversation/prep">Về Chuẩn bị tình huống</Link>
        </p>
      </div>
    );
  }
  if (missing) {
    return (
      <div>
        <h2 className="scr-title">Không tìm thấy bộ tài liệu</h2>
        <Link href="/conversation/prep">Về Chuẩn bị tình huống</Link>
      </div>
    );
  }
  if (!prep) return <p>Đang tải…</p>;

  const speak = speaker.speak;

  function showPattern(index: number) {
    document.getElementById(`prep-pattern-${index}`)?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    setRinged(index);
    if (ringTimer.current) clearTimeout(ringTimer.current);
    ringTimer.current = setTimeout(() => setRinged(null), 1600);
  }

  return (
    <div className="iv-page prep-kit">
      <Link href="/conversation/prep">← Chuẩn bị tình huống</Link>
      <header className="prep-kit-head">
        <div>
          <div className="iv-row">
            <h2 className="scr-title">{prep.title}</h2>
            <span className="prep-level">{prep.level}</span>
          </div>
          <p className="prep-situation">{`“${prep.situation}”`}</p>
        </div>
        <div className="prep-cta-bar">
          <Link href={`/conversation?prep=${prep.id}`} className="btn-primary prep-cta">
            Luyện nhập vai tình huống này →
          </Link>
        </div>
      </header>

      <nav className="prep-jump" aria-label="Mục lục">
        <a href="#prep-dialogue">Kịch bản</a>
        <a href="#prep-patterns">Mẫu câu</a>
        <a href="#prep-vocab">Từ mới</a>
      </nav>

      <div className="prep-kit-grid">
        <section id="prep-dialogue" className="iv-card prep-section">
          <h3 className="iv-card-title prep-section-title">Kịch bản mẫu</h3>
          <PrepDialogue lines={prep.dialogue} patterns={prep.patterns} onSpeak={speak} speakingKey={speaker.pendingKey} onPatternClick={showPattern} />
        </section>
        <div className="prep-kit-side">
          <section id="prep-patterns" className="iv-card prep-section">
            <h3 className="iv-card-title prep-section-title">Mẫu câu hay dùng</h3>
            {prep.patterns.map((p, i) => (
              <PrepPatternCard key={i} pattern={p} index={i} ringed={ringed === i} onSpeak={speak} speakingKey={speaker.pendingKey} />
            ))}
          </section>
          <section id="prep-vocab" className="iv-card prep-section">
            <h3 className="iv-card-title prep-section-title">Từ/cụm từ mới</h3>
            <PrepVocabList
              items={prep.vocab}
              saved={saver.saved}
              savingText={saver.pendingText}
              saveDisabled={saver.busy}
              onSave={(item) => void saver.saveOne(item)}
              onSpeak={speak}
              speakingKey={speaker.pendingKey}
            />
            <PhraseSaveBar saver={saver} items={prep.vocab} />
            {saver.modal}
            <p className="iv-muted">→ lưu vào Ngân hàng từ vựng</p>
          </section>
        </div>
      </div>
    </div>
  );
}
