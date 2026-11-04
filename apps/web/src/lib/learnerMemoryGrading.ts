import { getMistakeMemory, getTopicMemory, saveMistakeMemory, saveTopicMemory } from "./learnerMemory";
import { applyMistakeUpdate, applyTopicUpdate, memoryGroupKey, pickTargets } from "./learnerMemoryMerge";
import {
  CONVERSATION_TARGETS,
  INTERVIEW_TARGETS,
  type MemoryUpdate,
  type MistakeTarget,
  type SessionMemorySnapshot,
  type TopicMemory,
  type TrackedMistake,
} from "./learnerMemoryTypes";
import type { ReportMemoryInput } from "./learnerMemoryPrompt";
import { markConversationMemoryApplied } from "./conversationSessions";
import { markInterviewMemoryApplied } from "./interviewSessions";
import type { ConversationSession, ConversationSetup } from "./conversationTypes";
import type { InterviewSession } from "./interviewTypes";

/** Memory a new Hội thoại session starts with; undefined when either read fails (session still runs without memory). */
export async function loadSessionSnapshot(
  uid: string,
  setup: ConversationSetup,
  now: Date = new Date()
): Promise<SessionMemorySnapshot | undefined> {
  try {
    const { key, label } = memoryGroupKey(setup);
    const [mistakes, topic] = await Promise.all([getMistakeMemory(uid), getTopicMemory(uid, key)]);
    return {
      groupKey: key,
      groupLabel: label,
      facts: topic?.facts ?? [],
      targets: pickTargets(mistakes.items, CONVERSATION_TARGETS, now),
    };
  } catch {
    return undefined;
  }
}

/** Mistake targets a new Phỏng vấn session practises; undefined when the read fails. */
export async function loadInterviewTargets(uid: string, now: Date = new Date()): Promise<MistakeTarget[] | undefined> {
  try {
    return pickTargets((await getMistakeMemory(uid)).items, INTERVIEW_TARGETS, now);
  } catch {
    return undefined;
  }
}

/** Fresh memory read at grading time; a null part means that read failed, so its write is skipped. */
export interface GradingMemory {
  kind: "conversation" | "interview";
  mistakes: TrackedMistake[] | null;
  /** Always null for interviews (no topic memory). */
  topic: { key: string; label: string; prev: TopicMemory | null } | null;
}

/** Reads the current memory (never the session snapshot) as the merge base; null when this session already updated memory. */
export async function loadGradingMemory(
  uid: string,
  graded: { kind: "conversation"; session: ConversationSession } | { kind: "interview"; session: InterviewSession }
): Promise<GradingMemory | null> {
  if (graded.session.memoryApplied === true) return null;
  const mistakesRead = getMistakeMemory(uid).then((m) => m.items, () => null);
  if (graded.kind === "interview") return { kind: "interview", mistakes: await mistakesRead, topic: null };
  const { session } = graded;
  const group = session.memory
    ? { key: session.memory.groupKey, label: session.memory.groupLabel }
    : memoryGroupKey(session.setup);
  const [mistakes, topic] = await Promise.all([
    mistakesRead,
    getTopicMemory(uid, group.key).then((prev) => ({ ...group, prev }), () => null),
  ]);
  return { kind: "conversation", mistakes, topic };
}

/** What the report prompt is told about memory; undefined when memory is not being updated. */
export function toReportMemoryInput(gm: GradingMemory | null): ReportMemoryInput | undefined {
  if (!gm) return undefined;
  return {
    tracked: (gm.mistakes ?? []).map(({ id, pattern, rule }) => ({ id, pattern, rule })),
    facts: gm.topic ? gm.topic.prev?.facts ?? [] : null,
  };
}

function newId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

/** Writes a graded session's memory update (best-effort) and marks the session so it is never applied twice. Never throws. */
export async function applyGradingMemory(
  uid: string,
  sessionId: string,
  gm: GradingMemory,
  update: MemoryUpdate,
  now: Date = new Date()
): Promise<void> {
  try {
    if (gm.mistakes) {
      await saveMistakeMemory(uid, applyMistakeUpdate(gm.mistakes, update, gm.kind, now, newId)).catch(() => {});
    }
    if (gm.topic) {
      const next = applyTopicUpdate(gm.topic.prev, gm.topic.key, gm.topic.label, update.topicFacts, now, newId);
      if (next) await saveTopicMemory(uid, next).catch(() => {});
    }
    const mark = gm.kind === "conversation" ? markConversationMemoryApplied : markInterviewMemoryApplied;
    await mark(uid, sessionId).catch(() => {});
  } catch {
    // Memory is best-effort; it never blocks grading or the report.
  }
}
