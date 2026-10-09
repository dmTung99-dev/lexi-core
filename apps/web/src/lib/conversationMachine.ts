import { MAX_USER_TURNS, WRAP_UP_TURN, type ConversationMode } from "./conversationTypes";

export type ConversationPhase =
  | "warming"
  | "aiSpeaking"
  | "idle"
  | "recording"
  | "transcribing"
  | "sttError"
  | "review"
  | "aiThinking"
  | "replyError"
  | "grading";

export type ConversationNotice = null | "opening_failed" | "empty_transcript" | "tts_failed";

export interface ConversationState {
  phase: ConversationPhase;
  /** User messages sent so far. */
  userTurns: number;
  /** Earlier "+ Nói thêm" segments of the turn being composed. */
  segments: string[];
  /** Text currently in the composer (typed, or a voice transcript). */
  draft: string;
  notice: ConversationNotice;
  wrapUpOffered: boolean;
  /** The AI's current line is the last one: grade after it is spoken. */
  final: boolean;
}

export type ConversationEvent =
  | { type: "OPENING_READY" }
  | { type: "OPENING_FAILED" }
  | { type: "RETRY_OPENING" }
  | { type: "RESUME"; userTurns: number; needsReply: boolean }
  | { type: "SPEECH_ENDED"; ttsFailed?: boolean }
  | { type: "START_RECORDING" }
  | { type: "STOP_RECORDING" }
  | { type: "TRANSCRIBED"; text: string; review: boolean }
  | { type: "TRANSCRIBE_FAILED" }
  | { type: "RETRY_TRANSCRIBE" }
  | { type: "EDIT_DRAFT"; text: string }
  | { type: "ADD_SEGMENT" }
  | { type: "SEND" }
  | { type: "REPLY_RECEIVED"; final: boolean; suggestEnd: boolean }
  | { type: "REPLY_FAILED" }
  | { type: "RETRY_REPLY" }
  | { type: "DISMISS_WRAP_UP" }
  | { type: "END" };

export const initialConversationState: ConversationState = {
  phase: "warming",
  userTurns: 0,
  segments: [],
  draft: "",
  notice: null,
  wrapUpOffered: false,
  final: false,
};

export function joinSegments(segments: string[], draft: string): string {
  return [...segments, draft]
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(" ");
}

export function replyFlags(mode: ConversationMode, userTurns: number): { offerEnd: boolean; mustClose: boolean } {
  return { offerEnd: mode === "topic" && userTurns === WRAP_UP_TURN, mustClose: userTurns >= MAX_USER_TURNS };
}

export function isScenarioComplete(goals: string[], goalsDone: number[]): boolean {
  return goals.length > 0 && goals.every((_, i) => goalsDone.includes(i));
}

function sent(state: ConversationState): ConversationState {
  return { ...state, phase: "aiThinking", userTurns: state.userTurns + 1, segments: [], draft: "", notice: null };
}

export function conversationReducer(state: ConversationState, event: ConversationEvent): ConversationState {
  const { phase } = state;
  switch (event.type) {
    case "OPENING_READY":
      return phase === "warming" ? { ...state, phase: "aiSpeaking", notice: null } : state;
    case "OPENING_FAILED":
      return phase === "warming" ? { ...state, notice: "opening_failed" } : state;
    case "RETRY_OPENING":
      return phase === "warming" ? { ...state, notice: null } : state;
    case "RESUME":
      return phase === "warming"
        ? { ...state, phase: event.needsReply ? "aiThinking" : "idle", userTurns: event.userTurns }
        : state;
    case "SPEECH_ENDED":
      if (phase !== "aiSpeaking") return state;
      return state.final
        ? { ...state, phase: "grading", notice: null }
        : { ...state, phase: "idle", notice: event.ttsFailed ? "tts_failed" : null };
    case "START_RECORDING": {
      if (phase === "idle") {
        const typed = state.draft.trim();
        return { ...state, phase: "recording", segments: typed ? [...state.segments, typed] : state.segments, draft: "", notice: null };
      }
      return phase === "sttError" || phase === "review" ? { ...state, phase: "recording", draft: "", notice: null } : state;
    }
    case "STOP_RECORDING":
      return phase === "recording" ? { ...state, phase: "transcribing" } : state;
    case "TRANSCRIBED": {
      if (phase !== "transcribing") return state;
      const text = event.text.trim();
      if (!text) return { ...state, phase: "idle", notice: "empty_transcript" };
      return event.review ? { ...state, phase: "review", draft: text, notice: null } : sent(state);
    }
    case "TRANSCRIBE_FAILED":
      return phase === "transcribing" ? { ...state, phase: "sttError" } : state;
    case "RETRY_TRANSCRIBE":
      return phase === "sttError" ? { ...state, phase: "transcribing" } : state;
    case "EDIT_DRAFT":
      return phase === "idle" || phase === "review" ? { ...state, draft: event.text, notice: null } : state;
    case "ADD_SEGMENT": {
      const text = state.draft.trim();
      if ((phase !== "idle" && phase !== "review") || !text) return state;
      return { ...state, phase: "idle", segments: [...state.segments, text], draft: "", notice: null };
    }
    case "SEND":
      return (phase === "idle" || phase === "review") && joinSegments(state.segments, state.draft) ? sent(state) : state;
    case "REPLY_RECEIVED":
      return phase === "aiThinking"
        ? { ...state, phase: "aiSpeaking", final: event.final, wrapUpOffered: state.wrapUpOffered || event.suggestEnd }
        : state;
    case "REPLY_FAILED":
      return phase === "aiThinking" ? { ...state, phase: "replyError" } : state;
    case "RETRY_REPLY":
      return phase === "replyError" ? { ...state, phase: "aiThinking" } : state;
    case "DISMISS_WRAP_UP":
      return { ...state, wrapUpOffered: false };
    case "END":
      return phase === "grading" ? state : { ...state, phase: "grading" };
  }
}
