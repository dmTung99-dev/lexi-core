import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeNoteView } from "./KnowledgeNoteView";
import { noteFixture } from "./testUtils";

describe("KnowledgeNoteView", () => {
  it("renders present sections, shows placeholders for empty ones", () => {
    render(
      <KnowledgeNoteView
        note={noteFixture({ explanation: "a **b**", patterns: ["If ..."], examples: [], pitfalls: [] })}
        knownHeadwords={[]}
        targetLanguage="english"
        onDelete={() => {}}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText("Mẫu câu")).toBeInTheDocument();
    expect(screen.getByText("Lỗi thường gặp")).toBeInTheDocument();
    expect(screen.getByText("Chưa có lỗi thường gặp nào.")).toBeInTheDocument();
    expect(screen.getByText("Ví dụ")).toBeInTheDocument();
    expect(screen.getByText("Chưa có ví dụ nào.")).toBeInTheDocument();
  });

  it("shows a Mẫu pill for a starter note", () => {
    render(
      <KnowledgeNoteView
        note={noteFixture({ source: "starter" })}
        knownHeadwords={[]}
        targetLanguage="english"
        onDelete={() => {}}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText("Mẫu")).toBeInTheDocument();
  });

  it("renders examples with known-word highlighting over the translation", () => {
    render(
      <KnowledgeNoteView
        note={noteFixture({
          examples: [{ text: "I like apples.", translation: "Tôi thích táo." }],
        })}
        knownHeadwords={["apples"]}
        targetLanguage="english"
        onDelete={() => {}}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText("Ví dụ")).toBeInTheDocument();
    expect(screen.getByText("apples")).toHaveClass("known-highlight-static");
    expect(screen.getByText("Tôi thích táo.")).toBeInTheDocument();
  });

  it("asks for confirmation before calling onDelete", () => {
    const onDelete = vi.fn();
    render(
      <KnowledgeNoteView
        note={noteFixture()}
        knownHeadwords={[]}
        targetLanguage="english"
        onDelete={onDelete}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận xoá?" }));
    expect(onDelete).toHaveBeenCalled();
  });

  it("back link goes to the note's own group, labeled with the group name", () => {
    render(
      <KnowledgeNoteView
        note={noteFixture({ groupId: "en_conditionals" })}
        knownHeadwords={[]}
        targetLanguage="english"
        onDelete={() => {}}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByRole("link", { name: "← Câu điều kiện" })).toHaveAttribute(
      "href",
      "/knowledge/group/en_conditionals",
    );
  });

  it("clicking a section's edit button opens a modal scoped to just that section", () => {
    render(
      <KnowledgeNoteView
        note={noteFixture({ patterns: ["If S + V2, S + would + V"] })}
        knownHeadwords={[]}
        targetLanguage="english"
        onDelete={() => {}}
        onSave={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Sửa mẫu câu" }));

    const dialog = screen.getByRole("dialog", { name: "Sửa mẫu câu" });
    expect(dialog).toBeInTheDocument();
    expect(screen.queryByLabelText("Tiêu đề")).toBeNull();
    expect(screen.getByDisplayValue("If S + V2, S + would + V")).toBeInTheDocument();
  });

  it("saving a section modal calls onSave with the updated note and closes the modal", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <KnowledgeNoteView
        note={noteFixture({ id: "n1", title: "Câu điều kiện loại 2" })}
        knownHeadwords={[]}
        targetLanguage="english"
        onDelete={() => {}}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sửa tiêu đề & tóm tắt" }));
    fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Tiêu đề mới" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ id: "n1", title: "Tiêu đề mới" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
