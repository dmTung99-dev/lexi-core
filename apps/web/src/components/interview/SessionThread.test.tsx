import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SessionThread } from "./SessionThread";
import type { InterviewTurn } from "@/lib/interviewTypes";

const TURNS: InterviewTurn[] = [
  { mainIndex: 0, kind: "main", question: "Intro?", answer: "I am Tung.", skipped: false, answerSeconds: 5 },
  { mainIndex: 1, kind: "main", question: "Conflict?", answer: "", skipped: true, answerSeconds: 0 },
];

describe("SessionThread", () => {
  it("renders past turns, a skipped marker, and the current question", () => {
    const onReplay = vi.fn();
    const onTranslate = vi.fn();
    render(
      <SessionThread
        turns={TURNS}
        question="Project?"
        kind="main"
        showQuestion
        translation="Dự án?"
        translating={false}
        onReplay={onReplay}
        onTranslate={onTranslate}
        replayDisabled={false}
      />
    );
    expect(screen.getByText("I am Tung.")).toBeInTheDocument();
    expect(screen.getByText("(Đã bỏ qua)")).toBeInTheDocument();
    expect(screen.getByText("Câu hỏi hiện tại")).toBeInTheDocument();
    expect(screen.getByText("Project?")).toBeInTheDocument();
    expect(screen.getByText("Dự án?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nghe lại" }));
    fireEvent.click(screen.getByRole("button", { name: "Dịch sang tiếng Việt" }));
    expect(onReplay).toHaveBeenCalled();
    expect(onTranslate).toHaveBeenCalled();
  });

  it("labels a follow-up and hides the question card when showQuestion is false", () => {
    const props = { turns: [], question: "Why?", translation: null, translating: false, onReplay: vi.fn(), onTranslate: vi.fn(), replayDisabled: true };
    const { rerender } = render(<SessionThread {...props} kind="follow_up" showQuestion />);
    expect(screen.getByText("Câu hỏi thêm")).toBeInTheDocument();
    rerender(<SessionThread {...props} kind="follow_up" showQuestion={false} />);
    expect(screen.queryByText("Why?")).not.toBeInTheDocument();
  });
});
