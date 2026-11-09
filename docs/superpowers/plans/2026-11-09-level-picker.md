# Cumulative Weighted Level Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every web CEFR picker means "Tất cả" (all levels, evenly) or "Tối đa X" (X and lower, weighted toward X); AI-written content follows the same rule; the shared dropdown popover stops overflowing the right edge.

**Architecture:** A pure helper module `lib/levelChoice.ts` holds weights, weighted ordering, random level picks and the prompt sentence. `selectSessionWords` uses the weighted order. Hội thoại / Chuẩn bị store `levelMode` next to a concrete `level`; a shared `LevelPicker` renders "Tất cả" + "Tối đa X" chips. Nghe and Đọc keep their URL params and only change labels, prompt text and Nghe's no-level default. `SimpleDropdown` measures space and right-aligns its popover when needed.

**Tech Stack:** Next.js 16 client components, React, TypeScript, Vitest + Testing Library (jsdom), plain CSS in `apps/web/src/styles/bloom.css`.

**Spec:** `docs/superpowers/specs/2026-11-09-level-picker-design.md`

## Global Constraints

- Web only (`apps/web/`). Branch `feat/level-picker` (cut from `feat/memory-split`).
- Weight of a level for "Tối đa X" = its 1-based position counted from the lowest level of the screen's scale up to X (A1–C2 scale: "Tối đa B2" → A1:A2:B1:B2 = 1:2:3:4; A2–C1 scale: "Tối đa B2" → A2:B1:B2 = 1:2:3). Levels above X never appear. Unknown levels weigh 1.
- "Tất cả" for word picking = uniform; for AI-generated content = one level picked uniformly at random from the screen's scale at generation time, stored as a concrete level.
- Prompt sentence for "max"/"all", exactly: `Write mainly at CEFR <X>. About a quarter of the sentences and words may be easier, for variety. Never go above CEFR <X>.` (`<X>` upper-case, e.g. `B2`).
- `ConversationSetup.levelMode?` and `NewConversationPrep.levelMode?` are `"max" | "all"`; missing = exact (legacy prompt unchanged). New sessions/kits always write `levelMode` (never `undefined`).
- Copy: "Tất cả", "Tối đa A2" … "Tối đa C2" (upper-case level). "Mọi trình độ" disappears.
- Every `font-size` in `bloom.css` is `calc(Npx * var(--type-scale))` (N ≥ 15) or `max(var(--type-min), calc(Npx * var(--type-scale)))` (N < 15); enforced by `src/styles/bloom.fontSize.test.ts`. Tap targets ≥ 44px on phones.
- Never stage `apps/web/next-env.d.ts` or `.superpowers/sdd/progress.md` (except in the docs task).
- Do not start background processes. Commands from `apps/web/`: `npx vitest run "<path>"`, `npm test`, `npm run typecheck`. Known flaky under load in full runs: vocab-bank, interview/[id], reading/part6, reading/part7 page tests (rerun alone if only those fail).
- Commit messages end with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

---

### Task 1: `levelChoice` helpers

**Files:**
- Create: `apps/web/src/lib/levelChoice.ts`, `apps/web/src/lib/levelChoice.test.ts`

**Interfaces (Produces):**
- `type LevelMode = "max" | "all"`
- `levelWeight<T>(scale: readonly T[], level: T, max: T): number` — position+1 for levels at or below `max`, `0` above `max`, `1` when `level` is not in `scale`.
- `weightedOrder<T>(items: T[], weightOf: (item: T) => number, random?: () => number): T[]` — random order without replacement, each pick proportional to weight among the remaining items; items with weight 0 are dropped.
- `pickRandomLevel<T>(scale: readonly T[], random?: () => number): T`
- `levelMixSentence(level: string): string` — the exact Global Constraints sentence.

- [ ] **Step 1: Write the failing tests** — `apps/web/src/lib/levelChoice.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { levelMixSentence, levelWeight, pickRandomLevel, weightedOrder } from "./levelChoice";

const SCALE = ["a1", "a2", "b1", "b2", "c1", "c2"] as const;

function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("levelWeight", () => {
  it("weighs levels by position up to the ceiling and drops levels above it", () => {
    expect(SCALE.map((l) => levelWeight(SCALE, l, "b2"))).toEqual([1, 2, 3, 4, 0, 0]);
  });
  it("counts from the lowest level of a shorter scale", () => {
    const short = ["A2", "B1", "B2", "C1"] as const;
    expect(short.map((l) => levelWeight(short, l, "B2"))).toEqual([1, 2, 3, 0]);
  });
  it("gives unknown levels weight 1", () => {
    expect(levelWeight<string>(SCALE, "zz", "b2")).toBe(1);
  });
});

describe("weightedOrder", () => {
  it("drops zero-weight items and keeps every other item once", () => {
    const out = weightedOrder(["a", "b", "c"], (x) => (x === "b" ? 0 : 1), seq([0.5]));
    expect(out.sort()).toEqual(["a", "c"]);
  });
  it("picks proportionally to weight: low random hits the first item, high random the heavy one", () => {
    // weights a=1, b=3 → total 4; r=0.1 → 0.4 < 1 → "a"; r=0.9 → 3.6 ≥ 1 → "b"
    expect(weightedOrder(["a", "b"], (x) => (x === "a" ? 1 : 3), seq([0.1]))[0]).toBe("a");
    expect(weightedOrder(["a", "b"], (x) => (x === "a" ? 1 : 3), seq([0.9]))[0]).toBe("b");
  });
  it("favours heavier items over many runs", () => {
    let rnd = 42;
    const random = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
    let heavyFirst = 0;
    for (let i = 0; i < 2000; i++) {
      if (weightedOrder(["light", "heavy"], (x) => (x === "heavy" ? 4 : 1), random)[0] === "heavy") heavyFirst++;
    }
    expect(heavyFirst / 2000).toBeGreaterThan(0.72);
    expect(heavyFirst / 2000).toBeLessThan(0.88);
  });
});

describe("pickRandomLevel", () => {
  it("stays inside the scale", () => {
    expect(pickRandomLevel(SCALE, () => 0)).toBe("a1");
    expect(pickRandomLevel(SCALE, () => 0.999999)).toBe("c2");
    expect(pickRandomLevel(SCALE, () => 0.5)).toBe("b2");
  });
});

describe("levelMixSentence", () => {
  it("is the shared instruction with the level upper-cased", () => {
    expect(levelMixSentence("b2")).toBe(
      "Write mainly at CEFR B2. About a quarter of the sentences and words may be easier, for variety. Never go above CEFR B2."
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/levelChoice.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — `apps/web/src/lib/levelChoice.ts`:

```ts
export type LevelMode = "max" | "all";

/** "Tối đa X" weight: 1-based position from the bottom of the scale; 0 above X; 1 when unknown. */
export function levelWeight<T>(scale: readonly T[], level: T, max: T): number {
  const index = scale.indexOf(level);
  if (index < 0) return 1;
  const maxIndex = scale.indexOf(max);
  if (maxIndex >= 0 && index > maxIndex) return 0;
  return index + 1;
}

/** Random order without replacement; each pick is proportional to weight among the remaining items. */
export function weightedOrder<T>(items: T[], weightOf: (item: T) => number, random: () => number = Math.random): T[] {
  const pool = items.map((item) => ({ item, weight: weightOf(item) })).filter((e) => e.weight > 0);
  const out: T[] = [];
  while (pool.length > 0) {
    const total = pool.reduce((sum, e) => sum + e.weight, 0);
    let r = random() * total;
    let index = 0;
    while (index < pool.length - 1 && r >= pool[index].weight) {
      r -= pool[index].weight;
      index++;
    }
    out.push(pool[index].item);
    pool.splice(index, 1);
  }
  return out;
}

export function pickRandomLevel<T>(scale: readonly T[], random: () => number = Math.random): T {
  return scale[Math.min(scale.length - 1, Math.floor(random() * scale.length))];
}

/** The instruction every "Tối đa X" / "Tất cả" AI prompt adds. */
export function levelMixSentence(level: string): string {
  const x = level.toUpperCase();
  return `Write mainly at CEFR ${x}. About a quarter of the sentences and words may be easier, for variety. Never go above CEFR ${x}.`;
}
```

- [ ] **Step 4: Run to verify it passes** — same command → PASS. `npm run typecheck` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/levelChoice.ts apps/web/src/lib/levelChoice.test.ts
git commit -m "feat(web): level choice helpers (weights, weighted order, random level, prompt sentence)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Weighted word picking + "Tất cả" label (Ôn tập, Luyện đọc)

**Files:**
- Modify: `apps/web/src/lib/practiceSession.ts`, `apps/web/src/app/(app)/practice/page.tsx` (lines ~30, ~250), `apps/web/src/app/(app)/reading/page.tsx` (lines ~22, ~163)
- Test: `apps/web/src/lib/practiceSession.test.ts`, `apps/web/src/app/(app)/practice/page.test.tsx`, `apps/web/src/app/(app)/reading/page.test.tsx`

**Interfaces:**
- Consumes: `levelWeight`, `weightedOrder` (Task 1); `CEFR_ORDER` (existing).
- Produces: `selectSessionWords(records, filters, now?, random?: () => number)` — same result set/rules, pool order weighted when `filters.maxCefr` is set.

- [ ] **Step 1: Write the failing tests** — append to `describe("selectSessionWords", …)` in `apps/web/src/lib/practiceSession.test.ts` (the file's builder is `makeRecord(overrides)`; `id` and `cefrLevel` go in the overrides):

```ts
  it("with a maximum level, orders the pool so words nearer the maximum tend to come first", () => {
    const words = [
      makeRecord({ id: "easy", cefrLevel: "a1", nextReviewAt: null }),
      makeRecord({ id: "hard", cefrLevel: "b2", nextReviewAt: null }),
    ];
    // weights a1=1, b2=4 → total 5; r=0.3 → 1.5 ≥ 1 → "hard" first
    const out = selectSessionWords(words, { topicIds: new Set(), maxCefr: "b2", count: null }, new Date(), () => 0.3);
    expect(out.map((r) => r.id)).toEqual(["hard", "easy"]);
    // r=0.1 → 0.5 < 1 → "easy" first
    const low = selectSessionWords(words, { topicIds: new Set(), maxCefr: "b2", count: null }, new Date(), () => 0.1);
    expect(low.map((r) => r.id)).toEqual(["easy", "hard"]);
  });

  it("with a maximum level and a count, still returns only allowed due words", () => {
    const words = [
      makeRecord({ id: "a", cefrLevel: "a1", nextReviewAt: null }),
      makeRecord({ id: "b", cefrLevel: "b1", nextReviewAt: null }),
      makeRecord({ id: "too-hard", cefrLevel: "c1", nextReviewAt: null }),
    ];
    const out = selectSessionWords(words, { topicIds: new Set(), maxCefr: "b1", count: 1 }, new Date(), () => 0.99);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("b");
  });
```

Update `apps/web/src/app/(app)/practice/page.test.tsx` lines with `"Mọi trình độ ▾"` to `"Tất cả ▾"`, and `apps/web/src/app/(app)/reading/page.test.tsx` likewise (3 occurrences in total across the two files).

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/lib/practiceSession.test.ts "src/app/(app)/practice/page.test.tsx" "src/app/(app)/reading/page.test.tsx"` → FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/lib/practiceSession.ts`: add `import { levelWeight, weightedOrder } from "./levelChoice";` and replace `selectSessionWords` with:

```ts
// Due words matching the filters, if any exist; otherwise every matching
// word regardless of due date (never leaves the user with an empty session).
// "Tối đa X": words nearer X tend to come first (weighted order); "Tất cả": uniform shuffle.
export function selectSessionWords(
  records: VocabRecord[],
  filters: SessionWordFilters,
  now: Date = new Date(),
  random: () => number = Math.random
): VocabRecord[] {
  const matching = records.filter((r) => matchesFilters(r, filters));
  const due = matching.filter((r) => isDue(r, now));
  const pool = due.length > 0 ? due : matching;
  const max = filters.maxCefr;
  const ordered =
    max === null ? shuffle(pool) : weightedOrder(pool, (r) => Math.max(1, levelWeight(CEFR_ORDER, r.cefrLevel, max)), random);
  return filters.count === null ? ordered : ordered.slice(0, filters.count);
}
```

(`Math.max(1, …)`: `matchesFilters` already removed levels above the max, so weight 0 cannot occur; the guard keeps every matching word.) Keep `shuffle` using `Math.random` so the existing Fisher–Yates test still passes.

In `practice/page.tsx` and `reading/page.tsx`, change `{ value: "", label: "Mọi trình độ" }` to `{ value: "", label: "Tất cả" }` and the trigger fallback `"Mọi trình độ"` to `"Tất cả"`.

- [ ] **Step 4: Run to verify they pass** — same command → PASS; `npm run typecheck` → 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/practiceSession.ts apps/web/src/lib/practiceSession.test.ts "apps/web/src/app/(app)/practice/page.tsx" "apps/web/src/app/(app)/practice/page.test.tsx" "apps/web/src/app/(app)/reading/page.tsx" "apps/web/src/app/(app)/reading/page.test.tsx"
git commit -m "feat(web): Tối đa X picks words weighted toward X; Mọi trình độ becomes Tất cả

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Nghe and Đọc song ngữ prompts + Nghe picker and random default

**Files:**
- Modify: `apps/web/src/lib/readingPassage.ts` (`levelClause`), `apps/web/src/lib/listeningPassage.ts` (`buildListeningPassagePrompt`), `apps/web/src/app/(app)/listening/page.tsx` (options), `apps/web/src/app/(app)/listening/comprehension/page.tsx` (lines ~54–61)
- Test: `apps/web/src/lib/readingPassage.test.ts`, `apps/web/src/lib/listeningPassage.test.ts`, `apps/web/src/app/(app)/listening/page.test.tsx`, `apps/web/src/app/(app)/listening/comprehension/page.test.tsx`

**Interfaces:** Consumes `levelMixSentence`, `pickRandomLevel` (Task 1).

- [ ] **Step 1: Write the failing tests**

In `readingPassage.test.ts` add (adapt the arguments to the file's existing call style if it passes a different word list):

```ts
  it("asks mainly for the maximum level with some easier text", () => {
    const p = buildReadingPassagePrompt(["apple"], "english", "b2");
    expect(p).toContain("Write mainly at CEFR B2. About a quarter of the sentences and words may be easier, for variety. Never go above CEFR B2.");
    expect(p).not.toContain("at or below CEFR level");
  });
  it("adds no level sentence for Tất cả", () => {
    expect(buildReadingPassagePrompt(["apple"], "english", null)).not.toContain("Write mainly at CEFR");
  });
```

If an existing test asserts `"at or below CEFR level B1"`, change it to the new sentence for that level.

In `listeningPassage.test.ts` add:

```ts
  it("adds the mostly-at-this-level instruction", () => {
    expect(buildListeningPassagePrompt("b1", "general", "english")).toContain(
      "Write mainly at CEFR B1. About a quarter of the sentences and words may be easier, for variety. Never go above CEFR B1."
    );
  });
```

In `listening/page.test.tsx`, the test at ~line 217 that opens the dropdown and picks a level: the option is now labelled `"Tối đa C1"` (was `"C1"`); update that click. The trigger fallback stays `"Tất cả ▾"`.

In `listening/comprehension/page.test.tsx` add a test (follow the file's existing setup helpers, e.g. `setSearchParams`, and its mocked AI call):

```tsx
  it("generates at a random level instead of always B1 when the URL has no level", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    setSearchParams({ context: "general", action: "generate" });
    // render the page the same way the existing "generate" tests do, then:
    // expect the prompt passed to the AI call to contain "C2 level" and "Never go above CEFR C2"
  });
```

Write it concretely by copying the closest existing generate test in that file and changing only the search params and the prompt assertion; restore the spy in `afterEach` if the file does not already call `vi.restoreAllMocks()`.

- [ ] **Step 2: Run to verify they fail** — run the four test files → FAIL.

- [ ] **Step 3: Implement**

`readingPassage.ts`: add `import { levelMixSentence } from "./levelChoice";` and change

```ts
  const levelClause = maxCefr
    ? `Keep the difficulty at or below CEFR level ${maxCefr.toUpperCase()}. `
    : "";
```

to

```ts
  const levelClause = maxCefr ? `${levelMixSentence(maxCefr)} ` : "";
```

`listeningPassage.ts`: add the same import; in `buildListeningPassagePrompt`, right after the sentence ending `register/setting. `, insert `${levelMixSentence(level)} ` (i.e. change `` `register/setting. ` + `` to `` `register/setting. ${levelMixSentence(level)} ` + ``).

`listening/page.tsx`: options become `label: \`Tối đa ${level.toUpperCase()}\`` (value unchanged); trigger label `level ? \`Tối đa ${level.toUpperCase()}\` : "Tất cả"`.

`listening/comprehension/page.tsx`: import `useMemo` (if not imported) and `pickRandomLevel` from `@/lib/levelChoice`, and the A1–C2 list (use the file's existing CEFR list if it has one, else `["a1","a2","b1","b2","c1","c2"] as const`). Replace

```ts
  const level: CefrLevel = isCefrLevel(levelParam) ? levelParam : "b1";
```

with

```ts
  // "Tất cả" (no level param): each page load generates at one random level; stable across re-renders.
  const level: CefrLevel = useMemo(
    () => (isCefrLevel(levelParam) ? levelParam : pickRandomLevel(CEFR_SCALE)),
    [levelParam]
  );
```

and update the comment above it (it no longer defaults to "b1"). Make sure this `useMemo` sits with the other hooks before any early return. `savedLevelFilter` is unchanged.

- [ ] **Step 4: Run to verify they pass** — the four files → PASS; `npm run typecheck` → 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/readingPassage.ts apps/web/src/lib/readingPassage.test.ts apps/web/src/lib/listeningPassage.ts apps/web/src/lib/listeningPassage.test.ts "apps/web/src/app/(app)/listening/page.tsx" "apps/web/src/app/(app)/listening/page.test.tsx" "apps/web/src/app/(app)/listening/comprehension/page.tsx" "apps/web/src/app/(app)/listening/comprehension/page.test.tsx"
git commit -m "feat(web): Nghe and Đọc prompts write mainly at the chosen level; Nghe Tất cả picks a random level

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `LevelPicker` + Hội thoại levels

**Files:**
- Create: `apps/web/src/components/shared/LevelPicker.tsx`, `apps/web/src/components/shared/LevelPicker.test.tsx`
- Modify: `apps/web/src/lib/conversationTypes.ts` (`ConversationSetup`), `apps/web/src/lib/conversationPrompts.ts` (`describeSetup`), `apps/web/src/components/conversation/ConversationSetupForm.tsx` (draft, `draftToSetup`, level field), `apps/web/src/app/(app)/conversation/page.tsx` (`?prep=` prefill sets `levelMode: "max"`)
- Test: `apps/web/src/lib/conversationPrompts.test.ts`, `apps/web/src/components/conversation/ConversationSetupForm.test.tsx`

**Interfaces:**
- Consumes: `LevelMode`, `levelMixSentence`, `pickRandomLevel` (Task 1).
- Produces:
  - `ConversationSetup.levelMode?: LevelMode`; `ConversationDraft.levelMode: LevelMode` (default `"max"`).
  - `LevelPicker<T extends string>(props: { scale: readonly T[]; level: T; mode: LevelMode; onChange(next: { level: T; mode: LevelMode }): void; disabled?: boolean; ariaLabel?: string })` — chips "Tất cả" then "Tối đa <LEVEL>" per scale item, `aria-pressed` on the active one, class `vb-chip` / `vb-chip active`, wrapped in `<div className="iv-row" role="group" aria-label={ariaLabel ?? "Trình độ"}>`. Picking "Tất cả" keeps `level` unchanged.
  - `draftToSetup(d: ConversationDraft, random?: () => number): ConversationSetup` — `levelMode: "all"` → `level` = random pick from `CONVERSATION_LEVELS`; always writes `levelMode`.
  - `describeSetup` appends `levelMixSentence(setup.level)` after the `LEVEL_GUIDE` line when `setup.levelMode` is set.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/components/shared/LevelPicker.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LevelPicker } from "./LevelPicker";

const SCALE = ["A2", "B1", "B2", "C1"] as const;

describe("LevelPicker", () => {
  it("shows Tất cả and Tối đa chips and marks the active one", () => {
    render(<LevelPicker scale={SCALE} level="B1" mode="max" onChange={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Trình độ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tối đa B1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Tất cả" })).toHaveAttribute("aria-pressed", "false");
  });

  it("reports picks", () => {
    const onChange = vi.fn();
    render(<LevelPicker scale={SCALE} level="B1" mode="max" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Tối đa C1" }));
    expect(onChange).toHaveBeenLastCalledWith({ level: "C1", mode: "max" });
    fireEvent.click(screen.getByRole("button", { name: "Tất cả" }));
    expect(onChange).toHaveBeenLastCalledWith({ level: "B1", mode: "all" });
  });

  it("marks Tất cả when mode is all", () => {
    render(<LevelPicker scale={SCALE} level="B1" mode="all" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Tất cả" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Tối đa B1" })).toHaveAttribute("aria-pressed", "false");
  });
});
```

In `conversationPrompts.test.ts` add (the file's fixture is `TOPIC: ConversationSetup`):

```ts
  it("adds the mostly-at-this-level sentence when levelMode is set, and not for legacy setups", () => {
    const withMode = buildOpeningPrompt({ ...TOPIC, level: "B2", levelMode: "max" });
    expect(withMode).toContain("Never go above CEFR B2.");
    const legacy = buildOpeningPrompt({ ...TOPIC, level: "B2" });
    expect(legacy).not.toContain("Write mainly at CEFR");
  });
```

In `ConversationSetupForm.test.tsx`: change the level click at ~line 95 from `{ name: "B2" }` to `{ name: "Tối đa B2" }` and its expectation to `expect.objectContaining({ level: "B2", levelMode: "max" })`; add:

```tsx
  it("draftToSetup always writes levelMode and picks a random level for Tất cả", () => {
    const base = { ...DEFAULT_CONVERSATION_DRAFT, topic: "Travel" };
    expect(draftToSetup({ ...base, level: "B2", levelMode: "max" })).toMatchObject({ level: "B2", levelMode: "max" });
    expect(draftToSetup({ ...base, levelMode: "all" }, () => 0.999)).toMatchObject({ level: "C1", levelMode: "all" });
    expect(draftToSetup({ ...base, levelMode: "all" }, () => 0)).toMatchObject({ level: "A2", levelMode: "all" });
  });
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/components/shared/LevelPicker.test.tsx src/lib/conversationPrompts.test.ts src/components/conversation/ConversationSetupForm.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`LevelPicker.tsx`:

```tsx
import type { LevelMode } from "@/lib/levelChoice";

export interface LevelPickerProps<T extends string> {
  scale: readonly T[];
  level: T;
  mode: LevelMode;
  onChange(next: { level: T; mode: LevelMode }): void;
  disabled?: boolean;
  ariaLabel?: string;
}

export function LevelPicker<T extends string>({ scale, level, mode, onChange, disabled, ariaLabel }: LevelPickerProps<T>) {
  const chip = (active: boolean) => (active ? "vb-chip active" : "vb-chip");
  return (
    <div className="iv-row" role="group" aria-label={ariaLabel ?? "Trình độ"}>
      <button type="button" className={chip(mode === "all")} aria-pressed={mode === "all"} disabled={disabled} onClick={() => onChange({ level, mode: "all" })}>
        Tất cả
      </button>
      {scale.map((l) => {
        const active = mode === "max" && level === l;
        return (
          <button key={l} type="button" className={chip(active)} aria-pressed={active} disabled={disabled} onClick={() => onChange({ level: l, mode: "max" })}>
            {`Tối đa ${l.toUpperCase()}`}
          </button>
        );
      })}
    </div>
  );
}
```

`conversationTypes.ts`: in `ConversationSetup` add

```ts
  /** "max" = Tối đa level; "all" = Tất cả (level was picked at random at Start). Missing (old sessions) = exact level. */
  levelMode?: LevelMode;
```

with `import type { LevelMode } from "./levelChoice";`.

`conversationPrompts.ts`: import `levelMixSentence`; in `describeSetup` replace the first line with

```ts
  const lines = [
    `Learner level: ${LEVEL_GUIDE[setup.level]}${setup.levelMode ? ` ${levelMixSentence(setup.level)}` : ""}`,
  ];
```

`ConversationSetupForm.tsx`:
- import `LevelPicker` and `pickRandomLevel`, `type LevelMode`;
- `ConversationDraft` gains `levelMode: LevelMode;` and `DEFAULT_CONVERSATION_DRAFT` gains `levelMode: "max",`;
- `draftToSetup(d: ConversationDraft, random: () => number = Math.random)` returns `level: d.levelMode === "all" ? pickRandomLevel(CONVERSATION_LEVELS, random) : d.level, levelMode: d.levelMode,` (other fields unchanged);
- replace the level chips block inside `<div className="iv-field">` "Trình độ" with
  `<LevelPicker scale={CONVERSATION_LEVELS} level={value.level} mode={value.levelMode} onChange={(next) => onChange({ ...value, level: next.level, levelMode: next.mode })} />`
  (keep the `iv-label` "Trình độ").

`conversation/page.tsx`: in the `?prep=` prefill `setDraft((d) => ({ ...d, …, level: p.level }))` add `levelMode: "max"` (a kit's role-play uses the kit's concrete level). Run `npm run typecheck` and fix any other `ConversationDraft` literal (tests) by adding `levelMode: "max"`.

- [ ] **Step 4: Run to verify they pass** — the three files plus `npx vitest run "src/app/(app)/conversation"` → PASS; `npm run typecheck` → 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/shared/LevelPicker.tsx apps/web/src/components/shared/LevelPicker.test.tsx apps/web/src/lib/conversationTypes.ts apps/web/src/lib/conversationPrompts.ts apps/web/src/lib/conversationPrompts.test.ts apps/web/src/components/conversation/ConversationSetupForm.tsx apps/web/src/components/conversation/ConversationSetupForm.test.tsx "apps/web/src/app/(app)/conversation/page.tsx"
git add -u apps/web/src
git commit -m "feat(web): Hội thoại level picker (Tất cả / Tối đa X) with levelMode

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Check `git status` before `git add -u`; unstage `apps/web/next-env.d.ts` if it gets added.)

---

### Task 5: Chuẩn bị tình huống levels

**Files:**
- Modify: `apps/web/src/lib/conversationPrepTypes.ts`, `apps/web/src/lib/conversationPrepPrompt.ts`, `apps/web/src/app/(app)/conversation/prep/page.tsx`
- Test: `apps/web/src/lib/conversationPrepPrompt.test.ts`, `apps/web/src/app/(app)/conversation/prep/page.test.tsx`

**Interfaces:**
- Consumes: `LevelPicker`, `LevelMode`, `levelMixSentence`, `pickRandomLevel`.
- Produces: `NewConversationPrep.levelMode?: LevelMode`; `buildPrepPrompt(situation, level, memory?, levelMode?)`.

- [ ] **Step 1: Write the failing tests**

`conversationPrepPrompt.test.ts`:

```ts
describe("buildPrepPrompt level mode", () => {
  it("adds the mostly-at-this-level sentence for a level mode, not for legacy calls", () => {
    expect(buildPrepPrompt("Báo cáo task A", "B2", undefined, "max")).toContain("Never go above CEFR B2.");
    expect(buildPrepPrompt("Báo cáo task A", "B2")).not.toContain("Write mainly at CEFR");
  });
});
```

`prep/page.test.tsx` (existing level tests use `{ name: "A2" }` / `{ name: "B2" }`):
- change them to `{ name: "Tối đa A2" }` / `{ name: "Tối đa B2" }`;
- in the "generates, saves and navigates" test, extend the save expectation to `expect.objectContaining({ situation: "Báo cáo task A", level: "B2", levelMode: "max", title: "Báo cáo" })`;
- add:

```tsx
  it("Tất cả picks a random level at Tạo and saves levelMode all", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.mocked(callInterviewAi).mockResolvedValueOnce(VALID);
    vi.mocked(createConversationPrep).mockResolvedValueOnce("p1");
    render(<ConversationPrepPage />);
    fireEvent.click(screen.getByRole("button", { name: "Tất cả" }));
    typeSituation("Báo cáo task A");
    fireEvent.click(screen.getByRole("button", { name: "Tạo kịch bản" }));
    await waitFor(() => expect(ROUTER.push).toHaveBeenCalledWith("/conversation/prep/p1"));
    expect(createConversationPrep).toHaveBeenCalledWith("u1", expect.objectContaining({ level: "A2", levelMode: "all" }));
    expect(vi.mocked(callInterviewAi).mock.calls[0][1]).toContain("Never go above CEFR A2.");
  });

  it("restores Tất cả from the latest kit", async () => {
    vi.mocked(listRecentConversationPreps).mockResolvedValueOnce([{ ...RECENT[0], levelMode: "all" }]);
    render(<ConversationPrepPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Tất cả" })).toHaveAttribute("aria-pressed", "true"));
  });
```

(If `Math.random` is also used by the memory/other mocks in this file, `mockReturnValue(0)` is still safe because they are mocked.)

- [ ] **Step 2: Run to verify they fail** — the two files → FAIL.

- [ ] **Step 3: Implement**

`conversationPrepTypes.ts`: in `NewConversationPrep` add `/** Missing on old kits (= exact level). */ levelMode?: LevelMode;` with the type import.

`conversationPrepPrompt.ts`: signature `buildPrepPrompt(situation: string, level: ConversationLevel, memory?: KitMemory, levelMode?: LevelMode): string`; change the line `Learner level: ${LEVEL_GUIDE[level]}` to `` Learner level: ${LEVEL_GUIDE[level]}${levelMode ? ` ${levelMixSentence(level)}` : ""} ``.

`prep/page.tsx`:
- state: `const [levelMode, setLevelMode] = useState<LevelMode>("max");`
- the recent-kits effect: `if (list[0] && !levelLockedRef.current) { setLevel(list[0].level); setLevelMode(list[0].levelMode === "all" ? "all" : "max"); }`
- in `handleCreate`, the regenerate check becomes `if (!pending || pending.situation !== text || pendingChoiceRef.current !== choiceKey)` where `const choiceKey = levelMode === "all" ? "all" : level;` and a new `const pendingChoiceRef = useRef<string | null>(null);` (declared with the other refs, before early returns) is set to `choiceKey` whenever a new pending kit is built;
- inside that branch: `const kitLevel = levelMode === "all" ? pickRandomLevel(CONVERSATION_LEVELS) : level;` then `buildPrepPrompt(text, kitLevel, memory, levelMode)` and `pending = { ...content, situation: text, level: kitLevel, levelMode, usedMemory: memory !== undefined };`
- replace the level chips `<div className="prep-chips" role="group" aria-label="Trình độ">…</div>` with
  `<LevelPicker scale={CONVERSATION_LEVELS} level={level} mode={levelMode} disabled={generating} onChange={(next) => { levelLockedRef.current = true; setLevel(next.level); setLevelMode(next.mode); }} />`

- [ ] **Step 4: Run to verify they pass** — `npx vitest run src/lib/conversationPrepPrompt.test.ts "src/app/(app)/conversation/prep"` → PASS; `npm run typecheck` → 0; full `npm test` once.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/conversationPrepTypes.ts apps/web/src/lib/conversationPrepPrompt.ts apps/web/src/lib/conversationPrepPrompt.test.ts "apps/web/src/app/(app)/conversation/prep/page.tsx" "apps/web/src/app/(app)/conversation/prep/page.test.tsx"
git commit -m "feat(web): Chuẩn bị level picker (Tất cả / Tối đa X) with levelMode

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `SimpleDropdown` overflow fix

**Files:**
- Modify: `apps/web/src/components/shared/SimpleDropdown.tsx`, `apps/web/src/styles/bloom.css` (after the `.vb-topic-popover-opts` rule, ~line 762)
- Test: `apps/web/src/components/shared/SimpleDropdown.test.tsx`

**Interfaces:** `SimpleDropdown` props unchanged.

- [ ] **Step 1: Write the failing tests** — append to `SimpleDropdown.test.tsx` (reuse its existing `OPTIONS` and render props; the component's trigger label in that file is currently `"Mọi trình độ"` — leave the existing tests as they are):

```tsx
function rect(left: number, right: number): DOMRect {
  return { left, right, top: 0, bottom: 40, width: right - left, height: 40, x: left, y: 0, toJSON: () => ({}) } as DOMRect;
}

describe("SimpleDropdown placement", () => {
  afterEach(() => vi.restoreAllMocks());

  it("right-aligns the popover when there is not enough room on the right", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("main") ? rect(0, 1000) : rect(800, 900);
    });
    render(
      <div className="main">
        <SimpleDropdown triggerLabel="Tất cả" ariaLabel="Trình độ" options={OPTIONS} value="" onChange={vi.fn()} active={false} />
      </div>
    );
    fireEvent.click(screen.getByRole("button", { name: "Tất cả ▾" }));
    expect(screen.getByRole("listbox", { name: "Trình độ" })).toHaveClass("align-end");
  });

  it("keeps left alignment when there is room", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("main") ? rect(0, 1000) : rect(100, 200);
    });
    render(
      <div className="main">
        <SimpleDropdown triggerLabel="Tất cả" ariaLabel="Trình độ" options={OPTIONS} value="" onChange={vi.fn()} active={false} />
      </div>
    );
    fireEvent.click(screen.getByRole("button", { name: "Tất cả ▾" }));
    expect(screen.getByRole("listbox", { name: "Trình độ" })).not.toHaveClass("align-end");
  });
});
```

(Add `afterEach` to the vitest import if missing. If `OPTIONS` has a different name in the file, use it.)

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/components/shared/SimpleDropdown.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`SimpleDropdown.tsx`: import `useRef`; add `const wrapRef = useRef<HTMLDivElement>(null); const [alignEnd, setAlignEnd] = useState(false);`; put `ref={wrapRef}` on the wrapper div; the trigger's onClick becomes:

```tsx
        onClick={() => {
          if (!open && wrapRef.current) {
            // The popover is 320px wide (narrower on phones) and opens from the trigger's left edge;
            // right-align it when that would pass the scroll container's right edge.
            const width = Math.min(320, window.innerWidth - 32);
            const container = wrapRef.current.closest(".main") as HTMLElement | null;
            const rightEdge = container ? container.getBoundingClientRect().right : window.innerWidth;
            setAlignEnd(wrapRef.current.getBoundingClientRect().left + width > rightEdge);
          }
          setOpen((o) => !o);
        }}
```

popover className `` `vb-topic-popover${alignEnd ? " align-end" : ""}` ``; options container className `"vb-topic-popover-opts simple-dropdown-opts"`.

`bloom.css`, after the `.vb-topic-popover-opts { … }` rule:

```css
.vb-topic-popover.align-end {
  left: auto;
  right: 0;
}

/* SimpleDropdown has no "Áp dụng" button under its options, so no gap below them. */
.simple-dropdown-opts {
  margin-bottom: 0;
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/components/shared/SimpleDropdown.test.tsx src/styles` → PASS; `npm run typecheck` → 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/shared/SimpleDropdown.tsx apps/web/src/components/shared/SimpleDropdown.test.tsx apps/web/src/styles/bloom.css
git commit -m "fix(web): dropdown popover right-aligns instead of overflowing; no empty gap under its options

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Docs

**Files:** `README.md`, `docs/superpowers/specs/2026-11-09-level-picker-design.md`, `.superpowers/sdd/progress.md`

- [ ] **Step 1:** README: in the features list, add one bullet under a fitting general section (e.g. near Ôn tập or Giao diện): "**Chọn trình độ thống nhất (web):** mọi bộ chọn trình độ có **Tất cả** (trộn đều mọi cấp) và **Tối đa X** (gồm X và các cấp thấp hơn, cấp càng gần X càng xuất hiện nhiều — vd Tối đa B2: A1:A2:B1:B2 = 1:2:3:4). Áp dụng cho Ôn tập và Đọc song ngữ (bốc từ), và độ khó nội dung AI viết ở Hội thoại, Chuẩn bị tình huống, Nghe hiểu, Đọc song ngữ (Tất cả = mỗi lần tạo bốc ngẫu nhiên một cấp)." Under Roadmap "Việc cần làm tiếp", add a block for 2026-11-09 level picker with two unchecked items: chạy thật Ôn tập "Tối đa B2" thấy từ B2/B1 nhiều hơn; Nghe hub ở desktop mở bộ chọn trình độ không còn cuộn ngang.
- [ ] **Step 2:** Spec: set Status "Implemented (2026-11-09)."
- [ ] **Step 3:** Append to `.superpowers/sdd/progress.md` a "## 2026-11-09 — Level picker" section with spec/plan paths, the branch (`feat/level-picker` on top of `feat/memory-split`), and "web only".
- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-11-09-level-picker-design.md .superpowers/sdd/progress.md
git commit -m "docs: README, spec status and progress log for the level picker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
