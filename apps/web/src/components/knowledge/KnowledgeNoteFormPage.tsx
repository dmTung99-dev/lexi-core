"use client";

import type { KnowledgeNote } from "@/lib/knowledgeNotes";
import type { KnowledgeNoteDraft } from "@/lib/knowledgeNoteSource";
import type { TargetLanguage } from "@/lib/languages";
import { useKnowledgeNoteForm } from "@/lib/useKnowledgeNoteForm";
import { KnowledgeNoteFormFields } from "./KnowledgeNoteFormFields";

interface KnowledgeNoteFormPageProps {
  draft?: KnowledgeNoteDraft | null;
  overwriteNoteId?: string | null;
  sourcePrompt?: string | null;
  targetLanguage: TargetLanguage;
  existingNotes: KnowledgeNote[];
  onClose: () => void;
  onSave: (note: KnowledgeNote) => Promise<void>;
}

/**
 * Full-page write form — used by /knowledge/new (creating a note) and the
 * "ready" step of /knowledge/compose (reviewing a fresh AI draft before its
 * first save), where every field needs to be visible at once. Editing a
 * section of an already-existing note instead uses KnowledgeSectionEditModal
 * from the detail page. Layout mirrors KnowledgeNoteView's detail page: a
 * back link, heading, two-column body (prose left, reference material +
 * metadata right), actions at the bottom.
 */
export function KnowledgeNoteFormPage({
  draft,
  overwriteNoteId,
  sourcePrompt,
  targetLanguage,
  existingNotes,
  onClose,
  onSave,
}: KnowledgeNoteFormPageProps) {
  const form = useKnowledgeNoteForm({
    draft,
    overwriteNoteId,
    sourcePrompt,
    targetLanguage,
    existingNotes,
    onSave,
  });

  const heading = draft ? "Xem lại bản nháp" : "Ghi chú kiến thức mới";

  return (
    <div className="knowledge-detail">
      <button type="button" className="link-btn knowledge-back-link" onClick={onClose}>
        ← Quay lại
      </button>

      <h2>{heading}</h2>
      {form.error && <p role="alert">Lỗi lưu: {form.error}</p>}

      <KnowledgeNoteFormFields form={form} targetLanguage={targetLanguage} />

      <div className="knowledge-form-actions">
        <button onClick={onClose} disabled={form.saving}>
          Huỷ
        </button>
        <button className="save-btn" onClick={() => void form.handleSave()} disabled={form.saving}>
          {form.saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </div>
  );
}
