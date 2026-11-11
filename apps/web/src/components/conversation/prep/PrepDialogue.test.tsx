import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PrepDialogue } from "./PrepDialogue";
import type { PrepLine, PrepPattern } from "@/lib/conversationPrepTypes";

const LINES: PrepLine[] = [
  { speaker: "partner", partnerRole: "Khách hàng", en: "How is it going?", vi: "Thế nào rồi?" },
  { speaker: "you", en: "I'd like to walk you through the plan.", vi: "" },
];
const PATTERNS: PrepPattern[] = [
  { pattern: "I'd like to walk you through ___", meaning: "m", example: "", why: [] },
];

function setup() {
  const onSpeak = vi.fn();
  const onPatternClick = vi.fn();
  render(<PrepDialogue lines={LINES} patterns={PATTERNS} onSpeak={onSpeak} onPatternClick={onPatternClick} />);
  return { onSpeak, onPatternClick };
}

describe("PrepDialogue", () => {
  it("labels speakers with the partner role and 'Bạn'", () => {
    setup();
    expect(screen.getByText("Khách hàng")).toBeInTheDocument();
    expect(screen.getByText("Bạn")).toBeInTheDocument();
  });

  it("speaks a line", () => {
    const { onSpeak } = setup();
    fireEvent.click(screen.getAllByRole("button", { name: "Nghe câu này" })[0]);
    expect(onSpeak).toHaveBeenCalledWith("How is it going?", "dialogue-0");
  });

  it("toggles the translation, and has no toggle for a line without one", () => {
    setup();
    expect(screen.queryByText("Thế nào rồi?")).not.toBeInTheDocument();
    const toggles = screen.getAllByRole("button", { name: "Dịch" });
    expect(toggles).toHaveLength(1);
    fireEvent.click(toggles[0]);
    expect(screen.getByText("Thế nào rồi?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ẩn dịch" }));
    expect(screen.queryByText("Thế nào rồi?")).not.toBeInTheDocument();
  });

  it("highlights a pattern span and reports its index on tap", () => {
    const { onPatternClick } = setup();
    const mark = screen.getByRole("button", { name: "I'd like to walk you through" });
    expect(mark).toHaveClass("prep-mark");
    expect(mark.closest("p")).toHaveTextContent("I'd like to walk you through the plan.");
    fireEvent.click(mark);
    expect(onPatternClick).toHaveBeenCalledWith(0);
  });
});
