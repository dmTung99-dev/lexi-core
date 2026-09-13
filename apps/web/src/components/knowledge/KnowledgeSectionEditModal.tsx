"use client";

import type { KnowledgeNote } from "@/lib/knowledgeNotes";
import type { TargetLanguage } from "@/lib/languages";
import { useKnowledgeNoteForm } from "@/lib/useKnowledgeNoteForm";
import {
  TitleField,
  SummaryField,
  ExplanationField,
  PatternsField,
  ExamplesField,
  PitfallsField,
  GroupField,
  CefrField,
  TagsField,
} from "./KnowledgeNoteFormFields";

export type KnowledgeEditSection =
  | "header"
  | "explanation"
  | "patterns"
  | "examples"
  | "pitfalls"
  | "metadata";

const SECTION_LABELS: Record<KnowledgeEditSection, string> = {
  header: "Sửa tiêu đề & tóm tắt",
  explanation: "Sửa giải thích",
  patterns: "Sửa mẫu câu",
  examples: "Sửa ví dụ",
  pitfalls: "Sửa lỗi thường gặp",
  metadata: "Sửa nhóm, cấp độ & thẻ",
};

interface KnowledgeSectionEditModalProps {
  note: KnowledgeNote;
  targetLanguage: TargetLanguage;
  section: KnowledgeEditSection;
  onClose: () => void;
  onSave: (note: KnowledgeNote) => Promise<void>;
}

/**
 * Edits one section of an already-existing note in a small, focused modal —
 * the detail page's replacement for a single "Sửa" link into a full-page
 * editor. The full page (KnowledgeNoteFormPage) stays reserved for creating
 * a note and for reviewing a fresh AI draft, where every field needs to be
 * visible at once.
 */
export function KnowledgeSectionEditModal({
  note,
  targetLanguage,
  section,
  onClose,
  onSave,
}: KnowledgeSectionEditModalProps) {
  const form = useKnowledgeNoteForm({
    initial: note,
    targetLanguage,
    existingNotes: [],
    onSave: async (updated) => {
      await onSave(updated);
      onClose();
    },
  });

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-label={SECTION_LABELS[section]}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-header-title">
            <h3>{SECTION_LABELS[section]}</h3>
          </div>
          <button className="closex" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {form.error && <p role="alert">Lỗi lưu: {form.error}</p>}
          {section === "header" && (
            <>
              <TitleField form={form} />
              <SummaryField form={form} />
            </>
          )}
          {section === "explanation" && <ExplanationField form={form} />}
          {section === "patterns" && <PatternsField form={form} />}
          {section === "examples" && <ExamplesField form={form} />}
          {section === "pitfalls" && <PitfallsField form={form} />}
          {section === "metadata" && (
            <>
              <GroupField form={form} targetLanguage={targetLanguage} />
              <CefrField form={form} />
              <TagsField form={form} />
            </>
          )}
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
