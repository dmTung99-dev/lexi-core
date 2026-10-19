import type { InterviewVoice } from "./interviewTypes";

export type ConversationMode = "topic" | "roleplay";
export type ConversationLevel = "A2" | "B1" | "B2" | "C1";

export const CONVERSATION_LEVELS: ConversationLevel[] = ["A2", "B1", "B2", "C1"];

/** Messages kept verbatim after a condense. */
export const RECENT_WINDOW = 8;
/** Condense when this many messages are not yet folded into `summary`. */
export const CONDENSE_THRESHOLD = 16;
/** Topic mode offers to wrap up when the learner reaches this user turn. */
export const WRAP_UP_TURN = 12;
/** Hard cap on user turns, both modes. */
export const MAX_USER_TURNS = 30;

export interface ConversationSetup {
  mode: ConversationMode;
  /** Topic text, or the scenario title/description in role-play. */
  topic: string;
  level: ConversationLevel;
  voice: InterviewVoice;
  speakAloud: boolean;
  reviewTranscript: boolean;
  /** Role-play only: who the AI plays (English). null in topic mode. */
  persona: string | null;
  /** Role-play only: 3-4 goals (Vietnamese). [] in topic mode. */
  goals: string[];
}

/** One "Tại sao?" point: a fragment of an English sentence and why it is said that way. */
export interface WhyPoint {
  part: string;   // English fragment, quoted from the sentence
  reason: string; // Vietnamese
}

export interface ConversationHint {
  corrected: string;
  note: string;
  alternatives: string[];
  /** Absent on hints cached before the "Tại sao?" points existed. */
  why?: WhyPoint[];
}

/** One "Gợi ý cách nói" option. */
export interface ConversationSuggestion {
  text: string;
  why: WhyPoint[];
}

export interface ConversationMessage {
  role: "ai" | "user";
  text: string;
  /** Cached "Gợi ý sửa" result; user messages only. Omit the key when absent. */
  hint?: ConversationHint;
  /** Vietnamese translation of `text`; AI messages only. Omit the key when absent. */
  vi?: string;
}

export type ConversationCriterionKey = "grammar" | "vocabulary" | "fluency" | "coherence";

export const CONVERSATION_CRITERIA: { key: ConversationCriterionKey; label: string }[] = [
  { key: "grammar", label: "Ngữ pháp" },
  { key: "vocabulary", label: "Từ vựng" },
  { key: "fluency", label: "Độ trôi chảy" },
  { key: "coherence", label: "Mạch lạc" },
];

export interface ConversationPhrase {
  text: string;     // English phrase
  meaning: string;  // short Vietnamese meaning
  example: string;  // short English sentence using the phrase
}

export interface ConversationCorrection {
  messageIndex: number; // index into session.messages (a user message)
  said: string;
  corrected: string;
  note: string;         // Vietnamese
  /** Absent on reports saved before the "Tại sao?" points existed. */
  why?: WhyPoint[];
}

export interface ConversationMistake {
  pattern: string; // Vietnamese description
  /** One-sentence Vietnamese rule to remember; absent on older reports. */
  rule?: string;
  examples: { said: string; better: string }[];
}

export interface ConversationReport {
  overall: number;
  criteria: Record<ConversationCriterionKey, number>;
  criteriaNotes: Record<ConversationCriterionKey, string>;
  recurringMistakes: ConversationMistake[];
  corrections: ConversationCorrection[];
  phrases: ConversationPhrase[];
  /** Role-play only; the key is omitted in topic mode. */
  goalResult?: { achieved: boolean; comment: string };
}

export interface ConversationSession {
  id: string;
  createdAt: string;
  status: "in_progress" | "completed";
  setup: ConversationSetup;
  summary: string;
  summarizedCount: number;
  messages: ConversationMessage[];
  goalsDone: number[];
  report: ConversationReport | null;
  reportError: boolean;
}

export function userTurnCount(messages: ConversationMessage[]): number {
  return messages.filter((m) => m.role === "user").length;
}
