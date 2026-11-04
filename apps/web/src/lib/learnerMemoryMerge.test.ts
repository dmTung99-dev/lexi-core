import { describe, expect, it } from "vitest";
import type { ConversationSetup } from "./conversationTypes";
import {
  applyMistakeUpdate,
  applyTopicUpdate,
  memoryGroupKey,
  mistakeStatus,
  pickTargets,
} from "./learnerMemoryMerge";
import type { TopicMemory, TrackedMistake } from "./learnerMemoryTypes";

const BASE = { level: "B1", voice: "female1", speakAloud: false, reviewTranscript: false } as const;
const TOPIC = { ...BASE, mode: "topic", topic: "My own topic", persona: null, goals: [] } as ConversationSetup;
const ROLEPLAY = { ...BASE, mode: "roleplay", topic: "Scenario", persona: "A waiter", goals: ["g"] } as ConversationSetup;

const NOW = new Date("2026-11-04T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const iso = (d: string) => new Date(d).toISOString();

function mk(id: string, over: Partial<TrackedMistake> = {}): TrackedMistake {
  return {
    id,
    pattern: `pattern ${id}`,
    rule: `rule ${id}`,
    example: { said: "I goed", better: "I went" },
    source: "conversation",
    createdAt: iso("2026-10-01"),
    lastSeenAt: iso("2026-10-01"),
    sm2Repetitions: 0,
    sm2EaseFactor: 2.5,
    sm2Interval: 0,
    nextReviewAt: iso("2026-10-01"),
    ...over,
  };
}

let counter = 0;
const newId = () => `new${++counter}`;

describe("memoryGroupKey", () => {
  it("prefers prepId", () =>
    expect(memoryGroupKey({ ...ROLEPLAY, prepId: "p1", presetId: "custom", topic: "Báo cáo task A" })).toEqual({
      key: "prep_p1",
      label: "Báo cáo task A",
    }));
  it("uses built-in topic card id and its Vietnamese title", () =>
    expect(memoryGroupKey({ ...TOPIC, presetId: "travel" })).toEqual({ key: "topic_travel", label: "Du lịch" }));
  it("uses built-in role-play preset", () =>
    expect(memoryGroupKey({ ...ROLEPLAY, presetId: "restaurant" })).toEqual({
      key: "roleplay_restaurant",
      label: "Gọi món ở nhà hàng",
    }));
  it("falls back to free for typed topics, custom role-plays and unknown ids", () => {
    expect(memoryGroupKey(TOPIC)).toEqual({ key: "free", label: "Tự do" });
    expect(memoryGroupKey({ ...ROLEPLAY, presetId: "custom" }).key).toBe("free");
    expect(memoryGroupKey({ ...TOPIC, presetId: "gone" }).key).toBe("free");
  });
});

describe("pickTargets", () => {
  const items = [
    mk("a", { nextReviewAt: iso("2026-11-01") }),
    mk("b", { sm2Repetitions: 3, nextReviewAt: iso("2026-10-01") }),
    mk("c", { nextReviewAt: iso("2026-10-20") }),
    mk("d", { nextReviewAt: iso("2026-11-10") }),
  ];
  it("returns only due items, learning before known, then oldest nextReviewAt, capped", () => {
    expect(pickTargets(items, 2, NOW).map((t) => t.id)).toEqual(["c", "a"]);
    expect(pickTargets(items, 3, NOW).map((t) => t.id)).toEqual(["c", "a", "b"]);
  });
  it("returns only target fields", () => {
    expect(pickTargets(items, 1, NOW)[0]).toEqual({
      id: "c",
      pattern: "pattern c",
      rule: "rule c",
      example: { said: "I goed", better: "I went" },
    });
  });
});

describe("applyMistakeUpdate", () => {
  it("correct steps SM-2 up; three corrects make it known", () => {
    let items = [mk("a")];
    for (let i = 1; i <= 3; i++) {
      items = applyMistakeUpdate(items, { checks: [{ id: "a", result: "correct" }], found: [] }, "conversation", NOW, newId);
      expect(items[0].sm2Repetitions).toBe(i);
      expect(items[0].lastSeenAt).toBe(NOW.toISOString());
    }
    expect(mistakeStatus(items[0])).toBe("known");
  });

  it("wrong resets repetitions and makes it due tomorrow", () => {
    const out = applyMistakeUpdate([mk("a", { sm2Repetitions: 2, sm2Interval: 6 })], { checks: [{ id: "a", result: "wrong" }], found: [] }, "conversation", NOW, newId);
    expect(out[0].sm2Repetitions).toBe(0);
    expect(out[0].nextReviewAt).toBe(new Date(NOW.getTime() + DAY).toISOString());
  });

  it("ignores unknown ids, invalid results and applies a duplicated id once", () => {
    const out = applyMistakeUpdate(
      [mk("a"), mk("b")],
      {
        checks: [
          { id: "zzz", result: "correct" },
          { id: "b", result: "maybe" as never },
          { id: "a", result: "correct" },
          { id: "a", result: "correct" },
        ],
        found: [],
      },
      "conversation",
      NOW,
      newId
    );
    expect(out).toHaveLength(2);
    expect(out.find((m) => m.id === "a")!.sm2Repetitions).toBe(1);
    expect(out.find((m) => m.id === "b")).toEqual(mk("b"));
  });

  it("found with valid trackedId and no check counts as wrong and replaces the example", () => {
    const out = applyMistakeUpdate(
      [mk("a", { sm2Repetitions: 2, sm2Interval: 6 })],
      { checks: [], found: [{ pattern: "p", rule: "r", example: { said: "new said", better: "new better" }, trackedId: "a" }] },
      "conversation",
      NOW,
      newId
    );
    expect(out).toHaveLength(1);
    expect(out[0].sm2Repetitions).toBe(0);
    expect(out[0].example).toEqual({ said: "new said", better: "new better" });
    expect(out[0].pattern).toBe("pattern a");
  });

  it("an item touched by both a check and a found entry gets the check only", () => {
    const out = applyMistakeUpdate(
      [mk("a")],
      { checks: [{ id: "a", result: "correct" }], found: [{ pattern: "p", rule: "r", example: { said: "x", better: "y" }, trackedId: "a" }] },
      "conversation",
      NOW,
      newId
    );
    expect(out).toHaveLength(1);
    expect(out[0].sm2Repetitions).toBe(1);
    expect(out[0].example).toEqual({ said: "I goed", better: "I went" });
  });

  it("found without trackedId (or unknown trackedId) adds a new due item with source", () => {
    const out = applyMistakeUpdate(
      [],
      {
        checks: [],
        found: [
          { pattern: "p1", rule: "r1", example: { said: "s", better: "b" } },
          { pattern: "p2", rule: "r2", example: { said: "s", better: "b" }, trackedId: "ghost" },
        ],
      },
      "interview",
      NOW,
      newId
    );
    expect(out).toHaveLength(2);
    for (const m of out) {
      expect(m).toMatchObject({
        source: "interview",
        sm2Repetitions: 0,
        sm2EaseFactor: 2.5,
        sm2Interval: 0,
        nextReviewAt: NOW.toISOString(),
        createdAt: NOW.toISOString(),
        lastSeenAt: NOW.toISOString(),
      });
    }
    expect(out[0].id).not.toBe(out[1].id);
  });

  it("caps at 20: evicts known with latest nextReviewAt first, then oldest lastSeenAt", () => {
    const base = Array.from({ length: 20 }, (_, i) =>
      mk(`l${i}`, { lastSeenAt: new Date(Date.UTC(2026, 9, 1 + i)).toISOString() })
    );
    const known = [
      mk("k1", { sm2Repetitions: 3, nextReviewAt: iso("2026-12-01") }),
      mk("k2", { sm2Repetitions: 3, nextReviewAt: iso("2027-01-01") }),
    ];
    const found = (n: number) => Array.from({ length: n }, (_, i) => ({ pattern: `n${i}`, rule: "r", example: { said: "s", better: "b" } }));

    // 18 learning + 2 known + 2 new -> evict both known (latest review first)
    let out = applyMistakeUpdate([...base.slice(0, 18), ...known], { checks: [], found: found(2) }, "conversation", NOW, newId);
    expect(out).toHaveLength(20);
    expect(out.map((m) => m.id)).not.toContain("k1");
    expect(out.map((m) => m.id)).not.toContain("k2");

    // 18 learning + 2 known + 1 new -> only the latest-due known (k2) goes
    out = applyMistakeUpdate([...base.slice(0, 18), ...known], { checks: [], found: found(1) }, "conversation", NOW, newId);
    expect(out).toHaveLength(20);
    expect(out.map((m) => m.id)).toContain("k1");
    expect(out.map((m) => m.id)).not.toContain("k2");

    // 20 learning + 2 new, no known -> oldest lastSeenAt (l0, l1) go
    out = applyMistakeUpdate(base, { checks: [], found: found(2) }, "conversation", NOW, newId);
    expect(out).toHaveLength(20);
    expect(out.map((m) => m.id)).not.toContain("l0");
    expect(out.map((m) => m.id)).not.toContain("l1");
    expect(out.map((m) => m.id)).toContain("l2");
  });

  it("trims pattern/rule to 200 chars", () => {
    const out = applyMistakeUpdate([], { checks: [], found: [{ pattern: "p".repeat(300), rule: "r".repeat(300), example: { said: "s", better: "b" } }] }, "conversation", NOW, newId);
    expect(out[0].pattern).toHaveLength(200);
    expect(out[0].rule).toHaveLength(200);
  });
});

describe("applyTopicUpdate", () => {
  it("returns null for null or empty topicFacts", () => {
    expect(applyTopicUpdate(null, "free", "Tự do", null, NOW, newId)).toBeNull();
    expect(applyTopicUpdate(null, "free", "Tự do", [], NOW, newId)).toBeNull();
  });

  it("replaces facts, keeps label/key, caps at 12 dropping oldest, trims fact to 160 and asked to 6 x 40", () => {
    const prev: TopicMemory = {
      key: "topic_travel",
      label: "Du lịch",
      facts: [{ id: "old", fact: "old", asked: [], updatedAt: iso("2026-10-01") }],
      updatedAt: iso("2026-10-01"),
    };
    const facts = Array.from({ length: 14 }, (_, i) => ({ fact: `fact ${i}`, asked: [] as string[] }));
    facts[13] = { fact: "f".repeat(300), asked: Array.from({ length: 9 }, () => "q".repeat(100)) };
    const out = applyTopicUpdate(prev, "other", "Other", facts, NOW, newId)!;
    expect(out.key).toBe("topic_travel");
    expect(out.label).toBe("Du lịch");
    expect(out.updatedAt).toBe(NOW.toISOString());
    expect(out.facts).toHaveLength(12);
    expect(out.facts[0].fact).toBe("fact 2");
    expect(out.facts.map((f) => f.fact)).not.toContain("old");
    const last = out.facts[11];
    expect(last.fact).toHaveLength(160);
    expect(last.asked).toHaveLength(6);
    expect(last.asked[0]).toHaveLength(40);
  });

  it("uses the given key and label when there is no previous memory", () => {
    const out = applyTopicUpdate(null, "free", "Tự do", [{ fact: "x", asked: [] }], NOW, newId)!;
    expect(out).toMatchObject({ key: "free", label: "Tự do" });
  });
});
