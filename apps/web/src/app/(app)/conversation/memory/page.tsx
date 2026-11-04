"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthUser } from "@/lib/useAuthUser";
import { SignInButton } from "@/components/SignInButton";
import {
  deleteTopicFact,
  deleteTopicMemory,
  deleteTrackedMistake,
  getMistakeMemory,
  listTopicMemories,
} from "@/lib/learnerMemory";
import type { TopicMemory, TrackedMistake } from "@/lib/learnerMemoryTypes";
import { MistakeMemoryList } from "@/components/conversation/memory/MistakeMemoryList";
import { TopicMemoryList } from "@/components/conversation/memory/TopicMemoryList";

export default function MemoryPage() {
  const { user, loading: authLoading } = useAuthUser();
  const [mistakes, setMistakes] = useState<TrackedMistake[]>([]);
  const [topics, setTopics] = useState<TopicMemory[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([getMistakeMemory(user.uid), listTopicMemories(user.uid)])
      .then(([m, t]) => {
        if (cancelled) return;
        setMistakes(m.items);
        setTopics(t);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (authLoading) return <p>Đang tải…</p>;
  if (!user) {
    return (
      <div>
        <h2 className="scr-title">AI nhớ gì về bạn</h2>
        <p className="scr-sub">Đăng nhập để xem AI nhớ gì về bạn.</p>
        <SignInButton />
      </div>
    );
  }
  const uid = user.uid;

  async function run(action: () => Promise<void>, apply: () => void) {
    setDeleteError(null);
    try {
      await action();
      apply();
    } catch {
      setDeleteError("Không xoá được — thử lại.");
    }
  }

  const empty = loaded && mistakes.length === 0 && topics.length === 0;

  return (
    <div className="iv-page memory-page">
      <Link href="/conversation">← Hội thoại</Link>
      <h2 className="scr-title">AI nhớ gì về bạn</h2>
      <p className="scr-sub">Những lỗi hay mắc và nội dung bạn đã kể, để AI hỏi và luyện đúng chỗ ở buổi sau.</p>
      {loadError && <p className="iv-error" role="alert">Không tải được bộ nhớ — thử lại sau.</p>}
      {deleteError && <p className="iv-error" role="alert">{deleteError}</p>}
      {!loaded && !loadError && <p>Đang tải…</p>}
      {empty && (
        <p className="iv-muted">
          Chưa có gì ở đây. Bộ nhớ sẽ đầy dần sau khi bạn hoàn thành và chấm điểm một buổi Hội thoại hoặc Phỏng vấn.
        </p>
      )}
      <MistakeMemoryList
        items={mistakes}
        onDelete={(id) =>
          void run(() => deleteTrackedMistake(uid, id), () => setMistakes((l) => l.filter((m) => m.id !== id)))
        }
      />
      <TopicMemoryList
        groups={topics}
        onDeleteFact={(key, factId) =>
          void run(
            () => deleteTopicFact(uid, key, factId),
            () =>
              setTopics((l) =>
                l.map((g) => (g.key === key ? { ...g, facts: g.facts.filter((f) => f.id !== factId) } : g)).filter((g) => g.facts.length > 0)
              )
          )
        }
        onDeleteGroup={(key) =>
          void run(() => deleteTopicMemory(uid, key), () => setTopics((l) => l.filter((g) => g.key !== key)))
        }
      />
    </div>
  );
}
