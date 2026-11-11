import { deleteTopicMemory, getMistakeMemory, getPrepCoverage, savePrepCoverage } from "./learnerMemory";
import { listRecentConversationPreps } from "./conversationPreps";
import { kitSummary } from "./prepHistory";
import { applyCoverageUpdate, pickTargets } from "./learnerMemoryMerge";
import {
  KIT_PROMPT_HISTORY,
  KIT_PROMPT_PATTERNS,
  KIT_PROMPT_WORDS,
  KIT_TARGETS,
  type CoveredItem,
  type MistakeTarget,
} from "./learnerMemoryTypes";

/** One earlier kit as the new kit's prompt sees it. */
export interface KitHistoryItem {
  title: string;
  createdAt: string;
  summary: string;
}

/** What kit generation is told about the learner (only when "Dùng trí nhớ" is on). */
export interface KitMemory {
  patterns: string[];
  words: string[];
  targets: MistakeTarget[];
  history: KitHistoryItem[];
}

function mostRecent(items: CoveredItem[], max: number): string[] {
  return [...items].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, max).map((i) => i.text);
}

/** Coverage, due mistakes and earlier kits' summaries for a new kit; undefined when a read fails (the kit is then generated without memory). */
export async function loadKitMemory(uid: string, now: Date = new Date()): Promise<KitMemory | undefined> {
  try {
    const [coverage, mistakes, kits] = await Promise.all([getPrepCoverage(uid), getMistakeMemory(uid), listRecentConversationPreps(uid)]);
    return {
      patterns: mostRecent(coverage.patterns, KIT_PROMPT_PATTERNS),
      words: mostRecent(coverage.words, KIT_PROMPT_WORDS),
      targets: pickTargets(mistakes.items, KIT_TARGETS, now),
      history: kits.slice(0, KIT_PROMPT_HISTORY).map((k) => ({ title: k.title, createdAt: k.createdAt, summary: kitSummary(k) })),
    };
  } catch {
    return undefined;
  }
}

/** Remembers what a saved kit taught. Runs whatever the switch says; never throws. */
export async function recordKitCoverage(
  uid: string,
  kit: { patterns: { pattern: string }[]; vocab: { text: string }[] },
  now: Date = new Date()
): Promise<void> {
  try {
    const prev = await getPrepCoverage(uid);
    await savePrepCoverage(
      uid,
      applyCoverageUpdate(prev, { patterns: kit.patterns.map((p) => p.pattern), words: kit.vocab.map((v) => v.text) }, now)
    );
  } catch {
    // Memory is best-effort.
  }
}

/** Removes a deleted kit's role-play memory (new and legacy docs). Never throws. */
export async function deleteKitMemory(uid: string, prepId: string): Promise<void> {
  try {
    await deleteTopicMemory(uid, `prep_${prepId}`);
  } catch {
    // Memory is best-effort.
  }
}
