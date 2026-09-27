import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QuestionReview, sentenceContaining } from "./QuestionReview";
import type { InterviewReportQuestion } from "@/lib/interviewTypes";

const ITEM: InterviewReportQuestion = {
  mainIndex: 1,
  score: 6,
  corrected: "We disagreed about Redux.",
  strengths: "Có ví dụ cụ thể",
  gaps: "Thiếu kết quả",
  modelAnswer: "We disagreed about Redux. Rather than debate it, I proposed a prototype.",
  phrases: [{ text: "rather than debate it", meaning: "thay vì tranh cãi" }],
};

function renderReview(patch: Partial<Parameters<typeof QuestionReview>[0]> = {}) {
  const props = {
    number: 2,
    question: "Conflict?",
    answer: "We disagree about Redux.",
    skipped: false,
    item: ITEM,
    expanded: true,
    onToggle: vi.fn(),
    onPlayModel: vi.fn(),
    savedPhrases: new Set<string>(),
    onSavePhrase: vi.fn(),
    ...patch,
  };
  render(<QuestionReview {...props} />);
  return props;
}

describe("sentenceContaining", () => {
  it("finds the sentence case-insensitively", () => {
    expect(sentenceContaining(ITEM.modelAnswer, "Rather Than debate")).toBe("Rather than debate it, I proposed a prototype.");
    expect(sentenceContaining(ITEM.modelAnswer, "missing")).toBe("");
  });
});

describe("QuestionReview", () => {
  it("shows the word diff, feedback and model answer", () => {
    const props = renderReview();
    expect(screen.getByText("disagree").tagName).toBe("DEL");
    expect(screen.getByText("disagreed").tagName).toBe("INS");
    expect(screen.getByText("Có ví dụ cụ thể")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nghe câu gợi ý" }));
    expect(props.onPlayModel).toHaveBeenCalledWith(ITEM.modelAnswer);
  });

  it("saves a phrase with its example sentence, and shows saved state", () => {
    const props = renderReview();
    fireEvent.click(screen.getByRole("button", { name: /rather than debate it/ }));
    expect(props.onSavePhrase).toHaveBeenCalledWith(ITEM.phrases[0], "Rather than debate it, I proposed a prototype.");
  });

  it("marks already-saved phrases", () => {
    renderReview({ savedPhrases: new Set(["rather than debate it"]) });
    expect(screen.getByRole("button", { name: /đã lưu/ })).toBeDisabled();
  });

  it("collapsed: only the header, toggles on click", () => {
    const props = renderReview({ expanded: false });
    expect(screen.queryByText("Có ví dụ cụ thể")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Conflict\?/ }));
    expect(props.onToggle).toHaveBeenCalled();
  });

  it("skipped and ungraded questions", () => {
    renderReview({ skipped: true, answer: "", item: undefined });
    expect(screen.getByText("(Đã bỏ qua)")).toBeInTheDocument();
  });
});
