export const MAX_TRACKED_MISTAKES = 20;
export const MAX_TOPIC_FACTS = 12;
/** A mistake is "known" (Đã quen) once it has this many consecutive correct reviews. */
export const KNOWN_REPETITIONS = 3;
export const CONVERSATION_TARGETS = 3;
export const INTERVIEW_TARGETS = 2;

export interface MistakeExample {
  said: string;
  better: string;
}

export interface TrackedMistake {
  id: string;
  pattern: string;
  rule: string;
  example: MistakeExample;
  source: "conversation" | "interview";
  createdAt: string;
  lastSeenAt: string;
  sm2Repetitions: number;
  sm2EaseFactor: number;
  sm2Interval: number;
  nextReviewAt: string;
}

export interface MistakeMemory {
  items: TrackedMistake[];
  updatedAt: string;
}

export interface TopicFact {
  id: string;
  fact: string;
  asked: string[];
  updatedAt: string;
}

export interface TopicMemory {
  key: string;
  label: string;
  facts: TopicFact[];
  updatedAt: string;
}

export interface MistakeTarget {
  id: string;
  pattern: string;
  rule: string;
  example: MistakeExample;
}

export interface SessionMemorySnapshot {
  groupKey: string;
  groupLabel: string;
  facts: TopicFact[];
  targets: MistakeTarget[];
}

export interface FoundMistake {
  pattern: string;
  rule: string;
  example: MistakeExample;
  trackedId?: string;
}

export interface MemoryUpdate {
  checks: { id: string; result: "correct" | "wrong" }[];
  found: FoundMistake[];
  topicFacts: { fact: string; asked: string[] }[] | null;
}

export const MAX_COVERED_PATTERNS = 60;
export const MAX_COVERED_WORDS = 120;
/** Due mistakes woven into a new kit. */
export const KIT_TARGETS = 2;
/** How many of the most recent covered items the kit prompt sees. */
export const KIT_PROMPT_PATTERNS = 40;
export const KIT_PROMPT_WORDS = 80;
/** How many of the newest earlier kits (with their summaries) a new kit's prompt sees. */
export const KIT_PROMPT_HISTORY = 50;

/** A pattern or word some earlier Chuẩn bị kit already taught. */
export interface CoveredItem {
  text: string;
  lastSeenAt: string;
}

export interface PrepCoverage {
  patterns: CoveredItem[];
  words: CoveredItem[];
  updatedAt: string;
}
