import { describe, expect, it } from "vitest";
import {
  conversationReducer as reduce,
  initialConversationState as init,
  isScenarioComplete,
  joinSegments,
  replyFlags,
  type ConversationState,
} from "./conversationMachine";

const at = (patch: Partial<ConversationState>): ConversationState => ({ ...init, ...patch });

describe("joinSegments", () => {
  it("trims and joins non-empty parts", () => {
    expect(joinSegments([" a ", "", "b"], " c ")).toBe("a b c");
    expect(joinSegments([], "  ")).toBe("");
  });
});

describe("replyFlags", () => {
  it("offers wrap-up only in topic mode exactly at turn 12", () => {
    expect(replyFlags("topic", 11).offerEnd).toBe(false);
    expect(replyFlags("topic", 12).offerEnd).toBe(true);
    expect(replyFlags("topic", 13).offerEnd).toBe(false);
    expect(replyFlags("roleplay", 12).offerEnd).toBe(false);
  });
  it("must close from turn 30 in both modes", () => {
    expect(replyFlags("topic", 29).mustClose).toBe(false);
    expect(replyFlags("topic", 30).mustClose).toBe(true);
    expect(replyFlags("roleplay", 30).mustClose).toBe(true);
  });
});

describe("isScenarioComplete", () => {
  it("is true only when every goal index is done", () => {
    expect(isScenarioComplete(["a", "b"], [0])).toBe(false);
    expect(isScenarioComplete(["a", "b"], [0, 1])).toBe(true);
    expect(isScenarioComplete([], [])).toBe(false);
  });
});

describe("opening", () => {
  it("warming -> aiSpeaking on OPENING_READY; failure sets a notice and retry clears it", () => {
    expect(reduce(init, { type: "OPENING_READY" }).phase).toBe("aiSpeaking");
    const failed = reduce(init, { type: "OPENING_FAILED" });
    expect(failed.phase).toBe("warming");
    expect(failed.notice).toBe("opening_failed");
    expect(reduce(failed, { type: "RETRY_OPENING" }).notice).toBeNull();
  });
  it("resumes to idle, or straight to aiThinking when the last message was the user's", () => {
    expect(reduce(init, { type: "RESUME", userTurns: 3, needsReply: false })).toMatchObject({ phase: "idle", userTurns: 3 });
    expect(reduce(init, { type: "RESUME", userTurns: 3, needsReply: true })).toMatchObject({ phase: "aiThinking", userTurns: 3 });
  });
});

describe("speech", () => {
  it("aiSpeaking -> idle, noting a TTS failure", () => {
    expect(reduce(at({ phase: "aiSpeaking" }), { type: "SPEECH_ENDED" })).toMatchObject({ phase: "idle", notice: null });
    expect(reduce(at({ phase: "aiSpeaking" }), { type: "SPEECH_ENDED", ttsFailed: true }).notice).toBe("tts_failed");
  });
  it("goes to grading after the final AI line", () => {
    expect(reduce(at({ phase: "aiSpeaking", final: true }), { type: "SPEECH_ENDED" }).phase).toBe("grading");
  });
});

describe("typing and sending", () => {
  it("edits the draft in idle and review only", () => {
    expect(reduce(at({ phase: "idle" }), { type: "EDIT_DRAFT", text: "hi" }).draft).toBe("hi");
    expect(reduce(at({ phase: "review" }), { type: "EDIT_DRAFT", text: "hi" }).draft).toBe("hi");
    expect(reduce(at({ phase: "aiThinking" }), { type: "EDIT_DRAFT", text: "hi" }).draft).toBe("");
  });
  it("SEND moves to aiThinking, counts the turn and clears the composer", () => {
    const next = reduce(at({ phase: "idle", segments: ["a"], draft: "b", userTurns: 2 }), { type: "SEND" });
    expect(next).toMatchObject({ phase: "aiThinking", userTurns: 3, segments: [], draft: "" });
  });
  it("SEND is ignored when there is nothing to send or the phase is wrong", () => {
    expect(reduce(at({ phase: "idle", draft: "  " }), { type: "SEND" }).phase).toBe("idle");
    expect(reduce(at({ phase: "aiThinking", draft: "x" }), { type: "SEND" }).phase).toBe("aiThinking");
  });
});

describe("+ Nói thêm (ADD_SEGMENT)", () => {
  it("moves the draft into segments and returns to idle", () => {
    const next = reduce(at({ phase: "review", draft: " one ", segments: [] }), { type: "ADD_SEGMENT" });
    expect(next).toMatchObject({ phase: "idle", segments: ["one"], draft: "" });
  });
  it("ignores an empty draft", () => {
    expect(reduce(at({ phase: "idle", draft: " " }), { type: "ADD_SEGMENT" }).segments).toEqual([]);
  });
});

describe("recording and transcription", () => {
  it("START_RECORDING from idle keeps a typed draft as a segment", () => {
    const next = reduce(at({ phase: "idle", draft: "typed" }), { type: "START_RECORDING" });
    expect(next).toMatchObject({ phase: "recording", segments: ["typed"], draft: "" });
  });
  it("START_RECORDING from review discards the draft (re-record) but keeps segments", () => {
    const next = reduce(at({ phase: "review", draft: "bad", segments: ["kept"] }), { type: "START_RECORDING" });
    expect(next).toMatchObject({ phase: "recording", segments: ["kept"], draft: "" });
  });
  it("recording -> transcribing -> review with a draft when review is on", () => {
    const t = reduce(at({ phase: "recording" }), { type: "STOP_RECORDING" });
    expect(t.phase).toBe("transcribing");
    expect(reduce(t, { type: "TRANSCRIBED", text: " hello ", review: true })).toMatchObject({ phase: "review", draft: "hello" });
  });
  it("sends straight to the AI when review is off", () => {
    const next = reduce(at({ phase: "transcribing", userTurns: 1, segments: ["a"] }), { type: "TRANSCRIBED", text: "b", review: false });
    expect(next).toMatchObject({ phase: "aiThinking", userTurns: 2, segments: [], draft: "" });
  });
  it("an empty transcript returns to idle with a notice", () => {
    expect(reduce(at({ phase: "transcribing" }), { type: "TRANSCRIBED", text: " ", review: true })).toMatchObject({
      phase: "idle", notice: "empty_transcript",
    });
  });
  it("STT failure can be retried", () => {
    const failed = reduce(at({ phase: "transcribing" }), { type: "TRANSCRIBE_FAILED" });
    expect(failed.phase).toBe("sttError");
    expect(reduce(failed, { type: "RETRY_TRANSCRIBE" }).phase).toBe("transcribing");
  });
});

describe("AI reply", () => {
  it("aiThinking -> aiSpeaking, recording final and the wrap-up offer", () => {
    const next = reduce(at({ phase: "aiThinking" }), { type: "REPLY_RECEIVED", final: false, suggestEnd: true });
    expect(next).toMatchObject({ phase: "aiSpeaking", final: false, wrapUpOffered: true });
    expect(reduce(at({ phase: "aiThinking" }), { type: "REPLY_RECEIVED", final: true, suggestEnd: false }).final).toBe(true);
  });
  it("a failed reply can be retried; the wrap-up chip can be dismissed", () => {
    const failed = reduce(at({ phase: "aiThinking" }), { type: "REPLY_FAILED" });
    expect(failed.phase).toBe("replyError");
    expect(reduce(failed, { type: "RETRY_REPLY" }).phase).toBe("aiThinking");
    expect(reduce(at({ wrapUpOffered: true }), { type: "DISMISS_WRAP_UP" }).wrapUpOffered).toBe(false);
  });
});

describe("END", () => {
  it("goes to grading from any phase and is idempotent", () => {
    for (const phase of ["warming", "idle", "recording", "review", "aiThinking", "replyError", "aiSpeaking"] as const) {
      expect(reduce(at({ phase }), { type: "END" }).phase).toBe("grading");
    }
    const grading = at({ phase: "grading" });
    expect(reduce(grading, { type: "END" })).toBe(grading);
  });
});
