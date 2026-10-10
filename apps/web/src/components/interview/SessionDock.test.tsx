import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SessionDock, formatClock } from "./SessionDock";
import { initialInterviewState, type InterviewState } from "@/lib/interviewMachine";

function handlers() {
  return {
    onStart: vi.fn(),
    onStop: vi.fn(),
    onSend: vi.fn(),
    onEditDraft: vi.fn(),
    onRetryTranscribe: vi.fn(),
    onSkip: vi.fn(),
    onSkipSpeech: vi.fn(),
    onReplay: vi.fn(),
    onRetryPlan: vi.fn(),
  };
}

function renderDock(patch: Partial<InterviewState>, elapsed = 0, micError = false, recording?: Blob | null) {
  const h = handlers();
  render(<SessionDock state={{ ...initialInterviewState, question: "Q", ...patch }} elapsed={elapsed} micError={micError} recording={recording} {...h} />);
  return h;
}

describe("formatClock", () => {
  it("formats m:ss", () => {
    expect(formatClock(42)).toBe("0:42");
    expect(formatClock(180)).toBe("3:00");
  });
});

describe("SessionDock", () => {
  it("warming: shows the cold-start hint, or a retry after plan failure", () => {
    renderDock({ phase: "warming" });
    expect(screen.getByText(/10–20 giây/)).toBeInTheDocument();
  });

  it("warming + plan_failed: retry", () => {
    const h = renderDock({ phase: "warming", notice: "plan_failed" });
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(h.onRetryPlan).toHaveBeenCalled();
  });

  it("speaking: can skip straight to answering", () => {
    const h = renderDock({ phase: "speaking" });
    fireEvent.click(screen.getByRole("button", { name: "Bỏ qua, trả lời luôn" }));
    expect(h.onSkipSpeech).toHaveBeenCalled();
  });

  it("idle: mic, replay, skip, and notices", () => {
    const h = renderDock({ phase: "idle", notice: "empty_transcript" }, 0, true);
    expect(screen.getByText(/Không nghe thấy gì/)).toBeInTheDocument();
    expect(screen.getByText(/Không dùng được micro/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu trả lời" }));
    fireEvent.click(screen.getByRole("button", { name: "Nghe lại câu hỏi" }));
    fireEvent.click(screen.getByRole("button", { name: "Bỏ qua câu này" }));
    expect(h.onStart).toHaveBeenCalled();
    expect(h.onReplay).toHaveBeenCalled();
    expect(h.onSkip).toHaveBeenCalled();
  });

  it("recording: timer and stop", () => {
    const h = renderDock({ phase: "recording" }, 42);
    expect(screen.getByText("0:42")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dừng ghi âm" }));
    expect(h.onStop).toHaveBeenCalled();
  });

  it("review: edit, send, re-record", () => {
    const h = renderDock({ phase: "review", draft: "My answer" });
    const box = screen.getByLabelText(/Bản chép lời/);
    expect(box).toHaveValue("My answer");
    fireEvent.change(box, { target: { value: "Fixed" } });
    expect(h.onEditDraft).toHaveBeenCalledWith("Fixed");
    fireEvent.click(screen.getByRole("button", { name: "Gửi câu trả lời" }));
    fireEvent.click(screen.getByRole("button", { name: "Thu lại" }));
    expect(h.onSend).toHaveBeenCalled();
    expect(h.onStart).toHaveBeenCalled();
  });

  it("review: send disabled for an empty draft", () => {
    renderDock({ phase: "review", draft: "  " });
    expect(screen.getByRole("button", { name: "Gửi câu trả lời" })).toBeDisabled();
  });

  it("sttError: retry keeps the recording", () => {
    const h = renderDock({ phase: "sttError" });
    expect(screen.getByRole("alert")).toHaveTextContent("Chép lời thất bại");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(h.onRetryTranscribe).toHaveBeenCalled();
  });

  it("transcribing / processing / closing show status text", () => {
    const { unmount } = render(<SessionDock state={{ ...initialInterviewState, phase: "transcribing" }} elapsed={0} micError={false} {...handlers()} />);
    expect(screen.getByText("Đang chép lời…")).toBeInTheDocument();
    unmount();
    renderDock({ phase: "processing" });
    expect(screen.getByText("Người phỏng vấn đang suy nghĩ…")).toBeInTheDocument();
  });
  describe("listen back before sending", () => {
    const listen = () => screen.queryByRole("button", { name: "Nghe lại giọng tôi" });
    const blob = new Blob(["a"]);

    it("review and sttError show the button when a recording is passed", () => {
      const { unmount } = render(
        <SessionDock state={{ ...initialInterviewState, phase: "review", draft: "x" }} elapsed={0} micError={false} recording={blob} {...handlers()} />
      );
      expect(listen()).toBeInTheDocument();
      unmount();
      renderDock({ phase: "sttError" }, 0, false, blob);
      expect(listen()).toBeInTheDocument();
    });

    it("is absent without a recording", () => {
      renderDock({ phase: "review", draft: "x" });
      expect(listen()).not.toBeInTheDocument();
    });

    it("is absent with null in review and sttError", () => {
      renderDock({ phase: "sttError" }, 0, false, null);
      expect(listen()).not.toBeInTheDocument();
    });

    it.each(["idle", "recording", "transcribing", "processing", "speaking"] as const)("is absent in %s even with a recording", (phase) => {
      renderDock({ phase }, 0, false, blob);
      expect(listen()).not.toBeInTheDocument();
    });
  });
});
