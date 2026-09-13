"use client";

import { useState } from "react";
import Link from "next/link";
import type { KnowledgeNote } from "@/lib/knowledgeNotes";
import { knowledgeGroupLabel } from "@/lib/knowledgeGroups";
import type { TargetLanguage } from "@/lib/languages";
import { BoldText } from "@/components/shared/BoldText";
import { HighlightedText } from "@/components/shared/HighlightedText";
import { KnowledgeSectionEditModal, type KnowledgeEditSection } from "./KnowledgeSectionEditModal";

interface KnowledgeNoteViewProps {
  note: KnowledgeNote;
  knownHeadwords: string[];
  targetLanguage: TargetLanguage;
  onDelete: () => void;
  onSave: (note: KnowledgeNote) => Promise<void>;
}

export function KnowledgeNoteView({ note, knownHeadwords, targetLanguage, onDelete, onSave }: KnowledgeNoteViewProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editingSection, setEditingSection] = useState<KnowledgeEditSection | null>(null);

  const groupLabel = knowledgeGroupLabel(note.groupId);

  return (
    <div className="knowledge-detail">
      <Link href={`/knowledge/group/${note.groupId}`} className="link-btn knowledge-back-link">
        ← {groupLabel}
      </Link>

      <div className="knowledge-detail-actions">
        {confirmingDelete ? (
          <>
            <button type="button" className="vb-chip" onClick={onDelete}>
              Xác nhận xoá?
            </button>
            <button type="button" className="vb-chip" onClick={() => setConfirmingDelete(false)}>
              Huỷ
            </button>
          </>
        ) : (
          <button type="button" className="vb-chip" onClick={() => setConfirmingDelete(true)}>
            Xoá
          </button>
        )}
      </div>

      <div className="knowledge-header-row">
        <h2>{note.title}</h2>
        <button
          type="button"
          className="vb-chip"
          aria-label="Sửa tiêu đề & tóm tắt"
          onClick={() => setEditingSection("header")}
        >
          ✎
        </button>
      </div>
      {note.summary && <p className="scr-sub">{note.summary}</p>}

      <div className="knowledge-detail-columns">
        <div className="knowledge-detail-col">
          <section>
            <div className="knowledge-header-row">
              <h3>Giải thích</h3>
              <button
                type="button"
                className="vb-chip"
                aria-label="Sửa giải thích"
                onClick={() => setEditingSection("explanation")}
              >
                ✎
              </button>
            </div>
            {note.explanation ? (
              <BoldText source={note.explanation} />
            ) : (
              <p className="scr-sub">Chưa có giải thích.</p>
            )}
          </section>

          <section>
            <div className="knowledge-header-row">
              <h3>Lỗi thường gặp</h3>
              <button
                type="button"
                className="vb-chip"
                aria-label="Sửa lỗi thường gặp"
                onClick={() => setEditingSection("pitfalls")}
              >
                ✎
              </button>
            </div>
            {note.pitfalls.length > 0 ? (
              note.pitfalls.map((pitfall, i) => <BoldText key={i} source={pitfall} />)
            ) : (
              <p className="scr-sub">Chưa có lỗi thường gặp nào.</p>
            )}
          </section>
        </div>

        <div className="knowledge-detail-col">
          <section>
            <div className="knowledge-header-row">
              <h3>Mẫu câu</h3>
              <button
                type="button"
                className="vb-chip"
                aria-label="Sửa mẫu câu"
                onClick={() => setEditingSection("patterns")}
              >
                ✎
              </button>
            </div>
            {note.patterns.length > 0 ? (
              <div className="knowledge-patterns-grid">
                {note.patterns.map((pattern, i) => (
                  <code key={i} className="knowledge-pattern">
                    {pattern}
                  </code>
                ))}
              </div>
            ) : (
              <p className="scr-sub">Chưa có mẫu câu nào.</p>
            )}
          </section>

          <section>
            <div className="knowledge-header-row">
              <h3>Ví dụ</h3>
              <button
                type="button"
                className="vb-chip"
                aria-label="Sửa ví dụ"
                onClick={() => setEditingSection("examples")}
              >
                ✎
              </button>
            </div>
            {note.examples.length > 0 ? (
              <div className="knowledge-examples-grid">
                {note.examples.map((example, i) => (
                  <div key={i} className="knowledge-example">
                    <HighlightedText variant="static" text={example.text} highlights={knownHeadwords} />
                    <p className="ex-translation">{example.translation}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="scr-sub">Chưa có ví dụ nào.</p>
            )}
          </section>
        </div>
      </div>

      <div className="knowledge-pill-row">
        <span className="vb-chip">{groupLabel}</span>
        {note.cefrLevel && <span className="cefr-pill">{note.cefrLevel.toUpperCase()}</span>}
        {note.tags.map((tag) => (
          <span key={tag} className="vb-chip">
            {tag}
          </span>
        ))}
        {note.source === "starter" && <span className="vb-chip">Mẫu</span>}
        <button
          type="button"
          className="vb-chip"
          aria-label="Sửa nhóm, cấp độ & thẻ"
          onClick={() => setEditingSection("metadata")}
        >
          ✎
        </button>
      </div>

      {editingSection && (
        <KnowledgeSectionEditModal
          note={note}
          targetLanguage={targetLanguage}
          section={editingSection}
          onClose={() => setEditingSection(null)}
          onSave={onSave}
        />
      )}
    </div>
  );
}
