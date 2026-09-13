"use client";

import type { CefrLevel } from "@/lib/knowledgeNotes";
import type { KnowledgeNoteFormState } from "@/lib/useKnowledgeNoteForm";
import { knowledgeGroupLabel, knowledgeGroupsFor } from "@/lib/knowledgeGroups";
import type { TargetLanguage } from "@/lib/languages";
import { SimpleDropdown, type SimpleDropdownOption } from "@/components/shared/SimpleDropdown";

interface KnowledgeNoteFormFieldsProps {
  form: KnowledgeNoteFormState;
  targetLanguage: TargetLanguage;
}

interface FieldProps {
  form: KnowledgeNoteFormState;
}

const CEFR_LEVELS: CefrLevel[] = ["a1", "a2", "b1", "b2", "c1", "c2"];
const NO_CEFR = "";
const NO_GROUP = "";

const CEFR_OPTIONS: SimpleDropdownOption<string>[] = [
  { value: NO_CEFR, label: "Không đặt" },
  ...CEFR_LEVELS.map((level) => ({ value: level, label: level.toUpperCase() })),
];

/**
 * Individual fields, exported separately so KnowledgeSectionEditModal can
 * render just one field/group of fields per section, while
 * KnowledgeNoteFormFields below composes all of them for the full create
 * form and the AI-draft review page.
 */
export function TitleField({ form }: FieldProps) {
  return (
    <label className="modal-field">
      <span>Tiêu đề</span>
      <input value={form.title} onChange={(e) => form.setTitle(e.target.value)} />
    </label>
  );
}

export function SummaryField({ form }: FieldProps) {
  return (
    <label className="modal-field knowledge-field-summary">
      <span>Tóm tắt</span>
      <textarea value={form.summary} onChange={(e) => form.setSummary(e.target.value)} />
    </label>
  );
}

export function ExplanationField({ form }: FieldProps) {
  return (
    <label className="modal-field knowledge-field-explanation">
      <span>Giải thích</span>
      <textarea value={form.explanation} onChange={(e) => form.setExplanation(e.target.value)} />
      <span className="modal-hint">bọc **...** để in đậm</span>
    </label>
  );
}

export function PatternsField({ form }: FieldProps) {
  return (
    <div className="modal-field">
      <span>Mẫu câu</span>
      {form.patterns.map((p, i) => (
        <div className="modal-example-row" key={i}>
          <textarea rows={2} value={p} onChange={(e) => form.updatePattern(i, e.target.value)} />
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
}

export function ExamplesField({ form }: FieldProps) {
  return (
    <div className="modal-field">
      <span>Ví dụ</span>
      {form.examples.map((ex, i) => (
        <div className="modal-example-row" key={i}>
          <textarea
            rows={2}
            value={ex.text}
            placeholder="Câu ví dụ"
            onChange={(e) => form.updateExampleText(i, e.target.value)}
          />
          <textarea
            rows={2}
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
}

export function PitfallsField({ form }: FieldProps) {
  return (
    <div className="modal-field">
      <span>Lỗi thường gặp</span>
      {form.pitfalls.map((p, i) => (
        <div className="modal-example-row" key={i}>
          <textarea rows={2} value={p} onChange={(e) => form.updatePitfall(i, e.target.value)} />
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
}

export function GroupField({ form, targetLanguage }: FieldProps & { targetLanguage: TargetLanguage }) {
  const groupOptions: SimpleDropdownOption<string>[] = knowledgeGroupsFor(targetLanguage).map((g) => ({
    value: g.id,
    label: g.label,
  }));

  return (
    <div className="modal-field">
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
}

export function CefrField({ form }: FieldProps) {
  return (
    <div className="modal-field">
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
}

export function TagsField({ form }: FieldProps) {
  return (
    <div className="modal-field">
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
}

/**
 * The full form's fields, laid out in two columns by KnowledgeNoteFormPage:
 * prose (title/summary/explanation/pitfalls) on the left, reference
 * material + metadata (patterns/examples/group/CEFR/tags) on the right —
 * mirrors KnowledgeNoteView's detail layout.
 */
export function KnowledgeNoteFormFields({ form, targetLanguage }: KnowledgeNoteFormFieldsProps) {
  return (
    <div className="knowledge-detail-columns">
      <div className="knowledge-detail-col">
        <TitleField form={form} />
        <SummaryField form={form} />
        <ExplanationField form={form} />
        <PitfallsField form={form} />
      </div>
      <div className="knowledge-detail-col">
        <PatternsField form={form} />
        <ExamplesField form={form} />
        <GroupField form={form} targetLanguage={targetLanguage} />
        <CefrField form={form} />
        <TagsField form={form} />
      </div>
    </div>
  );
}
