import { describe, expect, it } from "vitest";
import {
  canFollowUp,
  initialInterviewState,
  interviewReducer,
  resumeIndex,
  type InterviewEvent,
  type InterviewState,
} from "./interviewMachine";

const PLAN = ["Q1", "Q2"];

function run(events: InterviewEvent[], from: InterviewState = initialInterviewState): InterviewState {
  return events.reduce(interviewReducer, from);
}

describe("interviewMachine", () => {
  it("starts warming and speaks the first question when the plan is ready", () => {
    const s = run([{ type: "PLAN_READY", plan: PLAN }]);
    expect(s).toMatchObject({ phase: "speaking", mainIndex: 0, question: "Q1", kind: "main" });
  });

  it("can resume from a later index, or go straight to closing", () => {
    expect(run([{ type: "PLAN_READY", plan: PLAN, startIndex: 1 }]).question).toBe("Q2");
    expect(run([{ type: "PLAN_READY", plan: PLAN, startIndex: 2 }]).phase).toBe("closing");
  });

  it("flags plan failure and clears it on retry", () => {
    const failed = run([{ type: "PLAN_FAILED" }]);
    expect(failed).toMatchObject({ phase: "warming", notice: "plan_failed" });
    expect(run([{ type: "RETRY_PLAN" }], failed).notice).toBeNull();
  });

  it("runs a turn with review", () => {
    const s = run([
      { type: "PLAN_READY", plan: PLAN },
      { type: "SPEECH_ENDED" },
      { type: "START_RECORDING" },
      { type: "STOP_RECORDING" },
      { type: "TRANSCRIBED", text: "My answer", review: true },
    ]);
    expect(s).toMatchObject({ phase: "review", draft: "My answer" });
    const edited = run([{ type: "EDIT_DRAFT", text: "My fixed answer" }, { type: "SEND" }], s);
    expect(edited).toMatchObject({ phase: "processing", draft: "My fixed answer" });
  });

  it("skips review when disabled", () => {
    const s = run([
      { type: "PLAN_READY", plan: PLAN },
      { type: "SPEECH_ENDED" },
      { type: "START_RECORDING" },
      { type: "STOP_RECORDING" },
      { type: "TRANSCRIBED", text: "x", review: false },
    ]);
    expect(s.phase).toBe("processing");
  });

  it("returns to idle with a notice on an empty transcript", () => {
    const s = run([
      { type: "PLAN_READY", plan: PLAN },
      { type: "SPEECH_ENDED" },
      { type: "START_RECORDING" },
      { type: "STOP_RECORDING" },
      { type: "TRANSCRIBED", text: "   ", review: true },
    ]);
    expect(s).toMatchObject({ phase: "idle", notice: "empty_transcript" });
  });

  it("keeps the recording for retry on STT failure", () => {
    const failed = run([
      { type: "PLAN_READY", plan: PLAN },
      { type: "SPEECH_ENDED" },
      { type: "START_RECORDING" },
      { type: "STOP_RECORDING" },
      { type: "TRANSCRIBE_FAILED" },
    ]);
    expect(failed.phase).toBe("sttError");
    expect(run([{ type: "RETRY_TRANSCRIBE" }], failed).phase).toBe("transcribing");
    expect(run([{ type: "START_RECORDING" }], failed).phase).toBe("recording");
  });

  it("allows exactly one follow-up per main question", () => {
    const processing = run([
      { type: "PLAN_READY", plan: PLAN },
      { type: "SPEECH_ENDED" },
      { type: "START_RECORDING" },
      { type: "STOP_RECORDING" },
      { type: "TRANSCRIBED", text: "a", review: false },
    ]);
    expect(canFollowUp(processing)).toBe(true);
    const followUp = run([{ type: "FOLLOW_UP", question: "Why?" }], processing);
    expect(followUp).toMatchObject({ phase: "speaking", question: "Why?", kind: "follow_up", mainIndex: 0 });
    const secondProcessing = run(
      [{ type: "SPEECH_ENDED" }, { type: "START_RECORDING" }, { type: "STOP_RECORDING" }, { type: "TRANSCRIBED", text: "b", review: false }],
      followUp
    );
    expect(canFollowUp(secondProcessing)).toBe(false);
    const next = run([{ type: "NEXT_MAIN" }], secondProcessing);
    expect(next).toMatchObject({ phase: "speaking", question: "Q2", mainIndex: 1, kind: "main", followUpUsed: false });
    expect(canFollowUp({ ...next, phase: "processing" })).toBe(true);
  });

  it("goes to closing after the last main question, then grading", () => {
    const last = run([{ type: "PLAN_READY", plan: PLAN, startIndex: 1 }, { type: "SPEECH_ENDED" }, { type: "SKIP" }]);
    expect(last.phase).toBe("closing");
    expect(run([{ type: "CLOSING_ENDED" }], last).phase).toBe("grading");
  });

  it("REPLAY from idle speaks again; END_EARLY jumps to grading", () => {
    const idle = run([{ type: "PLAN_READY", plan: PLAN }, { type: "SPEECH_ENDED", ttsFailed: true }]);
    expect(idle.notice).toBe("tts_failed");
    expect(run([{ type: "REPLAY" }], idle)).toMatchObject({ phase: "speaking", notice: null });
    expect(run([{ type: "END_EARLY" }], idle).phase).toBe("grading");
  });

  it("ignores events that are invalid for the current phase", () => {
    const idle = run([{ type: "PLAN_READY", plan: PLAN }, { type: "SPEECH_ENDED" }]);
    expect(run([{ type: "SEND" }], idle)).toBe(idle);
  });

  it("resumeIndex is one past the highest answered main index", () => {
    expect(resumeIndex([])).toBe(0);
    expect(
      resumeIndex([
        { mainIndex: 0, kind: "main", question: "", answer: "", skipped: false, answerSeconds: 0 },
        { mainIndex: 1, kind: "main", question: "", answer: "", skipped: true, answerSeconds: 0 },
      ])
    ).toBe(2);
  });
});
