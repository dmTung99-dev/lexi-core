"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { getKnowledgeNotes, restoreStarters, seedStartersIfNeeded, type KnowledgeNote } from "@/lib/knowledgeNotes";
import { startersFor } from "@/lib/knowledgeStarters";
import {
  applyKnowledgeFilter,
  knowledgeAllTags,
  knowledgeGroupCounts,
  visibleKnowledgeTags,
  type KnowledgeFilter,
} from "@/lib/knowledgeFilters";
import { KnowledgeGroupGrid } from "@/components/knowledge/KnowledgeGroupGrid";
import { KnowledgeNoteCard } from "@/components/knowledge/KnowledgeNoteCard";
import { KnowledgeTagFilterModal } from "@/components/knowledge/KnowledgeTagFilterModal";
import { SignInButton } from "@/components/SignInButton";

const EXAMPLE_PROMPTS = [
  "Thì hiện tại hoàn thành",
  "Câu điều kiện loại 2",
  'Phân biệt "make" và "do"',
];

// The tag bar is the union of every note's tags — unlike a single note's own
// tags, this list only grows as more notes/tags accumulate, so it needs a
// hard display cap (see visibleKnowledgeTags) rather than relying on notes
// staying small.
const MAX_VISIBLE_TAGS = 8;

export default function KnowledgePage() {
  const { user, loading: authLoading } = useAuthUser();
  const { settings, loading: settingsLoading } = useSettingsContext();
  const [notes, setNotes] = useState<KnowledgeNote[] | null>(null);
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [tagModalOpen, setTagModalOpen] = useState(false);

  useEffect(() => {
    if (!user || !settings) return;
    const language = settings.targetLanguage;
    seedStartersIfNeeded(user.uid, language, startersFor(language))
      .then(() => getKnowledgeNotes(user.uid, language))
      .then(setNotes)
      .catch(() => setNotes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, settings]);

  if (authLoading) return <p>Đang tải…</p>;

  if (!user) {
    return (
      <div>
        <h2 className="scr-title">Kiến thức</h2>
        <p className="scr-sub">Đăng nhập để xem kiến thức.</p>
        <SignInButton />
      </div>
    );
  }

  if (settingsLoading || !settings || notes === null) return <p>Đang tải…</p>;

  const language = settings.targetLanguage;
  const showRestore = language === "english";

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const handleRestore = async () => {
    await restoreStarters(user.uid, language, startersFor(language));
    const refreshed = await getKnowledgeNotes(user.uid, language);
    setNotes(refreshed);
    setRestoreMessage("Đã khôi phục ghi chú mẫu.");
  };

  const filter: KnowledgeFilter = {
    query,
    groupIds: new Set(),
    levels: new Set(),
    tags: selectedTags,
  };
  const listMode = query.trim() !== "" || selectedTags.size > 0;
  const counts = knowledgeGroupCounts(notes);
  const allTags = knowledgeAllTags(notes);
  const { visible: visibleTags, hiddenCount } = visibleKnowledgeTags(allTags, selectedTags, MAX_VISIBLE_TAGS);
  const filtered = listMode ? applyKnowledgeFilter(notes, filter) : [];

  return (
    <div>
      <div className="knowledge-header-row">
        <h2 className="scr-title">Kiến thức</h2>
        {showRestore && (
          <button type="button" className="link-btn" onClick={() => void handleRestore()}>
            Khôi phục ghi chú mẫu
          </button>
        )}
      </div>
      {restoreMessage && <p className="scr-sub">{restoreMessage}</p>}

      {notes.length === 0 ? (
        <>
          <div className="knowledge-empty">
            <p>Chưa có ghi chú nào.</p>
            <p className="scr-sub">Thử nhờ AI soạn một ghi chú, ví dụ:</p>
            <ul>
              {EXAMPLE_PROMPTS.map((prompt) => (
                <li key={prompt}>{prompt}</li>
              ))}
            </ul>
            <Link href="/knowledge/compose" className="btn-primary">
              Nhờ AI soạn
            </Link>
          </div>
          <Link href="/knowledge/new" className="knowledge-write-link">
            + Tự viết
          </Link>
        </>
      ) : (
        <>
          <div className="vb-search">
            <input
              type="text"
              aria-label="Tìm kiến thức"
              placeholder="Tìm kiến thức…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {allTags.length > 0 && (
            <div className="vb-toolbar">
              {visibleTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`vb-chip${selectedTags.has(tag) ? " active" : ""}`}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              ))}
              {hiddenCount > 0 && (
                <button type="button" className="vb-chip" onClick={() => setTagModalOpen(true)}>
                  +{hiddenCount}
                </button>
              )}
              {selectedTags.size > 0 && (
                <button
                  type="button"
                  className="vb-chip vb-chip-clear"
                  onClick={() => setSelectedTags(new Set())}
                >
                  ✕ Xoá lọc
                </button>
              )}
            </div>
          )}

          {tagModalOpen && (
            <KnowledgeTagFilterModal
              allTags={allTags}
              selectedTags={selectedTags}
              onToggle={toggleTag}
              onClearAll={() => setSelectedTags(new Set())}
              onClose={() => setTagModalOpen(false)}
            />
          )}

          {listMode ? (
            filtered.length === 0 ? (
              <p className="scr-sub">Không có ghi chú nào khớp.</p>
            ) : (
              <div className="knowledge-card-grid">
                {filtered.map((note) => (
                  <KnowledgeNoteCard key={note.id} note={note} href={`/knowledge/note/${note.id}`} />
                ))}
              </div>
            )
          ) : (
            <KnowledgeGroupGrid language={language} counts={counts} />
          )}

          <div className="knowledge-bottom-actions">
            <Link href="/knowledge/compose" className="btn-primary">
              + Nhờ AI soạn
            </Link>
            <Link href="/knowledge/new" className="btn-secondary">
              + Tự viết
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
