import { computeSm2 } from "./sm2";
import { ROLEPLAY_PRESETS, TOPIC_CARDS } from "./conversationScenarios";
import type { ConversationSetup } from "./conversationTypes";
import {
  KNOWN_REPETITIONS,
  MAX_COVERED_PATTERNS,
  MAX_COVERED_WORDS,
  MAX_TOPIC_FACTS,
  MAX_TRACKED_MISTAKES,
  type CoveredItem,
  type MemoryUpdate,
  type MistakeTarget,
  type PrepCoverage,
  type TopicMemory,
  type TrackedMistake,
} from "./learnerMemoryTypes";

const FREE_GROUP = { key: "free", label: "Tự do" };
const MAX_RULE_CHARS = 200;
const MAX_FACT_CHARS = 160;
const MAX_ASKED = 6;
const MAX_ASKED_CHARS = 40;

/** Which topic-memory bucket a session belongs to. "custom" and unknown ids fall back to free. */
export function memoryGroupKey(setup: ConversationSetup): { key: string; label: string } {
  if (setup.prepId) return { key: `prep_${setup.prepId}`, label: setup.topic };
  if (setup.presetId) {
    if (setup.mode === "topic") {
      const card = TOPIC_CARDS.find((c) => c.id === setup.presetId);
      if (card) return { key: `topic_${card.id}`, label: card.title };
    } else {
      const preset = ROLEPLAY_PRESETS.find((p) => p.id === setup.presetId);
      if (preset) return { key: `roleplay_${preset.id}`, label: preset.title };
    }
  }
  return FREE_GROUP;
}

export function mistakeStatus(m: TrackedMistake): "learning" | "known" {
  return m.sm2Repetitions >= KNOWN_REPETITIONS ? "known" : "learning";
}

/** Due mistakes to practise this session: learning before known, then oldest due first. */
export function pickTargets(items: TrackedMistake[], max: number, now: Date): MistakeTarget[] {
  return items
    .filter((m) => new Date(m.nextReviewAt).getTime() <= now.getTime())
    .sort((a, b) => {
      const known = Number(mistakeStatus(a) === "known") - Number(mistakeStatus(b) === "known");
      if (known !== 0) return known;
      return new Date(a.nextReviewAt).getTime() - new Date(b.nextReviewAt).getTime();
    })
    .slice(0, max)
    .map((m) => ({ id: m.id, pattern: m.pattern, rule: m.rule, example: { ...m.example } }));
}

function trim(s: string, max: number): string {
  return s.trim().slice(0, max);
}

function evictOverCap(items: TrackedMistake[]): TrackedMistake[] {
  let excess = items.length - MAX_TRACKED_MISTAKES;
  if (excess <= 0) return items;
  const time = (iso: string) => new Date(iso).getTime();
  const evicted = new Set<string>();
  const known = items
    .filter((m) => mistakeStatus(m) === "known")
    .sort((a, b) => time(b.nextReviewAt) - time(a.nextReviewAt));
  for (const m of known) {
    if (excess <= 0) break;
    evicted.add(m.id);
    excess--;
  }
  if (excess > 0) {
    const rest = items
      .filter((m) => !evicted.has(m.id))
      .sort((a, b) => time(a.lastSeenAt) - time(b.lastSeenAt));
    for (const m of rest) {
      if (excess <= 0) break;
      evicted.add(m.id);
      excess--;
    }
  }
  return items.filter((m) => !evicted.has(m.id));
}

/** Applies a session's SM-2 checks and newly found mistakes to the tracked list. Pure. */
export function applyMistakeUpdate(
  items: TrackedMistake[],
  update: Pick<MemoryUpdate, "checks" | "found">,
  source: TrackedMistake["source"],
  now: Date,
  newId: () => string
): TrackedMistake[] {
  const nowIso = now.toISOString();
  const byId = new Map(items.map((m) => [m.id, m]));
  const next = new Map(byId);
  const touched = new Set<string>();

  const review = (m: TrackedMistake, quality: number): TrackedMistake => {
    const { sm2Repetitions, sm2EaseFactor, sm2Interval, nextReviewAt } = computeSm2(m, quality, now);
    return { ...m, sm2Repetitions, sm2EaseFactor, sm2Interval, nextReviewAt, lastSeenAt: nowIso };
  };

  for (const check of update.checks) {
    const m = byId.get(check.id);
    if (!m || touched.has(m.id)) continue;
    if (check.result !== "correct" && check.result !== "wrong") continue;
    touched.add(m.id);
    next.set(m.id, review(m, check.result === "correct" ? 4 : 1));
  }

  const added: TrackedMistake[] = [];
  for (const f of update.found) {
    const existing = f.trackedId ? byId.get(f.trackedId) : undefined;
    const example = { said: trim(f.example.said, MAX_RULE_CHARS), better: trim(f.example.better, MAX_RULE_CHARS) };
    if (existing) {
      if (touched.has(existing.id)) continue; // a check already covered it
      touched.add(existing.id);
      next.set(existing.id, { ...review(existing, 1), example });
    } else {
      added.push({
        id: newId(),
        pattern: trim(f.pattern, MAX_RULE_CHARS),
        rule: trim(f.rule, MAX_RULE_CHARS),
        example,
        source,
        createdAt: nowIso,
        lastSeenAt: nowIso,
        sm2Repetitions: 0,
        sm2EaseFactor: 2.5,
        sm2Interval: 0,
        nextReviewAt: nowIso,
      });
    }
  }

  return evictOverCap([...next.values(), ...added]);
}

/** Replaces a group's facts with the session's updated list; null = nothing to write. */
export function applyTopicUpdate(
  prev: TopicMemory | null,
  key: string,
  label: string,
  topicFacts: MemoryUpdate["topicFacts"],
  now: Date,
  newId: () => string
): TopicMemory | null {
  if (!topicFacts || topicFacts.length === 0) return null;
  const nowIso = now.toISOString();
  const facts = topicFacts.map((f) => ({
    id: newId(),
    fact: trim(f.fact, MAX_FACT_CHARS),
    asked: f.asked.slice(0, MAX_ASKED).map((a) => trim(a, MAX_ASKED_CHARS)),
    updatedAt: nowIso,
  }));
  return {
    key: prev?.key ?? key,
    label: prev?.label ?? label,
    facts: facts.slice(-MAX_TOPIC_FACTS),
    updatedAt: nowIso,
  };
}

/** Dedupe key for covered patterns/words: case, whitespace and apostrophe style do not matter. */
export function coverageKey(text: string): string {
  return text.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
}

function mergeCovered(prev: CoveredItem[], added: string[], nowIso: string, cap: number): CoveredItem[] {
  const byKey = new Map<string, CoveredItem>();
  for (const item of prev) byKey.set(coverageKey(item.text), item);
  for (const raw of added) {
    const text = raw.trim();
    if (!text) continue;
    const key = coverageKey(text);
    byKey.set(key, { text: byKey.get(key)?.text ?? text, lastSeenAt: nowIso });
  }
  return [...byKey.values()].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, cap);
}

/** Records what a new kit taught; repeats refresh lastSeenAt, the oldest items fall off past the caps. */
export function applyCoverageUpdate(
  prev: PrepCoverage,
  kit: { patterns: string[]; words: string[] },
  now: Date
): PrepCoverage {
  const nowIso = now.toISOString();
  return {
    patterns: mergeCovered(prev.patterns, kit.patterns, nowIso, MAX_COVERED_PATTERNS),
    words: mergeCovered(prev.words, kit.words, nowIso, MAX_COVERED_WORDS),
    updatedAt: nowIso,
  };
}

export function removeCovered(items: CoveredItem[], text: string): CoveredItem[] {
  const key = coverageKey(text);
  return items.filter((i) => coverageKey(i.text) !== key);
}
