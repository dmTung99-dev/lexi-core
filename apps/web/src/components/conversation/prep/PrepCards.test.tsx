import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PrepPatternCard } from "./PrepPatternCard";
import { PrepVocabList } from "./PrepVocabList";
import { RecentPreps } from "./RecentPreps";
import type { ConversationPrep } from "@/lib/conversationPrepTypes";

afterEach(() => vi.restoreAllMocks());

const PATTERN = {
  pattern: "I'd like to walk you through ___",
  meaning: "Dẫn dắt từng bước.",
  example: "I'd like to walk you through the plan.",
  why: [{ part: "I'd like to", reason: "Lịch sự hơn." }],
};

describe("PrepPatternCard", () => {
  it("shows frame, meaning and example; why is collapsed until toggled", () => {
    const onSpeak = vi.fn();
    const { container } = render(<PrepPatternCard pattern={PATTERN} index={2} ringed={false} onSpeak={onSpeak} />);
    expect(container.querySelector("#prep-pattern-2")).not.toBeNull();
    expect(screen.getByText("I'd like to walk you through ___")).toBeInTheDocument();
    expect(screen.getByText("Dẫn dắt từng bước.")).toBeInTheDocument();
    expect(screen.queryByText(/Lịch sự hơn\./)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tại sao?" }));
    expect(screen.getByText(/Lịch sự hơn\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ẩn giải thích" }));
    expect(screen.queryByText(/Lịch sự hơn\./)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nghe ví dụ" }));
    expect(onSpeak).toHaveBeenCalledWith("I'd like to walk you through the plan.", "pattern-2");
  });

  it("hides the why toggle and example row when empty, and marks the ringed card", () => {
    const { container } = render(
      <PrepPatternCard pattern={{ ...PATTERN, example: "", why: [] }} index={0} ringed onSpeak={vi.fn()} />
    );
    expect(screen.queryByRole("button", { name: "Tại sao?" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nghe ví dụ" })).not.toBeInTheDocument();
    expect(container.querySelector(".prep-pattern")).toHaveClass("prep-pattern-ringed");
  });
});

describe("PrepVocabList", () => {
  const ITEMS = [
    { text: "behind schedule", meaning: "chậm tiến độ", example: "We're behind schedule." },
    { text: "a heads-up", meaning: "lời báo trước", example: "" },
  ];

  it("saves an unsaved item, shows saved ones, and speaks the text", () => {
    const onSave = vi.fn();
    const onSpeak = vi.fn();
    render(<PrepVocabList items={ITEMS} saved={new Set(["behind schedule"])} onSave={onSave} onSpeak={onSpeak} />);
    expect(screen.getByText("Đã lưu")).toBeInTheDocument();
    expect(screen.getByText("We're behind schedule.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lưu a heads-up" }));
    expect(onSave).toHaveBeenCalledWith(ITEMS[1]);
    fireEvent.click(screen.getByRole("button", { name: "Nghe behind schedule" }));
    expect(onSpeak).toHaveBeenCalledWith("behind schedule", "vocab-0");
  });

  it("shows a busy speaker and a busy Lưu while their requests run", () => {
    render(
      <PrepVocabList
        items={ITEMS}
        saved={new Set()}
        savingText="a heads-up"
        saveDisabled
        onSave={vi.fn()}
        onSpeak={vi.fn()}
        speakingKey="vocab-0"
      />
    );
    expect(screen.getByRole("button", { name: "Nghe behind schedule" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Nghe a heads-up" })).toHaveAttribute("aria-busy", "false");
    const saving = screen.getByRole("button", { name: "Lưu a heads-up" });
    expect(saving).toHaveAttribute("aria-busy", "true");
    expect(saving).toBeDisabled();
    expect(screen.getByRole("button", { name: "Lưu behind schedule" })).toBeDisabled();
  });
});

describe("RecentPreps", () => {
  const PREPS = [
    { id: "p1", title: "Báo cáo trễ tiến độ", level: "B1", createdAt: "2026-11-03T08:00:00.000Z" },
  ] as ConversationPrep[];

  it("links each kit and deletes after confirmation", () => {
    const onDelete = vi.fn();
    render(<RecentPreps preps={PREPS} onDelete={onDelete} />);
    expect(screen.getByRole("link", { name: /Báo cáo trễ tiến độ/ })).toHaveAttribute("href", "/conversation/prep/p1");
    expect(screen.getByText("B1 · 03/11")).toBeInTheDocument();
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Xoá Báo cáo trễ tiến độ" }));
    expect(onDelete).not.toHaveBeenCalled();
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Xoá Báo cáo trễ tiến độ" }));
    expect(onDelete).toHaveBeenCalledWith("p1");
  });

  it("shows an empty state", () => {
    render(<RecentPreps preps={[]} onDelete={vi.fn()} />);
    expect(screen.getByText("Chưa có bộ tài liệu nào.")).toBeInTheDocument();
  });
});
