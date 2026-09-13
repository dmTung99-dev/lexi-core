"use client";

import type { KnowledgeNote } from "@/lib/knowledgeNotes";
import type { KnowledgeNoteDraft } from "@/lib/knowledgeNoteSource";
import type { TargetLanguage } from "@/lib/languages";
import { useKnowledgeNoteForm } from "@/lib/useKnowledgeNoteForm";
import { KnowledgeNoteFormFields } from "./KnowledgeNoteFormFields";

interface EditKnowledgeNoteModalProps {
  initial?: KnowledgeNote | null;
  draft?: KnowledgeNoteDraft | null;
  overwriteNoteId?: string | null;
  sourcePrompt?: string | null;
  targetLanguage: TargetLanguage;
  existingNotes: KnowledgeNote[];
  onClose: () => void;
  onSave: (note: KnowledgeNote) => Promise<void>;
}

/**
 * The mid-flow review step for "Nhờ AI soạn" (AiComposeModal renders this
 * once a draft is ready). Standalone create/edit now use the full-page
 * KnowledgeNoteFormPage instead — see that component for the rationale.
 */
export function EditKnowledgeNoteModal({
  initial,
  draft,
  overwriteNoteId,
  sourcePrompt,
  targetLanguage,
  existingNotes,
  onClose,
  onSave,
}: EditKnowledgeNoteModalProps) {
  const form = useKnowledgeNoteForm({
    initial,
    draft,
    overwriteNoteId,
    sourcePrompt,
    targetLanguage,
    existingNotes,
    onSave,
  });

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-label={initial ? "Sửa ghi chú" : draft ? "Xem lại bản nháp" : "Ghi chú mới"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{initial ? `Sửa "${initial.title}"` : draft ? "Xem lại bản nháp" : "Ghi chú kiến thức"}</h3>
          <button className="closex" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {form.error && <p role="alert">Lỗi lưu: {form.error}</p>}
          <KnowledgeNoteFormFields form={form} targetLanguage={targetLanguage} />
        </div>
        <div className="modal-footer">
          <button onClick={onClose} disabled={form.saving}>
            Huỷ
          </button>
          <button className="save-btn" onClick={() => void form.handleSave()} disabled={form.saving}>
            {form.saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}
