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
