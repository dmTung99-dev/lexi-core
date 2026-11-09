# Memory Split + Chuẩn bị Memory + "Dùng trí nhớ" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kit role-play memory moves out of the Hội thoại store into a new Chuẩn bị store, kit generation reads and writes its own memory (patterns/words already taught + shared mistakes), every start screen gets a "Dùng trí nhớ" switch that turns memory use (not writing) off, and the report prompt resolves contradicting facts.

**Architecture:** The storage layer (`lib/learnerMemory.ts`) routes topic keys starting with `prep_` to `users/{uid}/prep_scene_memory/{prepId}` (with a lazy fallback to the legacy `conversation_memory/prep_*` doc), so snapshot and grading code keep working unchanged. A new `prep_memory/coverage` doc holds patterns/words already taught; `lib/prepMemory.ts` reads it for kit generation and writes it after a kit is saved. A shared `useMemoryPreference` hook + `MemorySwitch` component drive the switch, remembered in Settings.

**Tech Stack:** Next.js 16 client components, React, TypeScript, Firebase JS SDK (Firestore), Vitest + Testing Library (jsdom), plain CSS in `apps/web/src/styles/bloom.css`.

**Spec:** `docs/superpowers/specs/2026-11-09-memory-split-design.md`

## Global Constraints

- Web only (`apps/web/`). No Flutter, `functions/`, `services/` or Firestore-rules changes.
- Firestore paths under `users/{uid}/`: mistakes `learner_memory/mistakes` (unchanged), Hội thoại topic memory `conversation_memory/{groupKey}` (no new `prep_*` docs), coverage `prep_memory/coverage`, kit scene memory `prep_scene_memory/{prepId}`.
- Caps: covered patterns 60, covered words 120 (oldest `lastSeenAt` dropped first); kit prompt gets the most recent 40 patterns and 80 words; kit targets 2; Hội thoại targets 3 and Phỏng vấn targets 2 (unchanged).
- Switch OFF = the AI sees no memory for that session/kit. Memory WRITING (grading, kit coverage) happens regardless of the switch.
- Settings fields `memoryInConversation`, `memoryInInterview`, `memoryInPrep`; missing = `true`.
- `ConversationSetup.useMemory`, `InterviewSetup.useMemory`, `NewConversationPrep.usedMemory` are always written as booleans, never `undefined` (Firestore rejects `undefined`).
- Every memory read failure behaves like the switch being off; every memory write failure is ignored. Neither ever blocks a session, report, kit or navigation.
- Switch copy, exactly: label "Dùng trí nhớ", hint "AI dựa vào những gì đã học trước đó. Tắt vẫn ghi nhớ sau buổi."
- Every `font-size` in `bloom.css` is `calc(Npx * var(--type-scale))` (N ≥ 15) or `max(var(--type-min), calc(Npx * var(--type-scale)))` (N < 15); enforced by `src/styles/bloom.fontSize.test.ts`. Touch targets ≥ 44px on phones. Bloom tokens only.
- The settings doc `users/{uid}/settings/config` may be rewritten by the Flutter app without the new fields; that is safe because missing fields read as `true`.
- Never stage `apps/web/next-env.d.ts` or `.superpowers/sdd/progress.md` (except in the docs task).
- Run commands from `apps/web/`: focused tests `npx vitest run "<path>"`, full `npm test`, types `npm run typecheck`.
- Commit messages end with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## File Map

| File | Status | Responsibility |
|---|---|---|
| `apps/web/src/lib/learnerMemoryTypes.ts` | modify | coverage types + caps |
| `apps/web/src/lib/learnerMemoryMerge.ts` | modify | `coverageKey`, `applyCoverageUpdate`, `removeCovered` |
| `apps/web/src/lib/learnerMemory.ts` | modify | `prep_` routing + legacy fallback, scene listing, coverage storage |
| `apps/web/src/lib/prepMemory.ts` | new | `loadKitMemory`, `recordKitCoverage`, `deleteKitMemory` |
| `apps/web/src/lib/conversationPrepPrompt.ts` | modify | `buildPrepPrompt(situation, level, memory?)` |
| `apps/web/src/lib/conversationPrepTypes.ts` | modify | `usedMemory` on kits |
| `apps/web/src/lib/learnerMemoryPrompt.ts` | modify | contradiction rule |
| `apps/web/src/lib/settings.ts` | modify | three switch fields |
| `apps/web/src/lib/useMemoryPreference.ts` | new | remembered switch value |
| `apps/web/src/components/shared/MemorySwitch.tsx` | new | the switch UI |
| `apps/web/src/lib/conversationTypes.ts`, `apps/web/src/lib/interviewTypes.ts` | modify | `useMemory` |
| `apps/web/src/app/(app)/conversation/page.tsx`, `apps/web/src/app/(app)/interview/page.tsx` | modify | switch + skip memory when off |
| `apps/web/src/app/(app)/conversation/prep/page.tsx` | modify | switch, kit memory, coverage write, delete cleanup, memory link |
| `apps/web/src/components/conversation/memory/PrepCoverageList.tsx` | new | patterns/words already taught |
| `apps/web/src/components/conversation/memory/TopicMemoryList.tsx` | modify | optional title / aria label / group link |
| `apps/web/src/app/(app)/conversation/memory/page.tsx` | modify | Chuẩn bị section |
| `apps/web/src/styles/bloom.css` | modify | switch hint layout |
| `README.md`, spec, `.superpowers/sdd/progress.md` | modify | docs |

---

### Task 1: Route kit scene memory to `prep_scene_memory`

**Files:**
- Modify: `apps/web/src/lib/learnerMemory.ts`
- Test: `apps/web/src/lib/learnerMemory.test.ts`

**Interfaces:**
- Consumes: existing `TopicMemory` type.
- Produces (all in `@/lib/learnerMemory`):
  - `isPrepGroupKey(key: string): boolean` — `true` for keys starting with `"prep_"`.
  - `getTopicMemory(uid, key)` — for `prep_<id>` reads `prep_scene_memory/<id>`, falling back to `conversation_memory/prep_<id>` when missing.
  - `saveTopicMemory(uid, memory)` — for `prep_` keys writes `prep_scene_memory/<id>` then deletes the legacy doc (failure ignored).
  - `deleteTopicMemory(uid, key)` — for `prep_` keys deletes both docs.
  - `deleteTopicFact(uid, key, factId)` — unchanged behaviour, routed.
  - `listTopicMemories(uid)` — excludes `prep_` groups.
  - `listPrepSceneMemories(uid): Promise<TopicMemory[]>` — new docs plus legacy `conversation_memory/prep_*` docs not shadowed by a new doc, newest `updatedAt` first.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/lib/learnerMemory.test.ts` (add `isPrepGroupKey` and `listPrepSceneMemories` to the existing import from `./learnerMemory`):

```ts
function scene(prepId: string, factIds: string[], updatedAt = "2026-01-01T00:00:00.000Z"): TopicMemory {
  return {
    key: `prep_${prepId}`, label: "Kit", updatedAt,
    facts: factIds.map((id) => ({ id, fact: "f", asked: [], updatedAt })),
  };
}

describe("prep scene memory routing", () => {
  it("recognises prep group keys", () => {
    expect(isPrepGroupKey("prep_p1")).toBe(true);
    expect(isPrepGroupKey("topic_travel")).toBe(false);
    expect(isPrepGroupKey("free")).toBe(false);
  });

  it("reads a kit's scene memory from prep_scene_memory", async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => true, data: () => scene("p1", ["a"]) } as never);
    expect(await getTopicMemory("u1", "prep_p1")).toEqual(scene("p1", ["a"]));
    expect(doc).toHaveBeenCalledWith("db", "users", "u1", "prep_scene_memory", "p1");
    expect(getDoc).toHaveBeenCalledTimes(1);
  });

  it("falls back to the legacy conversation_memory doc", async () => {
    vi.mocked(getDoc)
      .mockResolvedValueOnce({ exists: () => false } as never)
      .mockResolvedValueOnce({ exists: () => true, data: () => scene("p1", ["old"]) } as never);
    expect(await getTopicMemory("u1", "prep_p1")).toEqual(scene("p1", ["old"]));
    expect(doc).toHaveBeenCalledWith("db", "users", "u1", "conversation_memory", "prep_p1");
  });

  it("returns null when neither doc exists", async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    expect(await getTopicMemory("u1", "prep_p1")).toBeNull();
  });

  it("saves to prep_scene_memory and removes the legacy doc", async () => {
    await saveTopicMemory("u1", scene("p1", ["a"]));
    expect(doc).toHaveBeenCalledWith("db", "users", "u1", "prep_scene_memory", "p1");
    expect(setDoc).toHaveBeenCalledWith("ref", scene("p1", ["a"]));
    expect(doc).toHaveBeenCalledWith("db", "users", "u1", "conversation_memory", "prep_p1");
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it("still resolves when removing the legacy doc fails", async () => {
    vi.mocked(deleteDoc).mockRejectedValueOnce(new Error("nope"));
    await expect(saveTopicMemory("u1", scene("p1", ["a"]))).resolves.toBeUndefined();
  });

  it("keeps non-prep keys in conversation_memory", async () => {
    await saveTopicMemory("u1", topic(["a"]));
    expect(doc).toHaveBeenCalledWith("db", "users", "u1", "conversation_memory", "free");
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it("listTopicMemories leaves out prep groups", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [{ data: () => topic(["a"]) }, { data: () => scene("p1", ["b"]) }],
    } as never);
    expect((await listTopicMemories("u1")).map((m) => m.key)).toEqual(["free"]);
  });

  it("listPrepSceneMemories merges new and legacy docs, new wins, newest first", async () => {
    vi.mocked(getDocs)
      .mockResolvedValueOnce({
        docs: [{ data: () => scene("p1", ["new"], "2026-01-02T00:00:00.000Z") }],
      } as never)
      .mockResolvedValueOnce({
        docs: [
          { data: () => scene("p1", ["legacy"], "2026-01-01T00:00:00.000Z") },
          { data: () => scene("p2", ["legacy2"], "2026-01-03T00:00:00.000Z") },
          { data: () => topic(["a"]) },
        ],
      } as never);
    const list = await listPrepSceneMemories("u1");
    expect(list.map((m) => [m.key, m.facts[0].id])).toEqual([
      ["prep_p2", "legacy2"],
      ["prep_p1", "new"],
    ]);
    expect(collection).toHaveBeenCalledWith("db", "users", "u1", "prep_scene_memory");
  });

  it("deleteTopicMemory for a prep key removes the new and the legacy doc", async () => {
    await deleteTopicMemory("u1", "prep_p1");
    expect(deleteDoc).toHaveBeenCalledTimes(2);
    expect(doc).toHaveBeenCalledWith("db", "users", "u1", "prep_scene_memory", "p1");
    expect(doc).toHaveBeenCalledWith("db", "users", "u1", "conversation_memory", "prep_p1");
  });

  it("deleteTopicFact on the last prep fact removes both docs", async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => true, data: () => scene("p1", ["a"]) } as never);
    await deleteTopicFact("u1", "prep_p1", "a");
    expect(deleteDoc).toHaveBeenCalledTimes(2);
    expect(setDoc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/learnerMemory.test.ts`
Expected: FAIL — `isPrepGroupKey` / `listPrepSceneMemories` are not exported; routing assertions fail.

- [ ] **Step 3: Implement**

In `apps/web/src/lib/learnerMemory.ts`, add after `topicsCol`:

```ts
const PREP_PREFIX = "prep_";

/** Kit role-play memory (group key prep_<prepId>) lives in its own Chuẩn bị store. */
export function isPrepGroupKey(key: string): boolean {
  return key.startsWith(PREP_PREFIX);
}

function sceneRef(uid: string, key: string) {
  return doc(getFirebaseDb(), "users", uid, "prep_scene_memory", key.slice(PREP_PREFIX.length));
}

function scenesCol(uid: string) {
  return collection(getFirebaseDb(), "users", uid, "prep_scene_memory");
}

function toTopic(data: TopicMemory): TopicMemory {
  return { ...data, facts: data.facts ?? [] };
}
```

Replace `getTopicMemory`, `saveTopicMemory`, `listTopicMemories`, `deleteTopicFact` and `deleteTopicMemory` with:

```ts
export async function getTopicMemory(uid: string, key: string): Promise<TopicMemory | null> {
  if (isPrepGroupKey(key)) {
    const scene = await getDoc(sceneRef(uid, key));
    if (scene.exists()) return toTopic(scene.data() as TopicMemory);
    // Written before the memory split: still readable until the next save moves it.
  }
  const snap = await getDoc(topicRef(uid, key));
  if (!snap.exists()) return null;
  return toTopic(snap.data() as TopicMemory);
}

export async function saveTopicMemory(uid: string, memory: TopicMemory): Promise<void> {
  if (isPrepGroupKey(memory.key)) {
    await setDoc(sceneRef(uid, memory.key), memory);
    try {
      await deleteDoc(topicRef(uid, memory.key));
    } catch {
      // The legacy copy is only a leftover; failing to remove it never fails the save.
    }
    return;
  }
  await setDoc(topicRef(uid, memory.key), memory);
}

/** Hội thoại topic groups only; kit scene memory is listed by listPrepSceneMemories. */
export async function listTopicMemories(uid: string): Promise<TopicMemory[]> {
  const snap = await getDocs(query(topicsCol(uid), orderBy("updatedAt", "desc")));
  return snap.docs.map((d) => toTopic(d.data() as TopicMemory)).filter((m) => !isPrepGroupKey(m.key));
}

/** Kit role-play memory: the new store plus legacy conversation_memory/prep_* docs not yet moved. */
export async function listPrepSceneMemories(uid: string): Promise<TopicMemory[]> {
  const [scenes, legacy] = await Promise.all([
    getDocs(query(scenesCol(uid), orderBy("updatedAt", "desc"))),
    getDocs(query(topicsCol(uid), orderBy("updatedAt", "desc"))),
  ]);
  const fresh = scenes.docs.map((d) => toTopic(d.data() as TopicMemory));
  const freshKeys = new Set(fresh.map((m) => m.key));
  const old = legacy.docs
    .map((d) => toTopic(d.data() as TopicMemory))
    .filter((m) => isPrepGroupKey(m.key) && !freshKeys.has(m.key));
  return [...fresh, ...old].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
```

```ts
export async function deleteTopicFact(uid: string, key: string, factId: string): Promise<void> {
  const memory = await getTopicMemory(uid, key);
  if (!memory) return;
  const facts = memory.facts.filter((f) => f.id !== factId);
  if (facts.length === 0) {
    await deleteTopicMemory(uid, key);
    return;
  }
  await saveTopicMemory(uid, { ...memory, facts, updatedAt: new Date().toISOString() });
}

export async function deleteTopicMemory(uid: string, key: string): Promise<void> {
  if (isPrepGroupKey(key)) {
    await Promise.all([deleteDoc(sceneRef(uid, key)), deleteDoc(topicRef(uid, key))]);
    return;
  }
  await deleteDoc(topicRef(uid, key));
}
```

Note: `deleteTopicFact` on a prep group that only exists in the legacy doc saves through `saveTopicMemory`, which moves it to the new store — intended.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/learnerMemory.test.ts src/lib/learnerMemoryGrading.test.ts`
Expected: PASS (all, including the pre-existing tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/learnerMemory.ts apps/web/src/lib/learnerMemory.test.ts
git commit -m "feat(web): kit role-play memory lives in prep_scene_memory with a legacy fallback

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Coverage types, merge and storage

**Files:**
- Modify: `apps/web/src/lib/learnerMemoryTypes.ts`, `apps/web/src/lib/learnerMemoryMerge.ts`, `apps/web/src/lib/learnerMemory.ts`
- Test: `apps/web/src/lib/learnerMemoryMerge.test.ts`, `apps/web/src/lib/learnerMemory.test.ts`

**Interfaces:**
- Produces:
  - Types: `CoveredItem { text: string; lastSeenAt: string }`, `PrepCoverage { patterns: CoveredItem[]; words: CoveredItem[]; updatedAt: string }`; constants `MAX_COVERED_PATTERNS = 60`, `MAX_COVERED_WORDS = 120`, `KIT_TARGETS = 2`, `KIT_PROMPT_PATTERNS = 40`, `KIT_PROMPT_WORDS = 80`.
  - Merge: `coverageKey(text: string): string`, `applyCoverageUpdate(prev: PrepCoverage, kit: { patterns: string[]; words: string[] }, now: Date): PrepCoverage` (items newest `lastSeenAt` first), `removeCovered(items: CoveredItem[], text: string): CoveredItem[]`.
  - Storage: `getPrepCoverage(uid): Promise<PrepCoverage>` (empty when missing), `savePrepCoverage(uid, cov: PrepCoverage): Promise<void>`, `deleteCoveredItem(uid, kind: "patterns" | "words", text: string): Promise<void>`.

- [ ] **Step 1: Add the types**

Append to `apps/web/src/lib/learnerMemoryTypes.ts`:

```ts
export const MAX_COVERED_PATTERNS = 60;
export const MAX_COVERED_WORDS = 120;
/** Due mistakes woven into a new kit. */
export const KIT_TARGETS = 2;
/** How many of the most recent covered items the kit prompt sees. */
export const KIT_PROMPT_PATTERNS = 40;
export const KIT_PROMPT_WORDS = 80;

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
```

- [ ] **Step 2: Write the failing merge tests**

Append to `apps/web/src/lib/learnerMemoryMerge.test.ts` (import `applyCoverageUpdate`, `coverageKey`, `removeCovered` from `./learnerMemoryMerge` and `MAX_COVERED_PATTERNS`, `type PrepCoverage` from `./learnerMemoryTypes`):

```ts
const EMPTY_COVERAGE: PrepCoverage = { patterns: [], words: [], updatedAt: "" };

describe("coverage", () => {
  it("normalises case, whitespace and apostrophes for the dedupe key", () => {
    expect(coverageKey("  We’re  on TRACK to ")).toBe("we're on track to");
  });

  it("adds new items with now as lastSeenAt, newest first", () => {
    const now = new Date("2026-11-09T00:00:00.000Z");
    const out = applyCoverageUpdate(EMPTY_COVERAGE, { patterns: ["I'd like to ___"], words: ["behind schedule", " "] }, now);
    expect(out.patterns).toEqual([{ text: "I'd like to ___", lastSeenAt: now.toISOString() }]);
    expect(out.words).toEqual([{ text: "behind schedule", lastSeenAt: now.toISOString() }]);
    expect(out.updatedAt).toBe(now.toISOString());
  });

  it("refreshes a repeat instead of duplicating it and keeps the first spelling", () => {
    const prev: PrepCoverage = {
      patterns: [{ text: "We're on track to + V", lastSeenAt: "2026-01-01T00:00:00.000Z" }],
      words: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const now = new Date("2026-11-09T00:00:00.000Z");
    const out = applyCoverageUpdate(prev, { patterns: ["we’re ON track to + v"], words: [] }, now);
    expect(out.patterns).toEqual([{ text: "We're on track to + V", lastSeenAt: now.toISOString() }]);
  });

  it("drops the oldest items over the cap", () => {
    const prev: PrepCoverage = {
      patterns: Array.from({ length: MAX_COVERED_PATTERNS }, (_, i) => ({
        text: `p${i}`,
        lastSeenAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
      })),
      words: [],
      updatedAt: "",
    };
    const out = applyCoverageUpdate(prev, { patterns: ["new"], words: [] }, new Date("2026-11-09T00:00:00.000Z"));
    expect(out.patterns).toHaveLength(MAX_COVERED_PATTERNS);
    expect(out.patterns[0].text).toBe("new");
    expect(out.patterns.some((p) => p.text === "p0")).toBe(false);
  });

  it("removes an item by its normalised text", () => {
    const items = [{ text: "Behind schedule", lastSeenAt: "x" }, { text: "a heads-up", lastSeenAt: "x" }];
    expect(removeCovered(items, " behind  SCHEDULE")).toEqual([{ text: "a heads-up", lastSeenAt: "x" }]);
  });
});
```

- [ ] **Step 3: Write the failing storage tests**

Append to `apps/web/src/lib/learnerMemory.test.ts` (import `getPrepCoverage`, `savePrepCoverage`, `deleteCoveredItem`):

```ts
describe("prep coverage storage", () => {
  it("returns empty coverage when the doc is missing", async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false } as never);
    expect(await getPrepCoverage("u1")).toEqual({ patterns: [], words: [], updatedAt: "" });
    expect(doc).toHaveBeenCalledWith("db", "users", "u1", "prep_memory", "coverage");
  });

  it("defaults missing lists", async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => true, data: () => ({ updatedAt: "t" }) } as never);
    expect(await getPrepCoverage("u1")).toEqual({ patterns: [], words: [], updatedAt: "t" });
  });

  it("saves coverage as-is", async () => {
    const cov = { patterns: [{ text: "p", lastSeenAt: "t" }], words: [], updatedAt: "t" };
    await savePrepCoverage("u1", cov);
    expect(setDoc).toHaveBeenCalledWith("ref", cov);
  });

  it("deleteCoveredItem removes one word and keeps the patterns", async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        patterns: [{ text: "p", lastSeenAt: "t" }],
        words: [{ text: "Behind schedule", lastSeenAt: "t" }, { text: "a heads-up", lastSeenAt: "t" }],
        updatedAt: "t",
      }),
    } as never);
    await deleteCoveredItem("u1", "words", "behind schedule");
    expect(setDoc).toHaveBeenCalledWith("ref", {
      patterns: [{ text: "p", lastSeenAt: "t" }],
      words: [{ text: "a heads-up", lastSeenAt: "t" }],
      updatedAt: expect.any(String),
    });
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/lib/learnerMemoryMerge.test.ts src/lib/learnerMemory.test.ts`
Expected: FAIL — the new functions are not exported.

- [ ] **Step 5: Implement the merge helpers**

In `apps/web/src/lib/learnerMemoryMerge.ts`, extend the import from `./learnerMemoryTypes` with `MAX_COVERED_PATTERNS`, `MAX_COVERED_WORDS`, `type CoveredItem`, `type PrepCoverage`, and append:

```ts
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
```

- [ ] **Step 6: Implement the storage**

In `apps/web/src/lib/learnerMemory.ts`, extend the type import with `PrepCoverage`, add `import { removeCovered } from "./learnerMemoryMerge";`, and append:

```ts
function coverageRef(uid: string) {
  return doc(getFirebaseDb(), "users", uid, "prep_memory", "coverage");
}

export async function getPrepCoverage(uid: string): Promise<PrepCoverage> {
  const snap = await getDoc(coverageRef(uid));
  if (!snap.exists()) return { patterns: [], words: [], updatedAt: "" };
  const data = snap.data() as Partial<PrepCoverage>;
  return { patterns: data.patterns ?? [], words: data.words ?? [], updatedAt: data.updatedAt ?? "" };
}

export async function savePrepCoverage(uid: string, coverage: PrepCoverage): Promise<void> {
  await setDoc(coverageRef(uid), coverage);
}

export async function deleteCoveredItem(uid: string, kind: "patterns" | "words", text: string): Promise<void> {
  const coverage = await getPrepCoverage(uid);
  await savePrepCoverage(uid, { ...coverage, [kind]: removeCovered(coverage[kind], text), updatedAt: new Date().toISOString() });
}
```

Check there is no import cycle: `learnerMemoryMerge.ts` must not import `./learnerMemory` (it imports only `./sm2`, `./conversationScenarios`, `./conversationTypes`, `./learnerMemoryTypes`).

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/lib/learnerMemoryMerge.test.ts src/lib/learnerMemory.test.ts && npm run typecheck`
Expected: PASS; typecheck exits 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/learnerMemoryTypes.ts apps/web/src/lib/learnerMemoryMerge.ts apps/web/src/lib/learnerMemory.ts apps/web/src/lib/learnerMemoryMerge.test.ts apps/web/src/lib/learnerMemory.test.ts
git commit -m "feat(web): Chuẩn bị coverage memory (patterns and words already taught)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Kit memory helpers and the kit prompt

**Files:**
- Create: `apps/web/src/lib/prepMemory.ts`
- Modify: `apps/web/src/lib/conversationPrepPrompt.ts`, `apps/web/src/lib/conversationPrepTypes.ts`
- Test: `apps/web/src/lib/prepMemory.test.ts` (new), `apps/web/src/lib/conversationPrepPrompt.test.ts`

**Interfaces:**
- Consumes: `getPrepCoverage`, `savePrepCoverage`, `getMistakeMemory`, `deleteTopicMemory` (Tasks 1–2 / existing); `applyCoverageUpdate`, `pickTargets(items, max, now): MistakeTarget[]` from `./learnerMemoryMerge`; `KIT_TARGETS`, `KIT_PROMPT_PATTERNS`, `KIT_PROMPT_WORDS`.
- Produces:
  - `interface KitMemory { patterns: string[]; words: string[]; targets: MistakeTarget[] }`
  - `loadKitMemory(uid: string, now?: Date): Promise<KitMemory | undefined>` (undefined when a read fails)
  - `recordKitCoverage(uid: string, kit: { patterns: { pattern: string }[]; vocab: { text: string }[] }, now?: Date): Promise<void>` (never throws)
  - `deleteKitMemory(uid: string, prepId: string): Promise<void>` (never throws)
  - `buildPrepPrompt(situation: string, level: ConversationLevel, memory?: KitMemory): string`
  - `NewConversationPrep.usedMemory?: boolean`

- [ ] **Step 1: Add `usedMemory` to kits**

In `apps/web/src/lib/conversationPrepTypes.ts`, inside `interface NewConversationPrep`, add:

```ts
  /** Whether the AI saw learner memory when generating this kit (reference only). Missing on old kits. */
  usedMemory?: boolean;
```

- [ ] **Step 2: Write the failing tests**

`apps/web/src/lib/prepMemory.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteTopicMemory, getMistakeMemory, getPrepCoverage, savePrepCoverage } from "./learnerMemory";
import { deleteKitMemory, loadKitMemory, recordKitCoverage } from "./prepMemory";
import type { TrackedMistake } from "./learnerMemoryTypes";

vi.mock("./learnerMemory", () => ({
  getPrepCoverage: vi.fn(),
  savePrepCoverage: vi.fn(),
  getMistakeMemory: vi.fn(),
  deleteTopicMemory: vi.fn(),
}));

const NOW = new Date("2026-11-09T00:00:00.000Z");

function mistake(id: string, nextReviewAt: string): TrackedMistake {
  return {
    id, pattern: `p-${id}`, rule: "r", example: { said: "s", better: "b" }, source: "conversation",
    createdAt: "2026-01-01T00:00:00.000Z", lastSeenAt: "2026-01-01T00:00:00.000Z",
    sm2Repetitions: 0, sm2EaseFactor: 2.5, sm2Interval: 0, nextReviewAt,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("loadKitMemory", () => {
  it("returns the most recent covered items and up to 2 due mistakes", async () => {
    vi.mocked(getPrepCoverage).mockResolvedValueOnce({
      patterns: Array.from({ length: 45 }, (_, i) => ({ text: `p${i}`, lastSeenAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() })),
      words: [{ text: "w1", lastSeenAt: "2026-01-01T00:00:00.000Z" }],
      updatedAt: "x",
    });
    vi.mocked(getMistakeMemory).mockResolvedValueOnce({
      items: [mistake("a", "2026-01-01T00:00:00.000Z"), mistake("b", "2026-01-02T00:00:00.000Z"), mistake("c", "2026-01-03T00:00:00.000Z"), mistake("later", "2027-01-01T00:00:00.000Z")],
      updatedAt: "x",
    });
    const mem = await loadKitMemory("u1", NOW);
    expect(mem?.patterns).toHaveLength(40);
    expect(mem?.patterns[0]).toBe("p44");
    expect(mem?.patterns).not.toContain("p0");
    expect(mem?.words).toEqual(["w1"]);
    expect(mem?.targets.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("returns undefined when a read fails", async () => {
    vi.mocked(getPrepCoverage).mockRejectedValueOnce(new Error("offline"));
    vi.mocked(getMistakeMemory).mockResolvedValueOnce({ items: [], updatedAt: "" });
    expect(await loadKitMemory("u1", NOW)).toBeUndefined();
  });
});

describe("recordKitCoverage", () => {
  it("adds the kit's patterns and vocab to the coverage", async () => {
    vi.mocked(getPrepCoverage).mockResolvedValueOnce({ patterns: [], words: [], updatedAt: "" });
    await recordKitCoverage("u1", { patterns: [{ pattern: "I'd like to ___" }], vocab: [{ text: "behind schedule" }] }, NOW);
    expect(savePrepCoverage).toHaveBeenCalledWith("u1", {
      patterns: [{ text: "I'd like to ___", lastSeenAt: NOW.toISOString() }],
      words: [{ text: "behind schedule", lastSeenAt: NOW.toISOString() }],
      updatedAt: NOW.toISOString(),
    });
  });

  it("never throws", async () => {
    vi.mocked(getPrepCoverage).mockRejectedValueOnce(new Error("offline"));
    await expect(recordKitCoverage("u1", { patterns: [], vocab: [] }, NOW)).resolves.toBeUndefined();
    expect(savePrepCoverage).not.toHaveBeenCalled();
  });
});

describe("deleteKitMemory", () => {
  it("deletes the kit's scene memory group", async () => {
    await deleteKitMemory("u1", "p1");
    expect(deleteTopicMemory).toHaveBeenCalledWith("u1", "prep_p1");
  });

  it("never throws", async () => {
    vi.mocked(deleteTopicMemory).mockRejectedValueOnce(new Error("x"));
    await expect(deleteKitMemory("u1", "p1")).resolves.toBeUndefined();
  });
});
```

Append to `apps/web/src/lib/conversationPrepPrompt.test.ts`:

```ts
describe("buildPrepPrompt with kit memory", () => {
  const MEMORY = {
    patterns: ["I'd like to walk you through ___"],
    words: ["behind schedule"],
    targets: [{ id: "m1", pattern: "Sai thì quá khứ", rule: "Dùng V2 cho việc đã xảy ra.", example: { said: "I go there", better: "I went there" } }],
  };

  it("has no memory sections without memory", () => {
    const p = buildPrepPrompt("Báo cáo task A", "B1");
    expect(p).not.toContain("Already taught");
    expect(p).not.toContain("Practice targets");
  });

  it("lists covered items and forbids reusing them as main items", () => {
    const p = buildPrepPrompt("Báo cáo task A", "B1", MEMORY);
    expect(p).toContain("Already taught in this learner's earlier kits");
    expect(p).toContain("I'd like to walk you through ___");
    expect(p).toContain("behind schedule");
    expect(p).toContain('do NOT use these as this kit\'s "patterns" or "vocab" items');
  });

  it("turns each target into one pattern card without mentioning the mistake", () => {
    const p = buildPrepPrompt("Báo cáo task A", "B1", MEMORY);
    expect(p).toContain("Practice targets");
    expect(p).toContain('- Sai thì quá khứ: Dùng V2 cho việc đã xảy ra. (said "I go there", better "I went there")');
    expect(p).toContain("Turn EACH target into exactly one item");
    expect(p).toContain("Never say or hint that it is a past mistake");
  });

  it("skips empty memory parts", () => {
    const p = buildPrepPrompt("Báo cáo task A", "B1", { patterns: [], words: [], targets: [] });
    expect(p).not.toContain("Already taught");
    expect(p).not.toContain("Practice targets");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/prepMemory.test.ts src/lib/conversationPrepPrompt.test.ts`
Expected: FAIL — `./prepMemory` missing; memory sections absent.

- [ ] **Step 4: Implement `prepMemory.ts`**

`apps/web/src/lib/prepMemory.ts`:

```ts
import { deleteTopicMemory, getMistakeMemory, getPrepCoverage, savePrepCoverage } from "./learnerMemory";
import { applyCoverageUpdate, pickTargets } from "./learnerMemoryMerge";
import {
  KIT_PROMPT_PATTERNS,
  KIT_PROMPT_WORDS,
  KIT_TARGETS,
  type CoveredItem,
  type MistakeTarget,
} from "./learnerMemoryTypes";

/** What kit generation is told about the learner (only when "Dùng trí nhớ" is on). */
export interface KitMemory {
  patterns: string[];
  words: string[];
  targets: MistakeTarget[];
}

function mostRecent(items: CoveredItem[], max: number): string[] {
  return [...items].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, max).map((i) => i.text);
}

/** Coverage + due mistakes for a new kit; undefined when a read fails (the kit is then generated without memory). */
export async function loadKitMemory(uid: string, now: Date = new Date()): Promise<KitMemory | undefined> {
  try {
    const [coverage, mistakes] = await Promise.all([getPrepCoverage(uid), getMistakeMemory(uid)]);
    return {
      patterns: mostRecent(coverage.patterns, KIT_PROMPT_PATTERNS),
      words: mostRecent(coverage.words, KIT_PROMPT_WORDS),
      targets: pickTargets(mistakes.items, KIT_TARGETS, now),
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
```

- [ ] **Step 5: Add memory to the kit prompt**

In `apps/web/src/lib/conversationPrepPrompt.ts`, add `import type { KitMemory } from "./prepMemory";` and this helper above `buildPrepPrompt`:

```ts
function kitMemorySection(memory?: KitMemory): string {
  if (!memory) return "";
  const parts: string[] = [];
  if (memory.patterns.length > 0 || memory.words.length > 0) {
    parts.push(`Already taught in this learner's earlier kits (do NOT use these as this kit's "patterns" or "vocab" items; they may appear again inside the dialogue as natural review):
Patterns: ${memory.patterns.length > 0 ? memory.patterns.join(" | ") : "(none)"}
Words: ${memory.words.length > 0 ? memory.words.join(" | ") : "(none)"}`);
  }
  if (memory.targets.length > 0) {
    const lines = memory.targets
      .map((t) => `- ${t.pattern}: ${t.rule} (said "${t.example.said}", better "${t.example.better}")`)
      .join("\n");
    parts.push(`Practice targets — mistakes this learner keeps making:
${lines}
Turn EACH target into exactly one item in "patterns" whose "example" is a "you" line in the dialogue that uses the correct form. Never say or hint that it is a past mistake.`);
  }
  return parts.length > 0 ? `\n\n${parts.join("\n\n")}` : "";
}
```

Change the signature to `export function buildPrepPrompt(situation: string, level: ConversationLevel, memory?: KitMemory): string {` and in the template replace

```
SITUATION>>>

If this is not a usable
```

with

```
SITUATION>>>${kitMemorySection(memory)}

If this is not a usable
```

(`prepMemory.ts` imports nothing from `conversationPrepPrompt.ts`, so there is no cycle.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/prepMemory.test.ts src/lib/conversationPrepPrompt.test.ts && npm run typecheck`
Expected: PASS (new and pre-existing prompt tests); typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/prepMemory.ts apps/web/src/lib/prepMemory.test.ts apps/web/src/lib/conversationPrepPrompt.ts apps/web/src/lib/conversationPrepPrompt.test.ts apps/web/src/lib/conversationPrepTypes.ts
git commit -m "feat(web): kit generation can read Chuẩn bị memory and due mistakes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Contradiction rule in the report prompt

**Files:**
- Modify: `apps/web/src/lib/learnerMemoryPrompt.ts` (the `topicFacts` instruction inside `reportMemorySection`)
- Test: `apps/web/src/lib/learnerMemoryPrompt.test.ts`

**Interfaces:**
- Consumes/produces: `reportMemorySection(input: ReportMemoryInput, kind)` (existing; `ReportMemoryInput` has `tracked`, `facts: TopicFact[] | null`, optional `freeTopic`).

- [ ] **Step 1: Write the failing test**

Append inside `describe("reportMemorySection", …)` in `apps/web/src/lib/learnerMemoryPrompt.test.ts`:

```ts
  it("tells the grader to replace contradicted facts with the newer information", () => {
    const s = reportMemorySection({ tracked: [], facts: [FACT] }, "conversation");
    expect(s).toContain("Keep one line per subject");
    expect(s).toContain("replace the earlier fact with the newer information and never keep both versions");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/learnerMemoryPrompt.test.ts`
Expected: FAIL — text not found.

- [ ] **Step 3: Implement**

In `apps/web/src/lib/learnerMemoryPrompt.ts`, in the `topicFacts` instruction, change

```
each rewritten short, in English, at most 12.${keep}
```

to

```
each rewritten short, in English, at most 12. Keep one line per subject; when this session contradicts an earlier fact, replace the earlier fact with the newer information and never keep both versions.${keep}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/learnerMemoryPrompt.test.ts src/lib/conversationReportPrompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/learnerMemoryPrompt.ts apps/web/src/lib/learnerMemoryPrompt.test.ts
git commit -m "feat(web): grading replaces contradicted memory facts with the newer information

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Remembered "Dùng trí nhớ" switch

**Files:**
- Modify: `apps/web/src/lib/settings.ts`
- Create: `apps/web/src/lib/useMemoryPreference.ts`, `apps/web/src/components/shared/MemorySwitch.tsx`
- Modify: `apps/web/src/styles/bloom.css`
- Test: `apps/web/src/lib/settings.test.ts`, `apps/web/src/lib/useMemoryPreference.test.tsx` (new), `apps/web/src/components/shared/MemorySwitch.test.tsx` (new)

**Interfaces:**
- Consumes: `useSettingsContext()` → `{ settings: UserSettings | null; save(next: UserSettings): Promise<void>; … }`.
- Produces:
  - `UserSettings.memoryInConversation: boolean`, `memoryInInterview: boolean`, `memoryInPrep: boolean` (defaults `true`).
  - `type MemoryPreferenceField = "memoryInConversation" | "memoryInInterview" | "memoryInPrep"`
  - `useMemoryPreference(field): [boolean, (next: boolean) => void]`
  - `MemorySwitch(props: { checked: boolean; onChange(next: boolean): void; disabled?: boolean })`

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/lib/settings.test.ts` inside `describe("DEFAULT_SETTINGS", …)`:

```ts
  it("uses memory on every screen by default", () => {
    expect(DEFAULT_SETTINGS.memoryInConversation).toBe(true);
    expect(DEFAULT_SETTINGS.memoryInInterview).toBe(true);
    expect(DEFAULT_SETTINGS.memoryInPrep).toBe(true);
  });
```

`apps/web/src/lib/useMemoryPreference.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMemoryPreference } from "./useMemoryPreference";
import { useSettingsContext } from "./SettingsContext";
import { DEFAULT_SETTINGS } from "./settings";

vi.mock("./SettingsContext", () => ({ useSettingsContext: vi.fn() }));

const save = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  save.mockResolvedValue(undefined);
});

describe("useMemoryPreference", () => {
  it("reads the stored value and defaults to true without settings", () => {
    vi.mocked(useSettingsContext).mockReturnValue({ settings: { ...DEFAULT_SETTINGS, memoryInPrep: false }, loading: false, error: null, save });
    expect(renderHook(() => useMemoryPreference("memoryInPrep")).result.current[0]).toBe(false);
    vi.mocked(useSettingsContext).mockReturnValue({ settings: null, loading: true, error: null, save });
    expect(renderHook(() => useMemoryPreference("memoryInPrep")).result.current[0]).toBe(true);
  });

  it("shows the new value at once and saves it", () => {
    vi.mocked(useSettingsContext).mockReturnValue({ settings: DEFAULT_SETTINGS, loading: false, error: null, save });
    const { result } = renderHook(() => useMemoryPreference("memoryInConversation"));
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(save).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, memoryInConversation: false });
  });

  it("keeps the on-screen value when saving fails", async () => {
    save.mockRejectedValueOnce(new Error("offline"));
    vi.mocked(useSettingsContext).mockReturnValue({ settings: DEFAULT_SETTINGS, loading: false, error: null, save });
    const { result } = renderHook(() => useMemoryPreference("memoryInInterview"));
    await act(async () => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });
});
```

`apps/web/src/components/shared/MemorySwitch.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemorySwitch } from "./MemorySwitch";

describe("MemorySwitch", () => {
  it("shows the label and hint and reports changes", () => {
    const onChange = vi.fn();
    render(<MemorySwitch checked onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: /Dùng trí nhớ/ });
    expect(box).toBeChecked();
    expect(screen.getByText("AI dựa vào những gì đã học trước đó. Tắt vẫn ghi nhớ sau buổi.")).toBeInTheDocument();
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("can be disabled", () => {
    render(<MemorySwitch checked={false} onChange={vi.fn()} disabled />);
    expect(screen.getByRole("checkbox", { name: /Dùng trí nhớ/ })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/settings.test.ts src/lib/useMemoryPreference.test.tsx src/components/shared/MemorySwitch.test.tsx`
Expected: FAIL — fields, hook and component missing.

- [ ] **Step 3: Implement settings fields**

In `apps/web/src/lib/settings.ts`, add to `interface UserSettings`:

```ts
  /** Last "Dùng trí nhớ" choice on each start screen; missing in old docs = true. */
  memoryInConversation: boolean;
  memoryInInterview: boolean;
  memoryInPrep: boolean;
```

and to `DEFAULT_SETTINGS`:

```ts
  memoryInConversation: true,
  memoryInInterview: true,
  memoryInPrep: true,
```

`getSettings` already spreads `DEFAULT_SETTINGS` under the stored doc, so old docs get `true`. Run `npm run typecheck` now: any other place that builds a full `UserSettings` literal (tests or Settings page) must get the three fields; fix each by spreading `DEFAULT_SETTINGS` or adding the fields.

- [ ] **Step 4: Implement the hook**

`apps/web/src/lib/useMemoryPreference.ts`:

```ts
"use client";

import { useState } from "react";
import { useSettingsContext } from "./SettingsContext";

export type MemoryPreferenceField = "memoryInConversation" | "memoryInInterview" | "memoryInPrep";

/** The "Dùng trí nhớ" choice for one start screen, remembered in Settings. A failed save keeps the on-screen value. */
export function useMemoryPreference(field: MemoryPreferenceField): [boolean, (next: boolean) => void] {
  const { settings, save } = useSettingsContext();
  const [local, setLocal] = useState<boolean | null>(null);
  const value = local ?? settings?.[field] ?? true;

  function set(next: boolean) {
    setLocal(next);
    if (settings) void save({ ...settings, [field]: next }).catch(() => {});
  }

  return [value, set];
}
```

- [ ] **Step 5: Implement the component and its CSS**

`apps/web/src/components/shared/MemorySwitch.tsx`:

```tsx
export interface MemorySwitchProps {
  checked: boolean;
  onChange(next: boolean): void;
  disabled?: boolean;
}

export function MemorySwitch({ checked, onChange, disabled }: MemorySwitchProps) {
  return (
    <label className="iv-row iv-checkbox memory-switch">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="memory-switch-text">
        <span>Dùng trí nhớ</span>
        <span className="iv-muted">AI dựa vào những gì đã học trước đó. Tắt vẫn ghi nhớ sau buổi.</span>
      </span>
    </label>
  );
}
```

Append to the conversation/memory area of `apps/web/src/styles/bloom.css` (search for `.memory-section`; put these right after the last `.memory-*` rule):

```css
.memory-switch { align-items: flex-start; }
.memory-switch input { margin-top: 3px; }
.memory-switch-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/settings.test.ts src/lib/useMemoryPreference.test.tsx src/components/shared/MemorySwitch.test.tsx src/styles && npm run typecheck`
Expected: PASS; typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/settings.ts apps/web/src/lib/settings.test.ts apps/web/src/lib/useMemoryPreference.ts apps/web/src/lib/useMemoryPreference.test.tsx apps/web/src/components/shared/MemorySwitch.tsx apps/web/src/components/shared/MemorySwitch.test.tsx apps/web/src/styles/bloom.css
git add -u apps/web/src
git commit -m "feat(web): remembered Dùng trí nhớ switch (settings fields, hook, component)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git add -u apps/web/src` picks up any test/settings literals fixed in Step 3; check `git status` first that it adds nothing else, and never `apps/web/next-env.d.ts` — unstage it with `git restore --staged apps/web/next-env.d.ts` if it was added.)

---

### Task 6: Switch on Hội thoại and Phỏng vấn setup

**Files:**
- Modify: `apps/web/src/lib/conversationTypes.ts` (`ConversationSetup`), `apps/web/src/lib/interviewTypes.ts` (`InterviewSetup`)
- Modify: `apps/web/src/app/(app)/conversation/page.tsx`, `apps/web/src/app/(app)/interview/page.tsx`
- Test: `apps/web/src/app/(app)/conversation/page.test.tsx`, `apps/web/src/app/(app)/interview/page.test.tsx`

**Interfaces:**
- Consumes: `useMemoryPreference` + `MemorySwitch` (Task 5); `loadSessionSnapshot(uid, setup)` and `loadInterviewTargets(uid)` (existing).
- Produces: `ConversationSetup.useMemory?: boolean`, `InterviewSetup.useMemory?: boolean` (always written as booleans by these pages).

- [ ] **Step 1: Add the fields**

`apps/web/src/lib/conversationTypes.ts`, inside `interface ConversationSetup` (after `prepId?`):

```ts
  /** "Dùng trí nhớ" at Start. false = no memory snapshot (grading still writes memory). Missing on old sessions = true. */
  useMemory?: boolean;
```

`apps/web/src/lib/interviewTypes.ts`, inside `interface InterviewSetup`:

```ts
  /** "Dùng trí nhớ" at Start. false = no mistake targets (grading still writes memory). Missing on old sessions = true. */
  useMemory?: boolean;
```

- [ ] **Step 2: Write the failing tests**

In `apps/web/src/app/(app)/conversation/page.test.tsx`:
- Change the `beforeEach` settings mock to include `save`: `vi.mocked(useSettingsContext).mockReturnValue({ settings: DEFAULT_SETTINGS, loading: false, error: null, save: vi.fn().mockResolvedValue(undefined) } as never);`
- Add:

```tsx
  it("skips the memory snapshot when Dùng trí nhớ is off, and remembers the choice", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useSettingsContext).mockReturnValue({ settings: DEFAULT_SETTINGS, loading: false, error: null, save } as never);
    vi.mocked(createConversationSession).mockResolvedValueOnce("s1");
    render(<ConversationSetupPage />);
    fireEvent.change(screen.getByPlaceholderText(/chuẩn bị họp/), { target: { value: "Football" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Dùng trí nhớ/ }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ memoryInConversation: false }));
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu trò chuyện" }));
    await waitFor(() => expect(ROUTER.push).toHaveBeenCalledWith("/conversation/s1"));
    expect(loadSessionSnapshot).not.toHaveBeenCalled();
    expect(createConversationSession).toHaveBeenCalledWith("u1", expect.objectContaining({ useMemory: false }), undefined);
  });

  it("starts with the remembered choice and stores useMemory: true when on", async () => {
    vi.mocked(loadSessionSnapshot).mockResolvedValueOnce(undefined);
    vi.mocked(createConversationSession).mockResolvedValueOnce("s1");
    render(<ConversationSetupPage />);
    expect(screen.getByRole("checkbox", { name: /Dùng trí nhớ/ })).toBeChecked();
    fireEvent.change(screen.getByPlaceholderText(/chuẩn bị họp/), { target: { value: "Football" } });
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu trò chuyện" }));
    await waitFor(() => expect(ROUTER.push).toHaveBeenCalledWith("/conversation/s1"));
    expect(createConversationSession).toHaveBeenCalledWith("u1", expect.objectContaining({ useMemory: true }), undefined);
  });
```

In `apps/web/src/app/(app)/interview/page.test.tsx` add:

```tsx
  it("skips mistake targets when Dùng trí nhớ is off", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useAuthUser).mockReturnValue({ user: { uid: "u1" }, loading: false } as never);
    vi.mocked(useSettingsContext).mockReturnValue({ settings: { ...WITH_KEY, memoryInInterview: false }, loading: false, error: null, save });
    render(<InterviewSetupPage />);
    expect(screen.getByRole("checkbox", { name: /Dùng trí nhớ/ })).not.toBeChecked();
    fireEvent.change(screen.getByLabelText("Vị trí ứng tuyển"), { target: { value: "SE" } });
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu phỏng vấn" }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/interview/new-id"));
    expect(loadInterviewTargets).not.toHaveBeenCalled();
    expect(createInterviewSession).toHaveBeenCalledWith("u1", expect.objectContaining({ useMemory: false }), undefined);
  });
```

and in the existing "creates a session with the CV summary" test change the expected object to `expect.objectContaining({ role: "Software Engineer", cvSummary: "CV SUMMARY", questionCount: 5, useMemory: true })`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run "src/app/(app)/conversation/page.test.tsx" "src/app/(app)/interview/page.test.tsx"`
Expected: FAIL — no "Dùng trí nhớ" checkbox; `useMemory` missing.

- [ ] **Step 4: Implement the Hội thoại setup**

In `apps/web/src/app/(app)/conversation/page.tsx`:
- Imports: `import { useMemoryPreference } from "@/lib/useMemoryPreference";` and `import { MemorySwitch } from "@/components/shared/MemorySwitch";`
- In `ConversationSetupContent`, next to the other hooks before any early return: `const [useMemory, setUseMemory] = useMemoryPreference("memoryInConversation");`
- In `handleStart`, replace

```ts
      const finalSetup = prepId && setup.mode === "roleplay" ? { ...setup, prepId } : setup;
      const memory = await loadSessionSnapshot(user.uid, finalSetup);
```

with

```ts
      const withPrep = prepId && setup.mode === "roleplay" ? { ...setup, prepId } : setup;
      const finalSetup = { ...withPrep, useMemory };
      // Switch off: the AI sees no memory; grading still writes it.
      const memory = useMemory ? await loadSessionSnapshot(user.uid, finalSetup) : undefined;
```

- In the JSX, inside `<div className="iv-row iv-start-row">`, before the Start button, add `<MemorySwitch checked={useMemory} onChange={setUseMemory} disabled={starting} />`.

- [ ] **Step 5: Implement the Phỏng vấn setup**

In `apps/web/src/app/(app)/interview/page.tsx`:
- Same two imports; `const [useMemory, setUseMemory] = useMemoryPreference("memoryInInterview");` with the other hooks before early returns.
- In `handleStart`, replace

```ts
      const targets = await loadInterviewTargets(user.uid);
      const id = await createInterviewSession(
        user.uid,
        { ...draft, role: draft.role.trim(), jd: draft.jd.trim(), cvSummary: cv?.summary ?? null },
        targets
      );
```

with

```ts
      // Switch off: no mistake targets in the plan; grading still writes memory.
      const targets = useMemory ? await loadInterviewTargets(user.uid) : undefined;
      const id = await createInterviewSession(
        user.uid,
        { ...draft, role: draft.role.trim(), jd: draft.jd.trim(), cvSummary: cv?.summary ?? null, useMemory },
        targets
      );
```

- In the JSX, inside `<div className="iv-row iv-start-row">`, before the Start button, add `<MemorySwitch checked={useMemory} onChange={setUseMemory} disabled={starting} />`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run "src/app/(app)/conversation" "src/app/(app)/interview" && npm run typecheck`
Expected: PASS (new and existing tests in both folders); typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/conversationTypes.ts apps/web/src/lib/interviewTypes.ts "apps/web/src/app/(app)/conversation/page.tsx" "apps/web/src/app/(app)/conversation/page.test.tsx" "apps/web/src/app/(app)/interview/page.tsx" "apps/web/src/app/(app)/interview/page.test.tsx"
git commit -m "feat(web): Dùng trí nhớ switch on Hội thoại and Phỏng vấn setup

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Chuẩn bị create page — switch, kit memory, coverage, cleanup

**Files:**
- Modify: `apps/web/src/app/(app)/conversation/prep/page.tsx`
- Test: `apps/web/src/app/(app)/conversation/prep/page.test.tsx`

**Interfaces:**
- Consumes: `useMemoryPreference("memoryInPrep")`, `MemorySwitch` (Task 5); `loadKitMemory`, `recordKitCoverage`, `deleteKitMemory` (Task 3); `buildPrepPrompt(situation, level, memory?)` (Task 3).
- Produces: kits saved with `usedMemory: boolean`.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/app/(app)/conversation/prep/page.test.tsx`:
- Add the mock and import:

```tsx
import { deleteKitMemory, loadKitMemory, recordKitCoverage } from "@/lib/prepMemory";
vi.mock("@/lib/prepMemory", () => ({
  loadKitMemory: vi.fn(),
  recordKitCoverage: vi.fn(),
  deleteKitMemory: vi.fn(),
}));
```

- In `beforeEach`, make the settings mock include `save` (`{ settings: DEFAULT_SETTINGS, loading: false, error: null, save: vi.fn().mockResolvedValue(undefined) } as never`) and add `vi.mocked(loadKitMemory).mockResolvedValue(undefined); vi.mocked(recordKitCoverage).mockResolvedValue(); vi.mocked(deleteKitMemory).mockResolvedValue();`
- Add:

```tsx
  it("sends kit memory to the prompt, saves usedMemory and records coverage", async () => {
    vi.mocked(loadKitMemory).mockResolvedValueOnce({ patterns: ["I'd like to ___"], words: ["behind schedule"], targets: [] });
    vi.mocked(callInterviewAi).mockResolvedValueOnce(VALID);
    vi.mocked(createConversationPrep).mockResolvedValueOnce("p1");
    render(<ConversationPrepPage />);
    typeSituation("Báo cáo task A");
    fireEvent.click(screen.getByRole("button", { name: "Tạo kịch bản" }));
    await waitFor(() => expect(ROUTER.push).toHaveBeenCalledWith("/conversation/prep/p1"));
    expect(loadKitMemory).toHaveBeenCalledWith("u1");
    expect(vi.mocked(callInterviewAi).mock.calls[0][1]).toContain("Already taught in this learner's earlier kits");
    expect(createConversationPrep).toHaveBeenCalledWith("u1", expect.objectContaining({ usedMemory: true }));
    expect(recordKitCoverage).toHaveBeenCalledWith("u1", expect.objectContaining({ title: "Báo cáo" }));
  });

  it("with Dùng trí nhớ off: no memory read, usedMemory false, coverage still recorded", async () => {
    vi.mocked(callInterviewAi).mockResolvedValueOnce(VALID);
    vi.mocked(createConversationPrep).mockResolvedValueOnce("p1");
    render(<ConversationPrepPage />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Dùng trí nhớ/ }));
    typeSituation("Báo cáo task A");
    fireEvent.click(screen.getByRole("button", { name: "Tạo kịch bản" }));
    await waitFor(() => expect(ROUTER.push).toHaveBeenCalledWith("/conversation/prep/p1"));
    expect(loadKitMemory).not.toHaveBeenCalled();
    expect(vi.mocked(callInterviewAi).mock.calls[0][1]).not.toContain("Already taught");
    expect(createConversationPrep).toHaveBeenCalledWith("u1", expect.objectContaining({ usedMemory: false }));
    expect(recordKitCoverage).toHaveBeenCalled();
  });

  it("does not record coverage when saving the kit fails", async () => {
    vi.mocked(callInterviewAi).mockResolvedValueOnce(VALID);
    vi.mocked(createConversationPrep).mockRejectedValueOnce(new Error("offline"));
    render(<ConversationPrepPage />);
    typeSituation("Báo cáo task A");
    fireEvent.click(screen.getByRole("button", { name: "Tạo kịch bản" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không lưu được bộ tài liệu");
    expect(recordKitCoverage).not.toHaveBeenCalled();
  });

  it("removes a deleted kit's memory", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteConversationPrep).mockResolvedValueOnce();
    render(<ConversationPrepPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Xoá Kỷ niệm Đà Lạt" }));
    await waitFor(() => expect(deleteKitMemory).toHaveBeenCalledWith("u1", "p9"));
  });

  it("links to the memory page", () => {
    render(<ConversationPrepPage />);
    expect(screen.getByRole("link", { name: /AI nhớ gì về bạn/ })).toHaveAttribute("href", "/conversation/memory");
  });
```

(`VALID`, `RECENT`, `typeSituation`, `ROUTER` already exist in this file; `RECENT[0]` is `{ id: "p9", title: "Kỷ niệm Đà Lạt", … }`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "src/app/(app)/conversation/prep/page.test.tsx"`
Expected: FAIL — no checkbox, no memory calls, no link.

- [ ] **Step 3: Implement**

In `apps/web/src/app/(app)/conversation/prep/page.tsx`:
- Imports: `import { useMemoryPreference } from "@/lib/useMemoryPreference";`, `import { MemorySwitch } from "@/components/shared/MemorySwitch";`, `import { deleteKitMemory, loadKitMemory, recordKitCoverage } from "@/lib/prepMemory";`
- With the other hooks (before early returns): `const [useMemory, setUseMemory] = useMemoryPreference("memoryInPrep");`
- In `handleCreate`, replace the AI branch

```ts
      if (!pending || pending.situation !== text || pending.level !== level) {
        const content = parsePrep(await callInterviewAi(settings, buildPrepPrompt(text, level)), text);
        pending = { ...content, situation: text, level };
        pendingRef.current = pending;
      }
      phase = "save";
      const id = await createConversationPrep(user.uid, pending);
      pendingRef.current = null;
      router.push(`/conversation/prep/${id}`);
```

with

```ts
      if (!pending || pending.situation !== text || pending.level !== level) {
        // Switch off (or a failed read): the kit is generated without memory.
        const memory = useMemory ? await loadKitMemory(user.uid) : undefined;
        const content = parsePrep(await callInterviewAi(settings, buildPrepPrompt(text, level, memory)), text);
        pending = { ...content, situation: text, level, usedMemory: memory !== undefined };
        pendingRef.current = pending;
      }
      phase = "save";
      const id = await createConversationPrep(user.uid, pending);
      pendingRef.current = null;
      // What this kit taught is remembered whatever the switch says; best-effort, never awaited by navigation.
      void recordKitCoverage(user.uid, pending);
      router.push(`/conversation/prep/${id}`);
```

- In `handleDelete`, after `setRecent(...)` on success add `void deleteKitMemory(user.uid, id);`
- In the form JSX, right after the level-picker group (`role="group" aria-label="Trình độ"`), add `<MemorySwitch checked={useMemory} onChange={setUseMemory} disabled={generating} />`.
- Under the `scr-sub` paragraph at the top of the page add:

```tsx
      <p className="iv-muted">
        <Link href="/conversation/memory">AI nhớ gì về bạn</Link>
      </p>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "src/app/(app)/conversation/prep" && npm run typecheck`
Expected: PASS (new and existing prep tests); typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/conversation/prep/page.tsx" "apps/web/src/app/(app)/conversation/prep/page.test.tsx"
git commit -m "feat(web): Chuẩn bị kits use and record their own memory, with a Dùng trí nhớ switch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Memory page — Chuẩn bị tình huống section

**Files:**
- Create: `apps/web/src/components/conversation/memory/PrepCoverageList.tsx`
- Modify: `apps/web/src/components/conversation/memory/TopicMemoryList.tsx`, `apps/web/src/app/(app)/conversation/memory/page.tsx`
- Test: `apps/web/src/app/(app)/conversation/memory/page.test.tsx`

**Interfaces:**
- Consumes: `getPrepCoverage`, `deleteCoveredItem`, `listPrepSceneMemories`, `deleteTopicFact`, `deleteTopicMemory` (Tasks 1–2); `CoveredItem`, `PrepCoverage`.
- Produces:
  - `PrepCoverageList(props: { coverage: PrepCoverage; onDelete(kind: "patterns" | "words", text: string): void })` — renders nothing when both lists are empty; section aria-label "Chuẩn bị tình huống — đã học".
  - `TopicMemoryList` gains optional `title?: string` (default "Nội dung đã kể") and `groupHref?: (key: string) => string | null`.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/app/(app)/conversation/memory/page.test.tsx`:
- Extend the `@/lib/learnerMemory` mock with `getPrepCoverage: vi.fn(), deleteCoveredItem: vi.fn(), listPrepSceneMemories: vi.fn(),` and import them.
- Extend `load()` so it also sets

```tsx
  vi.mocked(getPrepCoverage).mockResolvedValue(COVERAGE);
  vi.mocked(listPrepSceneMemories).mockResolvedValue(SCENES);
```

with the parameters `coverage = COVERAGE, scenes = SCENES` added to `load`'s signature, and these fixtures:

```tsx
const COVERAGE = {
  patterns: [{ text: "I'd like to walk you through ___", lastSeenAt: "2026-11-05T00:00:00.000Z" }],
  words: [{ text: "behind schedule", lastSeenAt: "2026-11-05T00:00:00.000Z" }],
  updatedAt: "2026-11-05T00:00:00.000Z",
};
const SCENES: TopicMemory[] = [
  {
    key: "prep_p1",
    label: "Báo cáo trễ tiến độ",
    updatedAt: "2026-11-05T00:00:00.000Z",
    facts: [{ id: "s1", fact: "Told the client the task is 3 days late", asked: ["cause"], updatedAt: "2026-11-05T00:00:00.000Z" }],
  },
];
```

- Add:

```tsx
  it("shows what Chuẩn bị kits taught and the kit role-play memory with a link to the kit", async () => {
    load();
    render(<MemoryPage />);
    const taught = await screen.findByRole("region", { name: "Chuẩn bị tình huống — đã học" });
    expect(within(taught).getByText("I'd like to walk you through ___")).toBeInTheDocument();
    expect(within(taught).getByText("behind schedule")).toBeInTheDocument();
    const scenes = screen.getByRole("region", { name: "Chuẩn bị tình huống — diễn biến nhập vai" });
    expect(within(scenes).getByText("Told the client the task is 3 days late")).toBeInTheDocument();
    expect(within(scenes).getByRole("link", { name: "Báo cáo trễ tiến độ" })).toHaveAttribute("href", "/conversation/prep/p1");
  });

  it("deletes a taught word after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteCoveredItem).mockResolvedValueOnce();
    load();
    render(<MemoryPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Xoá: behind schedule" }));
    await waitFor(() => expect(screen.queryByText("behind schedule")).not.toBeInTheDocument());
    expect(deleteCoveredItem).toHaveBeenCalledWith("u1", "words", "behind schedule");
  });

  it("deletes a kit scene fact", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteTopicFact).mockResolvedValueOnce();
    load();
    render(<MemoryPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Xoá: Told the client the task is 3 days late" }));
    await waitFor(() => expect(deleteTopicFact).toHaveBeenCalledWith("u1", "prep_p1", "s1"));
  });

  it("shows the empty state only when every store is empty", async () => {
    load([], [], { patterns: [], words: [], updatedAt: "" }, []);
    render(<MemoryPage />);
    expect(await screen.findByText(/Chưa có gì ở đây/)).toBeInTheDocument();
  });
```

If an existing test in this file asserts the exact old empty-state sentence, update it to the new text in Step 3. If an existing test counts all "Xoá" buttons or all regions, give its `load()` call empty coverage and scenes (`load(MISTAKES, TOPICS, { patterns: [], words: [], updatedAt: "" }, [])`) instead of changing its expected count.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "src/app/(app)/conversation/memory/page.test.tsx"`
Expected: FAIL — no Chuẩn bị regions.

- [ ] **Step 3: Implement**

`apps/web/src/components/conversation/memory/PrepCoverageList.tsx`:

```tsx
import type { CoveredItem, PrepCoverage } from "@/lib/learnerMemoryTypes";

function Rows({ items, kind, onDelete }: { items: CoveredItem[]; kind: "patterns" | "words"; onDelete(kind: "patterns" | "words", text: string): void }) {
  return (
    <>
      {items.map((item) => (
        <div key={item.text} className="iv-recent-row memory-row">
          <span className="iv-recent-main memory-main">
            <span>{item.text}</span>
          </span>
          <button
            type="button"
            className="btn-secondary memory-delete"
            aria-label={`Xoá: ${item.text}`}
            onClick={() => {
              if (window.confirm("Xoá mục này? Bộ tài liệu sau có thể dạy lại nó.")) onDelete(kind, item.text);
            }}
          >
            Xoá
          </button>
        </div>
      ))}
    </>
  );
}

export function PrepCoverageList({ coverage, onDelete }: { coverage: PrepCoverage; onDelete(kind: "patterns" | "words", text: string): void }) {
  if (coverage.patterns.length === 0 && coverage.words.length === 0) return null;
  return (
    <section className="iv-card memory-section" aria-label="Chuẩn bị tình huống — đã học">
      <h3 className="iv-card-title">Chuẩn bị tình huống — đã học</h3>
      {coverage.patterns.length > 0 && (
        <div className="memory-group">
          <h4 className="memory-group-title">Mẫu câu đã học</h4>
          <Rows items={coverage.patterns} kind="patterns" onDelete={onDelete} />
        </div>
      )}
      {coverage.words.length > 0 && (
        <div className="memory-group">
          <h4 className="memory-group-title">Từ đã học</h4>
          <Rows items={coverage.words} kind="words" onDelete={onDelete} />
        </div>
      )}
    </section>
  );
}
```

`TopicMemoryList.tsx`: add `import Link from "next/link";`, extend the props with `title = "Nội dung đã kể"` and `groupHref`, use `aria-label={title}` and `{title}` in the `h3`, and render the group title as a link when `groupHref?.(g.key)` returns a string:

```tsx
            <h4 className="memory-group-title">
              {groupHref?.(g.key) ? <Link href={groupHref(g.key) as string}>{g.label}</Link> : g.label}
            </h4>
```

`memory/page.tsx`:
- Import `deleteCoveredItem`, `getPrepCoverage`, `listPrepSceneMemories` and `PrepCoverage`; import `PrepCoverageList`.
- State: `const [coverage, setCoverage] = useState<PrepCoverage>({ patterns: [], words: [], updatedAt: "" });` and `const [scenes, setScenes] = useState<TopicMemory[]>([]);`
- Load all four in the effect: `Promise.all([getMistakeMemory(user.uid), listTopicMemories(user.uid), getPrepCoverage(user.uid), listPrepSceneMemories(user.uid)])` and set each.
- `empty` becomes `loaded && mistakes.length === 0 && topics.length === 0 && coverage.patterns.length === 0 && coverage.words.length === 0 && scenes.length === 0`, and the empty text "Chưa có gì ở đây. Bộ nhớ sẽ đầy dần sau khi bạn hoàn thành và chấm điểm một buổi Hội thoại hoặc Phỏng vấn, hoặc tạo một bộ Chuẩn bị tình huống."
- After the existing `<TopicMemoryList … />`, add:

```tsx
      <PrepCoverageList
        coverage={coverage}
        onDelete={(kind, text) =>
          void run(
            () => deleteCoveredItem(uid, kind, text),
            () => setCoverage((c) => ({ ...c, [kind]: c[kind].filter((i) => i.text !== text) }))
          )
        }
      />
      <TopicMemoryList
        title="Chuẩn bị tình huống — diễn biến nhập vai"
        groups={scenes}
        groupHref={(key) => `/conversation/prep/${key.replace(/^prep_/, "")}`}
        onDeleteFact={(key, factId) =>
          void run(
            () => deleteTopicFact(uid, key, factId),
            () =>
              setScenes((l) =>
                l.map((g) => (g.key === key ? { ...g, facts: g.facts.filter((f) => f.id !== factId) } : g)).filter((g) => g.facts.length > 0)
              )
          )
        }
        onDeleteGroup={(key) =>
          void run(() => deleteTopicMemory(uid, key), () => setScenes((l) => l.filter((g) => g.key !== key)))
        }
      />
```

(A scene group whose kit was deleted still links to the kit page, which shows "Không tìm thấy bộ tài liệu"; the group stays deletable.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "src/app/(app)/conversation/memory" src/components/conversation && npm run typecheck`
Expected: PASS; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/conversation/memory/PrepCoverageList.tsx apps/web/src/components/conversation/memory/TopicMemoryList.tsx "apps/web/src/app/(app)/conversation/memory/page.tsx" "apps/web/src/app/(app)/conversation/memory/page.test.tsx"
git commit -m "feat(web): memory page shows Chuẩn bị tình huống memory

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Docs

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-11-09-memory-split-design.md`, `.superpowers/sdd/progress.md`

- [ ] **Step 1: README**

- In the "Trí nhớ người học" feature bullet (search `**Trí nhớ người học`), append: "Bộ nhớ chia hai: Hội thoại/Phỏng vấn (chuyện thật bạn kể) và Chuẩn bị tình huống (mẫu câu, từ đã học qua các bộ và diễn biến nhập vai của từng bộ); danh sách lỗi hay mắc dùng chung. Mỗi màn bắt đầu có công tắc **Dùng trí nhớ** (tắt thì AI không thấy trí nhớ, nhưng vẫn ghi nhớ sau buổi)."
- In the Chuẩn bị tình huống bullet, append: "Bộ mới tránh lặp mẫu câu/từ đã học và lồng 1–2 lỗi hay mắc đang đến hạn thành thẻ mẫu câu."
- In "Cấu trúc Firestore", after `conversation_memory/` add:

```
    prep_memory/
      coverage                 # Chuẩn bị: patterns[{text, lastSeenAt}] (≤60), words[{text, lastSeenAt}] (≤120), updatedAt
    prep_scene_memory/         # Diễn biến nhập vai theo từng bộ Chuẩn bị (thay cho conversation_memory/prep_*)
      {prepId}/
        key (prep_<prepId>), label, facts[{id, fact, asked[], updatedAt}] (≤12), updatedAt
```

and add `memoryInConversation, memoryInInterview, memoryInPrep (bool)` wherever the settings doc fields are listed (if they are not listed, skip).
- Under Roadmap "Việc cần làm tiếp", add a block "**Việc cần làm tiếp (tách bộ nhớ + Dùng trí nhớ, 2026-11-09):**" with:
  - `- [ ] **Chạy thật với AI key** — tạo hai bộ Chuẩn bị gần chủ đề: bộ thứ hai không lặp mẫu câu chính; một lỗi đang đến hạn thành một thẻ mẫu câu; nhập vai từ một bộ hai lần: lần hai đi tiếp cảnh cũ; sau đó phần Hội thoại trên trang "AI nhớ gì về bạn" không có chi tiết bịa từ nhập vai.`
  - `- [ ] **Tắt Dùng trí nhớ** — trên cả ba màn: AI không nhắc gì từ trí nhớ, nhưng sau khi chấm/tạo bộ trang "AI nhớ gì về bạn" vẫn cập nhật; lựa chọn được nhớ ở lần mở sau (cả trên máy khác).`
  - `- [ ] **iPhone** — công tắc Dùng trí nhớ và phần Chuẩn bị tình huống trên trang trí nhớ không tràn ngang, nút Xoá ≥ 44px.`

- [ ] **Step 2: Spec deviations**

In the spec, mark Status "Implemented (2026-11-09)." and add a "## 11. Deviations from this spec" section:
- The switch is a checkbox in the existing `iv-checkbox` style (the web app has no `BloomSwitch`; that is a Flutter widget).
- Coverage items use one shape `{ text, lastSeenAt }` for both patterns and words (instead of `CoveredPattern.pattern` / `CoveredWord.text`).
- The kit scene block on the memory page always links to the kit page; for a deleted kit that page shows "Không tìm thấy bộ tài liệu".

- [ ] **Step 3: Progress log**

Append to `.superpowers/sdd/progress.md` a "## 2026-11-09 — Memory split + Chuẩn bị memory + Dùng trí nhớ" section listing the spec and plan paths, the new Firestore paths, the lazy legacy migration, and that deploy is web-only (App Hosting push).

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-11-09-memory-split-design.md .superpowers/sdd/progress.md
git commit -m "docs: README, spec status and progress log for the memory split

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
