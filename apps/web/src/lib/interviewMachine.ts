import type { InterviewPlanItem, InterviewTurn } from "./interviewTypes";

export type InterviewPhase =
  | "warming"
  | "speaking"
  | "idle"
  | "recording"
  | "transcribing"
  | "sttError"
  | "review"
  | "processing"
  | "closing"
  | "grading";

export type InterviewNotice = null | "plan_failed" | "empty_transcript" | "tts_failed";

export interface InterviewState {
  phase: InterviewPhase;
  plan: InterviewPlanItem[];
  mainIndex: number;
  followUpUsed: boolean;
  question: string;
  /** Vietnamese translation of `question`, prepared up front alongside it
   * (in the plan for main questions, in the AI's follow-up decision for
   * follow-ups) — "Dịch sang tiếng Việt" just displays this, no AI call. */
  questionVi: string;
  kind: "main" | "follow_up";
  draft: string;
  notice: InterviewNotice;
}

export type InterviewEvent =
  | { type: "PLAN_READY"; plan: InterviewPlanItem[]; startIndex?: number }
  | { type: "PLAN_FAILED" }
  | { type: "RETRY_PLAN" }
  | { type: "SPEECH_ENDED"; ttsFailed?: boolean }
  | { type: "REPLAY" }
  | { type: "START_RECORDING" }
  | { type: "STOP_RECORDING" }
  | { type: "TRANSCRIBED"; text: string; review: boolean }
  | { type: "TRANSCRIBE_FAILED" }
  | { type: "RETRY_TRANSCRIBE" }
  | { type: "EDIT_DRAFT"; text: string }
  | { type: "SEND" }
  | { type: "FOLLOW_UP"; question: string; vi: string }
  | { type: "NEXT_MAIN" }
  | { type: "SKIP" }
  | { type: "CLOSING_ENDED" }
  | { type: "END_EARLY" };

export const initialInterviewState: InterviewState = {
  phase: "warming",
  plan: [],
  mainIndex: 0,
  followUpUsed: false,
  question: "",
  questionVi: "",
  kind: "main",
  draft: "",
  notice: null,
};

function askMain(state: InterviewState, index: number): InterviewState {
  if (index >= state.plan.length) {
    return { ...state, phase: "closing", draft: "", notice: null };
  }
  const item = state.plan[index];
  return {
    ...state,
    phase: "speaking",
    mainIndex: index,
    followUpUsed: false,
    question: item.en,
    questionVi: item.vi,
    kind: "main",
    draft: "",
    notice: null,
  };
}

export function interviewReducer(state: InterviewState, event: InterviewEvent): InterviewState {
  const { phase } = state;
  switch (event.type) {
    case "PLAN_READY":
      return phase === "warming" ? askMain({ ...state, plan: event.plan }, event.startIndex ?? 0) : state;
    case "PLAN_FAILED":
      return phase === "warming" ? { ...state, notice: "plan_failed" } : state;
    case "RETRY_PLAN":
      return phase === "warming" ? { ...state, notice: null } : state;
    case "SPEECH_ENDED":
      return phase === "speaking" ? { ...state, phase: "idle", notice: event.ttsFailed ? "tts_failed" : null } : state;
    case "REPLAY":
      return phase === "idle" ? { ...state, phase: "speaking", notice: null } : state;
    case "START_RECORDING":
      return phase === "idle" || phase === "sttError" || phase === "review"
        ? { ...state, phase: "recording", draft: "", notice: null }
        : state;
    case "STOP_RECORDING":
      return phase === "recording" ? { ...state, phase: "transcribing" } : state;
    case "TRANSCRIBED": {
      if (phase !== "transcribing") return state;
      const text = event.text.trim();
      if (!text) return { ...state, phase: "idle", notice: "empty_transcript" };
      return { ...state, phase: event.review ? "review" : "processing", draft: text };
    }
    case "TRANSCRIBE_FAILED":
      return phase === "transcribing" ? { ...state, phase: "sttError" } : state;
    case "RETRY_TRANSCRIBE":
      return phase === "sttError" ? { ...state, phase: "transcribing" } : state;
    case "EDIT_DRAFT":
      return phase === "review" ? { ...state, draft: event.text } : state;
    case "SEND":
      return phase === "review" && state.draft.trim() ? { ...state, phase: "processing" } : state;
    case "FOLLOW_UP":
      return phase === "processing"
        ? {
            ...state,
            phase: "speaking",
            question: event.question,
            questionVi: event.vi,
            kind: "follow_up",
            followUpUsed: true,
            draft: "",
          }
        : state;
    case "NEXT_MAIN":
      return phase === "processing" ? askMain(state, state.mainIndex + 1) : state;
    case "SKIP":
      return phase === "idle" || phase === "sttError" || phase === "review" ? askMain(state, state.mainIndex + 1) : state;
    case "CLOSING_ENDED":
      return phase === "closing" ? { ...state, phase: "grading" } : state;
    case "END_EARLY":
      return phase === "grading" ? state : { ...state, phase: "grading" };
  }
}

export function canFollowUp(state: InterviewState): boolean {
  return state.kind === "main" && !state.followUpUsed;
}

export function resumeIndex(turns: InterviewTurn[]): number {
  return turns.length === 0 ? 0 : Math.max(...turns.map((t) => t.mainIndex)) + 1;
}
