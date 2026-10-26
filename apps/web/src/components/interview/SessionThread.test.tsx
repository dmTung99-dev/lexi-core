import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SessionThread } from "./SessionThread";
import type { InterviewTurn } from "@/lib/interviewTypes";
import { clearRecordings, saveRecordings } from "@/lib/recordedAudioStore";

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

  it("offers 'Nghe lại giọng tôi' on answered turns that have a recording", () => {
    saveRecordings("interview:s1:0", [new Blob(["a"])]);
    saveRecordings("interview:s1:1", [new Blob(["b"])]); // skipped turn: never shown
    try {
      render(
        <SessionThread
          turns={TURNS}
          question=""
          kind="main"
          showQuestion={false}
          translation={null}
          translating={false}
          onReplay={vi.fn()}
          onTranslate={vi.fn()}
          replayDisabled={false}
          recordingKeyFor={(i) => `interview:s1:${i}`}
        />
      );
      expect(screen.getAllByRole("button", { name: "Nghe lại giọng tôi" })).toHaveLength(1);
    } finally {
      clearRecordings("");
    }
  });
});

describe("SessionThread auto-scroll", () => {
  const original = Element.prototype.scrollIntoView;
  afterEach(() => {
    Element.prototype.scrollIntoView = original;
  });

  const base = {
    question: "Project?",
    kind: "main" as const,
    showQuestion: true,
    translation: null,
    translating: false,
    onReplay: vi.fn(),
    onTranslate: vi.fn(),
    replayDisabled: false,
  };

  it("renders an aria-hidden sentinel as the last child and scrolls when a turn is added", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { container, rerender } = render(<SessionThread {...base} turns={TURNS.slice(0, 1)} />);
    const thread = container.querySelector(".iv-thread") as HTMLElement;
    const last = thread.lastElementChild as HTMLElement;
    expect(last.getAttribute("aria-hidden")).toBe("true");
    expect(last.textContent).toBe("");
    scrollIntoView.mockClear();
    rerender(<SessionThread {...base} turns={TURNS} />);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(thread.lastElementChild);
  });

  it("scrolls when the current question's translation appears", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { rerender } = render(<SessionThread {...base} turns={TURNS} />);
    scrollIntoView.mockClear();
    rerender(<SessionThread {...base} turns={TURNS} translation="Dự án?" />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("does not scroll on an unrelated re-render", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { rerender } = render(<SessionThread {...base} turns={TURNS} />);
    scrollIntoView.mockClear();
    rerender(<SessionThread {...base} turns={TURNS} translating />);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
