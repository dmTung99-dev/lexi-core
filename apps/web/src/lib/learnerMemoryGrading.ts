import { getMistakeMemory, getTopicMemory } from "./learnerMemory";
import { memoryGroupKey, pickTargets } from "./learnerMemoryMerge";
import { CONVERSATION_TARGETS, INTERVIEW_TARGETS, type MistakeTarget, type SessionMemorySnapshot } from "./learnerMemoryTypes";
import type { ConversationSetup } from "./conversationTypes";

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
