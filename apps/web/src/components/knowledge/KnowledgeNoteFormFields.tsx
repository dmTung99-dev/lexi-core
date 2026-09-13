"use client";

import type { CefrLevel } from "@/lib/knowledgeNotes";
import type { KnowledgeNoteFormState } from "@/lib/useKnowledgeNoteForm";
import { knowledgeGroupLabel, knowledgeGroupsFor } from "@/lib/knowledgeGroups";
import type { TargetLanguage } from "@/lib/languages";
import { SimpleDropdown, type SimpleDropdownOption } from "@/components/shared/SimpleDropdown";

interface KnowledgeNoteFormFieldsProps {
  form: KnowledgeNoteFormState;
  targetLanguage: TargetLanguage;
  /** Two-column layout (full-page create/edit) instead of one flat stack (modal). */
  twoColumn?: boolean;
}

const CEFR_LEVELS: CefrLevel[] = ["a1", "a2", "b1", "b2", "c1", "c2"];
const NO_CEFR = "";
const NO_GROUP = "";

const CEFR_OPTIONS: SimpleDropdownOption<string>[] = [
  { value: NO_CEFR, label: "Không đặt" },
  ...CEFR_LEVELS.map((level) => ({ value: level, label: level.toUpperCase() })),
];

/**
 * The form's fields, shared by the modal (single flat column) and the
 * full-page create/edit screens (two columns: prose on the left, reference
 * material + metadata on the right — mirrors KnowledgeNoteView's layout).
 */
export function KnowledgeNoteFormFields({ form, targetLanguage, twoColumn }: KnowledgeNoteFormFieldsProps) {
  const groupOptions: SimpleDropdownOption<string>[] = knowledgeGroupsFor(targetLanguage).map((g) => ({
    value: g.id,
    label: g.label,
  }));

  const titleField = (
    <label className="modal-field" key="title">
      <span>Tiêu đề</span>
      <input value={form.title} onChange={(e) => form.setTitle(e.target.value)} />
    </label>
  );

  const summaryField = (
    <label className="modal-field" key="summary">
      <span>Tóm tắt</span>
      <textarea value={form.summary} onChange={(e) => form.setSummary(e.target.value)} />
    </label>
  );

  const explanationField = (
    <label className="modal-field" key="explanation">
      <span>Giải thích</span>
      <textarea value={form.explanation} onChange={(e) => form.setExplanation(e.target.value)} />
      <span className="modal-hint">bọc **...** để in đậm</span>
    </label>
  );

  const patternsField = (
    <div className="modal-field" key="patterns">
      <span>Mẫu câu</span>
      {form.patterns.map((p, i) => (
        <div className="modal-example-row" key={i}>
          <input value={p} onChange={(e) => form.updatePattern(i, e.target.value)} />
          <button
            type="button"
            className="closex"
            onClick={() => form.removePattern(i)}
            aria-label="Xoá mẫu câu"
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="link-btn" onClick={form.addPattern}>
        + Thêm mẫu câu
      </button>
    </div>
  );

  const examplesField = (
    <div className="modal-field" key="examples">
      <span>Ví dụ</span>
      {form.examples.map((ex, i) => (
        <div className="modal-example-row" key={i}>
          <input
            value={ex.text}
            placeholder="Câu ví dụ"
            onChange={(e) => form.updateExampleText(i, e.target.value)}
          />
          <input
            value={ex.translation}
            placeholder="Bản dịch"
            onChange={(e) => form.updateExampleTranslation(i, e.target.value)}
          />
          <button
            type="button"
            className="closex"
            onClick={() => form.removeExample(i)}
            aria-label="Xoá ví dụ"
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="link-btn" onClick={form.addExample}>
        + Thêm ví dụ
      </button>
    </div>
  );

  const pitfallsField = (
    <div className="modal-field" key="pitfalls">
      <span>Lỗi thường gặp</span>
      {form.pitfalls.map((p, i) => (
        <div className="modal-example-row" key={i}>
          <input value={p} onChange={(e) => form.updatePitfall(i, e.target.value)} />
          <button
            type="button"
            className="closex"
            onClick={() => form.removePitfall(i)}
            aria-label="Xoá lỗi thường gặp"
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="link-btn" onClick={form.addPitfall}>
        + Thêm lỗi thường gặp
      </button>
    </div>
  );

  const groupField = (
    <div className="modal-field" key="group">
      <span>Nhóm</span>
      <SimpleDropdown
        ariaLabel="Nhóm"
        triggerLabel={form.groupId ? knowledgeGroupLabel(form.groupId) : "Chọn nhóm"}
        options={groupOptions}
        value={form.groupId ?? NO_GROUP}
        onChange={(v) => form.setGroupId(v)}
        active={form.groupId !== null}
      />
    </div>
  );

  const cefrField = (
    <div className="modal-field" key="cefr">
      <span>Cấp độ CEFR</span>
      <SimpleDropdown
        ariaLabel="Cấp độ CEFR"
        triggerLabel={form.cefrLevel ? form.cefrLevel.toUpperCase() : "Không đặt"}
        options={CEFR_OPTIONS}
        value={form.cefrLevel ?? NO_CEFR}
        onChange={(v) => form.setCefrLevel(v === NO_CEFR ? null : (v as CefrLevel))}
        active={form.cefrLevel !== null}
      />
    </div>
  );

  const tagsField = (
    <div className="modal-field" key="tags">
      <span>Thẻ</span>
      <div className="chip-row">
        {form.tags.map((tag) => (
          <button type="button" key={tag} className="vb-chip active" onClick={() => form.removeTag(tag)}>
            {tag} ✕
          </button>
        ))}
      </div>
      <div className="modal-example-row">
        <input
          value={form.newTag}
          onChange={(e) => form.setNewTag(e.target.value)}
          placeholder="Thêm thẻ"
        />
        <button type="button" className="link-btn" onClick={form.addTag}>
          Thêm
        </button>
      </div>
    </div>
  );

  if (!twoColumn) {
    return (
      <>
        {titleField}
        {summaryField}
        {explanationField}
        {patternsField}
        {examplesField}
        {pitfallsField}
        {groupField}
        {cefrField}
        {tagsField}
      </>
    );
  }

  return (
    <div className="knowledge-detail-columns">
      <div className="knowledge-detail-col">
        {titleField}
        {summaryField}
        {explanationField}
        {pitfallsField}
      </div>
      <div className="knowledge-detail-col">
        {patternsField}
        {examplesField}
        {groupField}
        {cefrField}
        {tagsField}
      </div>
    </div>
  );
}
