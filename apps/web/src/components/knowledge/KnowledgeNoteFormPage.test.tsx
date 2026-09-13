import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeNoteFormPage } from "./KnowledgeNoteFormPage";
import type { KnowledgeNoteDraft } from "@/lib/knowledgeNoteSource";
import type { KnowledgeNote } from "@/lib/knowledgeNotes";

const draft: KnowledgeNoteDraft = {
  title: "Câu điều kiện loại 2",
  summary: "S",
  explanation: "E",
  patterns: [],
  examples: [],
  pitfalls: [],
  suggestedGroupId: "en_conditionals",
  suggestedCefr: "b1",
  suggestedTags: [],
  relatedNoteId: null,
};

describe("KnowledgeNoteFormPage", () => {
  it("is a plain page, not a modal — no dialog role, no backdrop", () => {
    const { container } = render(
      <KnowledgeNoteFormPage
        targetLanguage="english"
        existingNotes={[]}
        onClose={() => {}}
        onSave={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.querySelector(".modal-backdrop")).toBeNull();
  });

  it("the back link calls onClose", () => {
    const onClose = vi.fn();
    render(
      <KnowledgeNoteFormPage
        targetLanguage="english"
        existingNotes={[]}
        onClose={onClose}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "← Quay lại" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("review-draft: prefills and saves an ai note with the suggested group + sourcePrompt", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <KnowledgeNoteFormPage
        draft={draft}
        sourcePrompt="loại 2"
        targetLanguage="english"
        existingNotes={[]}
        onClose={() => {}}
        onSave={onSave}
      />,
    );
    expect(screen.getByDisplayValue("Câu điều kiện loại 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][0] as KnowledgeNote;
    expect(saved.source).toBe("ai");
    expect(saved.groupId).toBe("en_conditionals");
    expect(saved.sourcePrompt).toBe("loại 2");
  });

  it("blank-new: empty title blocks the save and shows the error", () => {
    const onSave = vi.fn();
    render(
      <KnowledgeNoteFormPage
        targetLanguage="english"
        existingNotes={[]}
        onClose={() => {}}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/Nhập tiêu đề/)).toBeInTheDocument();
  });
});
