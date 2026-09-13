"use client";

import { useState } from "react";
import type { CefrLevel, KnowledgeExample, KnowledgeNote } from "./knowledgeNotes";
import type { KnowledgeNoteDraft } from "./knowledgeNoteSource";
import type { TargetLanguage } from "./languages";

export interface UseKnowledgeNoteFormArgs {
  initial?: KnowledgeNote | null;
  draft?: KnowledgeNoteDraft | null;
  overwriteNoteId?: string | null;
  sourcePrompt?: string | null;
  targetLanguage: TargetLanguage;
  existingNotes: KnowledgeNote[];
  onSave: (note: KnowledgeNote) => Promise<void>;
}

/**
 * All state + save logic for the write/edit/review-draft form, used by
 * KnowledgeNoteFormPage (the full-page create screen and the "ready"
 * review-draft step of "Nhờ AI soạn") and by KnowledgeSectionEditModal
 * (editing one section of an existing note). Exactly one of
 * `initial` / `draft` is expected; the save formula (id/source/createdAt)
 * is the carried-forward Flutter whole-branch fix: "existing ?? initial"
 * (don't lose origin/createdAt if the notes list hasn't loaded yet) and
 * "Bổ sung keeps source unless starter".
 */
export function useKnowledgeNoteForm({
  initial,
  draft,
  overwriteNoteId,
  sourcePrompt,
  targetLanguage,
  existingNotes,
  onSave,
}: UseKnowledgeNoteFormArgs) {
  const [title, setTitle] = useState(initial?.title ?? draft?.title ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? draft?.summary ?? "");
  const [explanation, setExplanation] = useState(initial?.explanation ?? draft?.explanation ?? "");
  const [patterns, setPatterns] = useState<string[]>(initial?.patterns ?? draft?.patterns ?? []);
  const [examples, setExamples] = useState<KnowledgeExample[]>(
    initial?.examples ?? draft?.examples ?? [],
  );
  const [pitfalls, setPitfalls] = useState<string[]>(initial?.pitfalls ?? draft?.pitfalls ?? []);
  const [groupId, setGroupId] = useState<string | null>(
    initial?.groupId ?? draft?.suggestedGroupId ?? null,
  );
  const [cefrLevel, setCefrLevel] = useState<CefrLevel | null>(
    initial?.cefrLevel ?? draft?.suggestedCefr ?? null,
  );
  const [tags, setTags] = useState<string[]>(initial?.tags ?? draft?.suggestedTags ?? []);
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addPattern = () => setPatterns((prev) => [...prev, ""]);
  const updatePattern = (index: number, value: string) =>
    setPatterns((prev) => prev.map((p, i) => (i === index ? value : p)));
  const removePattern = (index: number) =>
    setPatterns((prev) => prev.filter((_, i) => i !== index));

  const addPitfall = () => setPitfalls((prev) => [...prev, ""]);
  const updatePitfall = (index: number, value: string) =>
    setPitfalls((prev) => prev.map((p, i) => (i === index ? value : p)));
  const removePitfall = (index: number) =>
    setPitfalls((prev) => prev.filter((_, i) => i !== index));

  const addExample = () => setExamples((prev) => [...prev, { text: "", translation: "" }]);
  const updateExampleText = (index: number, value: string) =>
    setExamples((prev) => prev.map((ex, i) => (i === index ? { ...ex, text: value } : ex)));
  const updateExampleTranslation = (index: number, value: string) =>
    setExamples((prev) => prev.map((ex, i) => (i === index ? { ...ex, translation: value } : ex)));
  const removeExample = (index: number) =>
    setExamples((prev) => prev.filter((_, i) => i !== index));

  const addTag = () => {
    const trimmed = newTag.trim();
    if (trimmed.length === 0 || tags.includes(trimmed)) {
      setNewTag("");
      return;
    }
    setTags((prev) => [...prev, trimmed]);
    setNewTag("");
  };
  const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag));

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      setError("Nhập tiêu đề cho ghi chú.");
      return;
    }
    if (groupId === null) {
      setError("Chọn một nhóm.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const targetId = overwriteNoteId ?? initial?.id;
      const existing = existingNotes.find((n) => n.id === targetId) ?? initial ?? null;
      const source = draft
        ? existing === null || existing.source === "starter"
          ? "ai"
          : existing.source
        : (existing?.source ?? "manual");
      const now = new Date().toISOString();
      const note: KnowledgeNote = {
        id: overwriteNoteId ?? initial?.id ?? crypto.randomUUID(),
        title: trimmedTitle,
        summary: summary.trim(),
        explanation: explanation.trim(),
        patterns: patterns.map((p) => p.trim()).filter((p) => p.length > 0),
        examples: examples
          .map((ex) => ({ text: ex.text.trim(), translation: ex.translation.trim() }))
          .filter((ex) => ex.text.length > 0 || ex.translation.length > 0),
        pitfalls: pitfalls.map((p) => p.trim()).filter((p) => p.length > 0),
        groupId,
        tags,
        cefrLevel,
        targetLanguage,
        source,
        sourcePrompt: sourcePrompt ?? existing?.sourcePrompt ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await onSave(note);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return {
    title,
    setTitle,
    summary,
    setSummary,
    explanation,
    setExplanation,
    patterns,
    addPattern,
    updatePattern,
    removePattern,
    examples,
    addExample,
    updateExampleText,
    updateExampleTranslation,
    removeExample,
    pitfalls,
    addPitfall,
    updatePitfall,
    removePitfall,
    groupId,
    setGroupId,
    cefrLevel,
    setCefrLevel,
    tags,
    newTag,
    setNewTag,
    addTag,
    removeTag,
    saving,
    error,
    handleSave,
  };
}

export type KnowledgeNoteFormState = ReturnType<typeof useKnowledgeNoteForm>;
