"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuthUser } from "@/lib/useAuthUser";
import { useRouteParams } from "@/lib/useRouteParams";
import { useInterviewAudio } from "@/lib/useInterviewAudio";
import { SignInButton } from "@/components/SignInButton";
import { getConversationPrep } from "@/lib/conversationPreps";
import { isPhraseSaved, savePhraseToVocab } from "@/lib/savePhraseToVocab";
import type { ConversationPrep } from "@/lib/conversationPrepTypes";
import type { ConversationPhrase } from "@/lib/conversationTypes";
import { PrepDialogue } from "@/components/conversation/prep/PrepDialogue";
import { PrepPatternCard } from "@/components/conversation/prep/PrepPatternCard";
import { PrepVocabList } from "@/components/conversation/prep/PrepVocabList";

export default function ConversationPrepKitPage({ params }: { params: Promise<{ id: string }> }) {
  const resolved = useRouteParams(params);
  const id = resolved?.id ?? null;
  const { user, loading: authLoading } = useAuthUser();
  const [prep, setPrep] = useState<ConversationPrep | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [ringed, setRinged] = useState<number | null>(null);
  const savingRef = useRef<Set<string>>(new Set());
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useInterviewAudio("female1");

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
        if (!cancelled) setSaved((prev) => new Set([...prev, ...p.vocab.filter((_, i) => flags[i]).map((v) => v.text)]));
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, id, reloadKey]);

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

  function speak(text: string) {
    audio.stop();
    void audio.speak(text);
  }

  function showPattern(index: number) {
    document.getElementById(`prep-pattern-${index}`)?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    setRinged(index);
    if (ringTimer.current) clearTimeout(ringTimer.current);
    ringTimer.current = setTimeout(() => setRinged(null), 1600);
  }

  async function handleSave(item: ConversationPhrase) {
    if (!user || !prep) return;
    if (savingRef.current.has(item.text)) return;
    savingRef.current.add(item.text);
    setSaveError(null);
    try {
      await savePhraseToVocab(user.uid, item, { level: prep.level, note: "Từ Chuẩn bị tình huống" });
      setSaved((prev) => new Set(prev).add(item.text));
    } catch {
      setSaveError("Không lưu được từ — thử lại.");
    } finally {
      savingRef.current.delete(item.text);
    }
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
          <PrepDialogue lines={prep.dialogue} patterns={prep.patterns} onSpeak={speak} onPatternClick={showPattern} />
        </section>
        <div className="prep-kit-side">
          <section id="prep-patterns" className="iv-card prep-section">
            <h3 className="iv-card-title prep-section-title">Mẫu câu hay dùng</h3>
            {prep.patterns.map((p, i) => (
              <PrepPatternCard key={i} pattern={p} index={i} ringed={ringed === i} onSpeak={speak} />
            ))}
          </section>
          <section id="prep-vocab" className="iv-card prep-section">
            <h3 className="iv-card-title prep-section-title">Từ/cụm từ mới</h3>
            {saveError && <p className="iv-error" role="alert">{saveError}</p>}
            <PrepVocabList items={prep.vocab} saved={saved} onSave={(item) => void handleSave(item)} onSpeak={speak} />
            <p className="iv-muted">→ lưu vào Ngân hàng từ vựng</p>
          </section>
        </div>
      </div>
    </div>
  );
}
