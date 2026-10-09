import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Composer } from "./Composer";
import { initialConversationState, type ConversationState } from "@/lib/conversationMachine";

function renderComposer(patch: Partial<ConversationState>, extra: Partial<Parameters<typeof Composer>[0]> = {}) {
  const h = {
    onEditDraft: vi.fn(), onSend: vi.fn(), onAddSegment: vi.fn(), onStart: vi.fn(), onStop: vi.fn(),
    onRetryTranscribe: vi.fn(), onSuggest: vi.fn(), onPickSuggestion: vi.fn(), onCloseSuggestions: vi.fn(),
    onRetryReply: vi.fn(), onRetryOpening: vi.fn(), onSkipSpeech: vi.fn(),
    onCancelRecording: vi.fn(), onDismissSttError: vi.fn(),
  };
  render(
    <Composer state={{ ...initialConversationState, ...patch }} elapsed={0} micError={false} suggestions={null} suggesting={false} {...h} {...extra} />
  );
  return h;
}

describe("Composer", () => {
  it("warming shows the cold-start hint, or a retry after the opening failed", () => {
    renderComposer({ phase: "warming" });
    expect(screen.getByText(/10–20 giây/)).toBeInTheDocument();
  });
  it("warming + opening_failed: retry", () => {
    const h = renderComposer({ phase: "warming", notice: "opening_failed" }, { openingError: "Lỗi AI" });
    expect(screen.getByText("Lỗi AI")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(h.onRetryOpening).toHaveBeenCalled();
  });
  it("aiSpeaking: can skip straight to answering", () => {
    const h = renderComposer({ phase: "aiSpeaking" });
    fireEvent.click(screen.getByRole("button", { name: "Bỏ qua, trả lời luôn" }));
    expect(h.onSkipSpeech).toHaveBeenCalled();
  });
  it("idle: typing, send, mic, add-segment and suggest", () => {
    const h = renderComposer({ phase: "idle", draft: "hello" });
    fireEvent.change(screen.getByLabelText("Câu trả lời của bạn"), { target: { value: "hello!" } });
    expect(h.onEditDraft).toHaveBeenCalledWith("hello!");
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu ghi âm" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Nói thêm" }));
    fireEvent.click(screen.getByRole("button", { name: "Gợi ý cách nói" }));
    expect(h.onSend).toHaveBeenCalled();
    expect(h.onStart).toHaveBeenCalled();
    expect(h.onAddSegment).toHaveBeenCalled();
    expect(h.onSuggest).toHaveBeenCalled();
  });
  it("idle with nothing to send disables Send and + Nói thêm", () => {
    renderComposer({ phase: "idle" });
    expect(screen.getByRole("button", { name: "Gửi" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "+ Nói thêm" })).toBeDisabled();
  });
  it("shows earlier segments and enables Send from segments alone", () => {
    renderComposer({ phase: "idle", segments: ["first part"] });
    expect(screen.getByText("first part")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi" })).toBeEnabled();
  });
  it("review: shows the Whisper caution", () => {
    renderComposer({ phase: "review", draft: "hi" });
    expect(screen.getByText(/đừng sửa lỗi ngữ pháp/)).toBeInTheDocument();
  });
  it("recording: shows the clock and stops", () => {
    const h = renderComposer({ phase: "recording" }, { elapsed: 42 });
    expect(screen.getByText("0:42")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dừng ghi âm" }));
    expect(h.onStop).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Hủy ghi âm" }));
    expect(h.onCancelRecording).toHaveBeenCalled();
  });
  it("sttError: retry, re-record, or give up on voice and type instead", () => {
    const h = renderComposer({ phase: "sttError" });
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    fireEvent.click(screen.getByRole("button", { name: "Thu lại" }));
    fireEvent.click(screen.getByRole("button", { name: "Gõ thay vì nói" }));
    expect(h.onRetryTranscribe).toHaveBeenCalled();
    expect(h.onStart).toHaveBeenCalled();
    expect(h.onDismissSttError).toHaveBeenCalled();
  });
  it("replyError: retry keeps the user's message", () => {
    const h = renderComposer({ phase: "replyError" });
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(h.onRetryReply).toHaveBeenCalled();
  });
  it("notices: empty transcript and TTS failure", () => {
    renderComposer({ phase: "idle", notice: "empty_transcript" });
    expect(screen.getByText(/Không nghe thấy gì/)).toBeInTheDocument();
  });
  it("suggestions: listing, picking and closing", () => {
    const h = renderComposer({ phase: "idle" }, { suggestions: ["Option one", "Option two"] });
    fireEvent.click(screen.getByRole("button", { name: "Option two" }));
    expect(h.onPickSuggestion).toHaveBeenCalledWith("Option two");
    fireEvent.click(screen.getByRole("button", { name: "Đóng gợi ý" }));
    expect(h.onCloseSuggestions).toHaveBeenCalled();
  });
  it("aiThinking and grading show status text only", () => {
    renderComposer({ phase: "aiThinking" });
    expect(screen.getByText("AI đang suy nghĩ…")).toBeInTheDocument();
  });
});
