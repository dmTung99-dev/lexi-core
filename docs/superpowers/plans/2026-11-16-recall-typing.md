# Ôn tập "Gõ từ" recall mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A third Ôn tập mode, "Gõ từ": show meaning + masked definition, the learner types the full headword with a level-scaled letter pattern, limited hints, skip, auto-advance, SM-2 scoring and a 3-group summary.

**Architecture:** Pure logic in `lib/recallHint.ts` (slots, pre-reveal, hint reveal, live fill, compare, mask). A self-contained `RecallTypingCard` owns one word's state and timers and reports an outcome. The practice page adds the mode chip, filters out sentences, records the outcome next to the existing `{ vocabRecordId, quality }`, and groups the result list.

**Tech Stack:** Next.js (apps/web), React, TypeScript, Vitest + Testing Library (fake timers).

**Spec:** `docs/superpowers/specs/2026-11-16-recall-typing-design.md` (UI mockup linked in its Status line).

## Global Constraints

- Web only (`apps/web`); no AI, no backend, no new Firestore data.
- Mode chip label **"Gõ từ"**, after Flashcard and Trộn AI.
- Pre-reveal fractions: A1/A2 **0**, B1 **0.15**, B2 **0.25**, C1 **0.35**, C2 **0.40**; `round(fraction × letters)`; ≥ 1 for B1+ when letters ≥ 4; never more than `floor(letters / 2)`; deterministic per headword.
- Separators (always shown, never hidden): space, `-`, `'`, `’`, `.`, `/`.
- Hints: **3** presses; each reveals `max(1, ceil(0.25 × eligible))`; eligible = hidden letters not already typed correctly at that slot; never reveal the last hidden letter; a press with nothing eligible is disabled and does not consume a hint.
- Listen hint: when letter hints left = 0 **or** `hintAvailable` is false, the hint button becomes **"Nghe phát âm"** (replayable, restarts the preloaded audio, marks hinted; disabled when the audio failed). "Bỏ qua" is enabled from that same moment.
- Delays: correct **1200 ms**, wrong/skipped **2000 ms**.
- Compare: trim, collapse whitespace, lowercase, NFC, `’`→`'`, `–`/`—`→`-`.
- Scoring: `clean` → quality 5; `hinted`/`wrong`/`skipped` → quality 1.
- Summary groups: **"Tự nhớ được"**, **"Đúng nhờ gợi ý"**, **"Sai / bỏ qua"** (hide empty).
- Every `font-size` uses `--type-scale` (enforced by `bloom.fontSize.test.ts`); phone input 16px; touch targets ≥ 44px; colours from Bloom tokens (`--success`, `--success-bg`, `--danger`, `--danger-bg`, `--accent`).
- Commands from `apps/web`: `npx vitest run <path>`, `npx tsc --noEmit -p .`.

## Review Focus

- Headword with uppercase/proper nouns ("New York") typed lowercase must count correct, and the pattern must still show its separators — Task 1 compare + slots tests.
- Phrase typed with a double space or trailing space ("behind  schedule ") must count correct and live-fill must not shift slots — Task 1 `fillSlots` collapses whitespace before laying out.
- Pressing Enter twice fast / Enter during the result pause must not record two outcomes — Task 2 card test.
- A definition containing an inflected headword ("schedules", "negotiated") must be masked — Task 1 mask test.
- A session where every word is a sentence must show 0 matching words and disable "Bắt đầu" in Gõ từ mode — Task 3 page test.

---

### Task 1: Pure recall logic

**Files:**
- Create: `apps/web/src/lib/recallHint.ts`
- Test: `apps/web/src/lib/recallHint.test.ts`

**Interfaces:**
- Produces:
  - `export type RecallOutcome = "clean" | "hinted" | "wrong" | "skipped";`
  - `export const RECALL_HINTS = 3; export const RECALL_CORRECT_MS = 1200; export const RECALL_WRONG_MS = 2000;`
  - `export function isSeparator(ch: string): boolean`
  - `export function letterIndexes(headword: string): number[]` — indexes of non-separator chars in the whitespace-collapsed, trimmed headword.
  - `export function initialReveal(headword: string, cefr: VocabRecord["cefrLevel"]): Set<number>`
  - `export function hintReveal(headword: string, revealed: Set<number>, typed: string): Set<number>` — returns the new revealed set (superset); unchanged when nothing eligible.
  - `export function hintAvailable(headword: string, revealed: Set<number>, typed: string): boolean`
  - `export interface RecallSlot { kind: "sep" | "letter"; ch: string; source: "typed" | "revealed" | "empty" }`
  - `export function fillSlots(headword: string, revealed: Set<number>, typed: string): { slots: RecallSlot[]; overflow: string }`
  - `export function normalizeAnswer(s: string): string` and `export function answersMatch(input: string, headword: string): boolean`
  - `export function maskHeadword(text: string, headword: string): string` — replaces the headword (and for single-word headwords `+s/es/ed/d/ing`) with `___`, case-insensitive, whole-word.

- [ ] **Step 1: Write failing tests** (`recallHint.test.ts`)

```ts
it("A1/A2 reveal nothing", () => {
  expect(initialReveal("borrow", "a2").size).toBe(0);
});
it("B2 reveals 25% of letters, deterministic, never more than half", () => {
  const a = initialReveal("behind schedule", "b2");
  expect(a.size).toBe(Math.round(0.25 * 14)); // 4
  expect([...a]).toEqual([...initialReveal("behind schedule", "b2")]);
  expect(initialReveal("cat", "c2").size).toBeLessThanOrEqual(1);
});
it("B1 reveals at least one letter on words of 4+ letters", () => {
  expect(initialReveal("plan", "b1").size).toBe(1);
});
it("never reveals separators", () => {
  const r = initialReveal("a heads-up", "c2");
  for (const i of r) expect(isSeparator("a heads-up"[i])).toBe(false);
});
it("hint skips letters already typed correctly", () => {
  const before = new Set<number>();
  const after = hintReveal("borrow", before, "bor");
  for (const i of after) expect(i).toBeGreaterThanOrEqual(3);
  expect(after.size).toBe(1); // ceil(0.25 × 3 eligible)
});
it("hint never reveals the last hidden letter", () => {
  const all = new Set([0, 1, 2, 3, 4]);
  expect(hintReveal("borrow", all, "").size).toBe(5);
  expect(hintAvailable("borrow", all, "")).toBe(false);
});
it("fillSlots lays typed text over slots and reports overflow", () => {
  const { slots, overflow } = fillSlots("behind schedule", new Set([1]), "behind  sch");
  expect(slots[7]).toEqual({ kind: "letter", ch: "s", source: "typed" });
  expect(slots[6].kind).toBe("sep");
  expect(slots[10]).toEqual({ kind: "letter", ch: "", source: "empty" });
  expect(fillSlots("plan", new Set(), "plans").overflow).toBe("s");
});
it("answersMatch ignores case, extra spaces and quote/dash variants", () => {
  expect(answersMatch("  New  york ", "New York")).toBe(true);
  expect(answersMatch("don’t", "don't")).toBe(true);
  expect(answersMatch("a heads–up", "a heads-up")).toBe(true);
  expect(answersMatch("behind schedual", "behind schedule")).toBe(false);
});
it("maskHeadword hides the word and simple inflections", () => {
  expect(maskHeadword("He negotiated hard; negotiate again.", "negotiate")).toBe("He ___ hard; ___ again.");
  expect(maskHeadword("The project is behind schedule.", "behind schedule")).toBe("The project is ___.");
  expect(maskHeadword("schedules", "schedule")).toBe("___");
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/recallHint.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement** `lib/recallHint.ts` per the Interfaces block and Global Constraints. Determinism: seed a small PRNG (e.g. mulberry32) from a string hash of the normalized headword; order candidates as first letter of each word part first, then the remaining letters shuffled by the seeded PRNG; take the first N. Hint reveal uses the same seeded order filtered to eligible indexes. `fillSlots` normalizes the typed text by collapsing whitespace (not trimming the end, so "behind " shows the space) and walks it char by char over the slot list.

- [ ] **Step 4: Run** the test file — PASS; `npx tsc --noEmit -p .` — clean.

- [ ] **Step 5: Commit** — `feat(web): recall typing logic (pattern, hints, live fill, compare, mask)`

---

### Task 2: RecallTypingCard

**Files:**
- Create: `apps/web/src/components/practice/RecallTypingCard.tsx`
- Modify: `apps/web/src/styles/bloom.css` (new `.recall-*` rules near the other practice card styles)
- Test: `apps/web/src/components/practice/RecallTypingCard.test.tsx`

**Interfaces:**
- Consumes: everything from Task 1; `getPronunciationUrl({ text, language, tier: "word" })` from `@/lib/pronunciation`, `ttsLanguageCode`, `splitMeaningSenses` (as FlashcardCard uses).
- Produces: `export function RecallTypingCard(props: { record: VocabRecord; onDone(outcome: RecallOutcome): void }): JSX.Element`. Calls `onDone` exactly once, after the delay.

Layout per the mockup: level badge (`record.cefrLevel.toUpperCase()`), meaning (masked), definition (masked, italic, omitted when empty), pattern line (`aria-label="Gợi ý độ dài"`, slots from `fillSlots`, overflow chars after the last slot in danger colour), labelled input (`aria-label="Gõ từ tiếng Anh"`, autofocus, `autoComplete="off"`, `autoCapitalize="off"`, `autoCorrect="off"`, `spellCheck={false}`), buttons `Gợi ý (n)` and `Bỏ qua`. Result states: correct → input wrapper `.recall-ok` + "✓ Chính xác" + headword/IPA; wrong/skipped → "Đáp án" box above input with headword/IPA, input wrapper `.recall-bad` + "✗ Chưa đúng" (skipped: no ✗ label).

- [ ] **Step 1: Write failing tests** (use `vi.useFakeTimers()`; a B2 record `behind schedule`, meaning "chậm tiến độ", definition "The project is behind schedule.")
  - `"masks the headword in the definition"` → text "The project is ___." present; "behind schedule" absent before answering.
  - `"correct answer goes green and reports clean after 1200 ms"` → type "Behind schedule", Enter; "✓ Chính xác" shown; `onDone` not called at 1199 ms, called with `"clean"` at 1200 ms.
  - `"wrong answer shows the answer and reports wrong after 2000 ms"` → type "behind schedual", Enter; "Đáp án" + "behind schedule" shown; `onDone("wrong")` at 2000 ms.
  - `"a hint makes a correct answer count as hinted"` → click "Gợi ý (3)"; label becomes "Gợi ý (2)"; type correct; Enter; after 1200 ms `onDone("hinted")`.
  - `"skip unlocks only after 3 hints and reports skipped"` → "Bỏ qua" disabled; click hint ×3 (type nothing); "Bỏ qua" enabled; click; `onDone("skipped")` at 2000 ms.
  - `"after the letter hints the button becomes a replayable listen hint"` → click "Gợi ý" ×3; a button "Nghe phát âm" appears; clicking it twice calls the stub audio's `play()` twice (and resets `currentTime` to 0 before each); a correct answer afterwards reports `"hinted"`.
  - `"listen hint and skip unlock early when no letter is eligible"` → for "plan" (A2), type "pla" and press Gợi ý until disabled-for-letters → "Nghe phát âm" and "Bỏ qua" available even though hints remain.
  - `"listen hint is disabled when the audio failed"` → `getPronunciationUrl` rejects → after 3 hints "Nghe phát âm" is disabled; "Bỏ qua" still works.
  - `"Enter twice and Enter during the pause report once"` → type correct, Enter, Enter, advance 1200 ms → `onDone` called once; input is read-only after submit.
  - `"typed letters fill the pattern"` → type "beh"; the pattern's first three slots show b, e, h.
  - `"empty Enter does nothing"`.
  - `"preloads the pronunciation on show and plays it once on reveal"` → mock `getPronunciationUrl` resolving `"u1"` and a stub `Audio` class recording `play()` calls; on mount `getPronunciationUrl` called once with the headword; no `play()` before Enter; after a wrong Enter exactly one `play()`; no speaker button (`queryByRole("button", { name: /Nghe phát âm/ })` is null).
  - `"plays when the audio arrives late, but not after the card is gone"` → URL promise resolves after Enter → plays once; unmount before it resolves → never plays.
  - `"audio failure is silent"` → `getPronunciationUrl` rejects → reveal still works, no error text.

- [ ] **Step 2: Run** `npx vitest run src/components/practice/RecallTypingCard.test.tsx` — FAIL.

- [ ] **Step 3: Implement** the component. Audio: on mount (when `ttsLanguageCode(record.targetLanguage)` is non-null) start `getPronunciationUrl` and keep a preloaded `new Audio(url)` (`preload = "auto"`) in a ref; on reveal call `play()` once (if not ready, mark `playWhenReady`; play on arrival only if still mounted); swallow errors; do not pause it on unmount. State: `typed`, `revealed` (init `initialReveal`), `hintsLeft` (init `RECALL_HINTS`), `usedHint`, `result: null | RecallOutcome`; a timer ref cleared on unmount; submit guarded by `result !== null`). Hint button disabled when `hintsLeft === 0 || !hintAvailable(...)`. Add `.recall-*` CSS with `--type-scale` font sizes, mono font for slots/input, 16px input on phones.

- [ ] **Step 4: Run** the test file and `src/styles/bloom.fontSize.test.ts` — PASS; `npx tsc --noEmit -p .` — clean.

- [ ] **Step 5: Commit** — `feat(web): RecallTypingCard for the Gõ từ practice mode`

---

### Task 3: Practice page wiring, summary, docs

**Files:**
- Modify: `apps/web/src/app/(app)/practice/page.tsx`
- Test: `apps/web/src/app/(app)/practice/page.test.tsx`
- Modify: `README.md` (Ôn tập section, `### Luyện tập cách khoảng`), spec Status → `Implemented (<date>).`, `.superpowers/sdd/progress.md` (one entry)

**Interfaces:**
- Consumes: `RecallTypingCard`, `RecallOutcome` (Tasks 1–2).
- Produces: `practiceMode: "flashcard" | "mixed" | "recall"`; `SessionGradeResult` gains `outcome?: RecallOutcome`.

- [ ] **Step 1: Write failing tests** (`page.test.tsx`, existing mocks)
  - `"Gõ từ chip starts a recall session"` → click "Gõ từ" (aria-pressed true), "Bắt đầu" → the input labelled "Gõ từ tiếng Anh" is shown.
  - `"recall mode excludes sentences from the pool and the preview count"` → records: 2 words + 1 `inputType: "sentence"` → "2 từ khớp bộ lọc hiện tại."; all-sentence records → "0 từ …" and "Bắt đầu" disabled.
  - `"recall outcomes write SM-2 quality 5 only for clean"` → finish a 2-word session (one clean, one hinted; fake timers) → `updateVocabRecordSm2` called with fields computed from quality 5 for the first and 1 for the second (assert via the existing `computeSm2` mock/spy pattern in this file).
  - `"recall summary groups words"` → headings "Tự nhớ được" and "Đúng nhờ gợi ý" present, "Sai / bỏ qua" absent; percent = clean/total.
  - `"Ôn tập lại ngay keeps Gõ từ"` → from the recall result screen, click "Ôn tập lại ngay" → recall input shown again.
  - Existing flashcard/mixed tests unchanged (their "Ôn tập lại ngay" still resets to Flashcard).

- [ ] **Step 2: Run** `npx vitest run "src/app/(app)/practice/page.test.tsx"` — FAIL.

- [ ] **Step 3: Implement**
  - Third chip "Gõ từ". Pool: when mode is recall, filter `records` to `inputType !== "sentence"` before `selectSessionWords` (both preview and `handleStart`).
  - `handleStart(mode)`: recall → no AI generation (`exercises` not used); render `<RecallTypingCard key={word.id} record={word} onDone={handleRecallDone} />`; `handleRecallDone(outcome)` = `handleGrade(outcome === "clean" ? 5 : 1)` plus storing `outcome` on the result.
  - Result screen: when the session was recall, render the three groups (headings from Global Constraints, rows as today's `practice-result-item-*` rows); otherwise unchanged. "Ôn tập lại ngay" calls `handleStart("recall")` for a recall session, else today's behaviour.
  - Dashboard `?action=start` auto-start unchanged.
  - Docs: README Ôn tập section gains a "Gõ từ" bullet (meaning + definition → type the full word; pattern scaled by level; 3 hints then skip; hinted counts as not remembered; web only). Spec status and ledger entry.

- [ ] **Step 4: Run** the page test file, then full `npx vitest run` — all pass; `npx tsc --noEmit -p .` — clean.

- [ ] **Step 5: Commit** — `feat(web): Gõ từ recall mode in Ôn tập`
