# Chuẩn bị continuity + searchable history Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New Chuẩn bị kits see short summaries of earlier kits and continue a related story (ignoring unrelated ones); the kit history shows every kit, paged, with a text search.

**Architecture:** The kit generation call additionally returns a `summary` stored on the kit doc; old kits get a deterministic fallback summary. `loadKitMemory` reads all kits and adds the 50 newest summaries to `KitMemory.history`, which `kitMemorySection` renders as a relevance-gated prompt section. The create page loads all kits; `RecentPreps` (renamed heading "Lịch sử") pages 20 at a time and filters by a diacritic-insensitive query.

**Tech Stack:** Next.js (apps/web), React, TypeScript, Firebase JS SDK (Firestore), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-11-prep-continuity-design.md`

## Global Constraints

- Web only (`apps/web`); no new Firestore collection, no Cloud Function, no rules change. Kits stay in `users/{uid}/conversation_preps`.
- Summary: English, 1–3 sentences, stored trimmed to **400** chars; optional field (old kits lack it).
- Prompt history: **50** most recent earlier kits, newest first, only when "Dùng trí nhớ" is on.
- History list: **20** per page, "Xem thêm" adds 20; heading **"Lịch sử"**; search placeholder **"Tìm bộ tài liệu…"**; no-match text **"Không tìm thấy bộ tài liệu nào."**; empty text stays "Chưa có bộ tài liệu nào.".
- Search: case- and diacritic-insensitive substring over title, situation, summary.
- Every `font-size` must be `calc(N * var(--type-scale))` (or `max(var(--type-min), …)` under 15px); phone text inputs stay 16px; touch targets ≥ 44px.
- Delete behaviour unchanged (confirm, then delete).
- Run web tests from `apps/web`: `npx vitest run <path>`; typecheck: `npx tsc --noEmit -p .`.

## Review Focus

- A kit whose AI JSON has no `summary` (or a non-string) must still save — covered in Task 1 parse test.
- Summaries/situations containing newlines or very long text must not break the prompt section layout — covered in Task 2 prompt test (whitespace collapsed, ≤ 400 chars per entry).
- Vietnamese query typed without diacritics ("lap trinh") must match "Lập trình"; "đ" must fold to "d" (NFD does not decompose it) — covered in Task 3 `matchesPrepQuery` test.
- Deleting a kit while a search is active must remove it from the shown results — covered in Task 3 page test.
- Kit history read failing must not block generation (memory becomes undefined as today) — covered in Task 2 loader test.

---

### Task 1: Kit summary — prompt, parse, fallback

**Files:**
- Modify: `apps/web/src/lib/conversationPrepTypes.ts` (add `summary?: string` to `ConversationPrepContent`)
- Modify: `apps/web/src/lib/conversationPrepPrompt.ts` (JSON schema line + rules bullet; `parsePrep`)
- Create: `apps/web/src/lib/prepHistory.ts`
- Test: `apps/web/src/lib/conversationPrepPrompt.test.ts`, `apps/web/src/lib/prepHistory.test.ts`

**Interfaces:**
- Produces: `ConversationPrepContent.summary?: string`; `export const PREP_SUMMARY_MAX = 400`; `export function kitSummary(prep: Pick<ConversationPrep, "title" | "situation" | "persona" | "goals" | "summary">): string` in `prepHistory.ts`.

- [ ] **Step 1: Write failing tests**

In `conversationPrepPrompt.test.ts`:
```ts
it("asks for a story summary in the kit JSON", () => {
  const p = buildPrepPrompt("Tôi đi phỏng vấn khoá học làm game", "B1");
  expect(p).toContain('"summary"');
  expect(p).toMatch(/"summary": .*English/);
});
it("parses the summary, trimmed to 400 chars", () => {
  const kit = parsePrep(JSON.stringify({ ...VALID_KIT_JSON, summary: "  A".padEnd(500, "x") }), "s");
  expect(kit.summary).toHaveLength(400);
});
it("saves a kit without a summary", () => {
  const kit = parsePrep(JSON.stringify({ ...VALID_KIT_JSON, summary: 42 }), "s");
  expect(kit.summary).toBeUndefined();
});
```
(`VALID_KIT_JSON` = whichever valid fixture the file already uses for `parsePrep`.)

In new `prepHistory.test.ts`:
```ts
it("kitSummary returns the stored summary when present", () => {
  expect(kitSummary({ title: "T", situation: "S", persona: "P", goals: ["g"], summary: " Stored. " })).toBe("Stored.");
});
it("kitSummary builds a fallback from title, situation, persona and goals", () => {
  expect(kitSummary({ title: "Phỏng vấn khoá game", situation: "Tôi đi\nphỏng vấn", persona: "A strict mentor.", goals: ["Giới thiệu", "Hỏi lịch học"] }))
    .toBe("Phỏng vấn khoá game. Situation: Tôi đi phỏng vấn. A strict mentor. Goals: Giới thiệu; Hỏi lịch học");
});
it("kitSummary caps at 400 chars", () => {
  expect(kitSummary({ title: "T", situation: "x".repeat(900), persona: "", goals: [] }).length).toBe(400);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/conversationPrepPrompt.test.ts src/lib/prepHistory.test.ts`
Expected: FAIL (`summary` missing from prompt; `prepHistory` module not found).

- [ ] **Step 3: Implement**

- Prompt: add `"summary": "..."` to the JSON schema line and a bullet: `"summary": in English, 1 to 3 sentences of story facts a later situation could continue from — what happens, who is involved (names/roles as in the dialogue), and the main thing the learner practises. No Vietnamese, no talk about the learner preparing or the app.`
- `parsePrep`: `const summary = str(json.summary).slice(0, PREP_SUMMARY_MAX)`; include `summary` in the result only when non-empty. Import `PREP_SUMMARY_MAX` from `prepHistory.ts`.
- `kitSummary`: stored summary (whitespace-collapsed, trimmed) if non-empty; else join the non-empty pieces `title`, `Situation: <situation>`, `persona`, `Goals: <goals joined by "; ">` with `". "`, collapse whitespace, slice to 400.

- [ ] **Step 4: Run tests — PASS**, then `npx tsc --noEmit -p .` — no errors.

- [ ] **Step 5: Commit** — `feat(web): Chuẩn bị kits store a short story summary`

---

### Task 2: Earlier-kit summaries in kit memory and the prompt

**Files:**
- Modify: `apps/web/src/lib/conversationPreps.ts` (`listRecentConversationPreps` → `max` optional, no limit when omitted)
- Modify: `apps/web/src/lib/prepMemory.ts` (`KitMemory.history`, `loadKitMemory`)
- Modify: `apps/web/src/lib/conversationPrepPrompt.ts` (`kitMemorySection`)
- Modify: `apps/web/src/lib/learnerMemoryTypes.ts` (`export const KIT_PROMPT_HISTORY = 50;`)
- Test: `apps/web/src/lib/conversationPreps.test.ts`, `apps/web/src/lib/prepMemory.test.ts`, `apps/web/src/lib/conversationPrepPrompt.test.ts`

**Interfaces:**
- Consumes: `kitSummary` (Task 1).
- Produces: `listRecentConversationPreps(uid: string, max?: number): Promise<ConversationPrep[]>` (newest first; no `limit()` when `max` undefined); `export interface KitHistoryItem { title: string; createdAt: string; summary: string }`; `KitMemory.history: KitHistoryItem[]`.

- [ ] **Step 1: Write failing tests**

- `conversationPreps.test.ts`: `listRecentConversationPreps("u1")` builds a query without `limit` (assert the mocked `limit` is not called) and returns all docs.
- `prepMemory.test.ts` (mock `./conversationPreps`' `listRecentConversationPreps`):
  - `"includes the 50 newest earlier kits as history, newest first"` — 55 kits returned newest-first → `mem.history` length 50, `history[0].title` = first kit's title, each `summary` = `kitSummary(kit)`, `createdAt` copied.
  - `"returns undefined when the kit history read fails"` — `listRecentConversationPreps` rejects → `undefined`.
  - Existing tests: default the new mock to `[]`.
- `conversationPrepPrompt.test.ts`:
  - `"lists earlier kits with dates and gates them on relevance"` — memory `{ patterns: [], words: [], targets: [], history: [{ title: "Phỏng vấn khoá game", createdAt: "2026-11-02T08:00:00.000Z", summary: "Minh interviews\nfor a game course." }] }` → prompt contains `"[2026-11-02] Phỏng vấn khoá game: Minh interviews for a game course."`, contains `"only if"`, contains `"Ignore every unrelated one"`, contains `"Never say the learner prepared"`.
  - `"omits the history section when history is empty"` — no `"Earlier situations"` in the prompt.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/conversationPreps.test.ts src/lib/prepMemory.test.ts src/lib/conversationPrepPrompt.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `loadKitMemory`: add `listRecentConversationPreps(uid)` to the existing `Promise.all`; `history = kits.slice(0, KIT_PROMPT_HISTORY).map(k => ({ title: k.title, createdAt: k.createdAt, summary: kitSummary(k) }))`. Any rejection still returns `undefined`.
- `kitMemorySection`: when `memory.history.length > 0`, push this section **first** (before coverage and targets). Each line `- [YYYY-MM-DD] <title cleaned>: <summary whitespace-collapsed>` (date = `createdAt.slice(0, 10)`; do not use `clean()` on the summary — it caps at 120; collapse whitespace and keep ≤ 400). Section copy:

```
Earlier situations this learner prepared (newest first). Some may belong to the same ongoing story as the new situation (the same course, job, trip or people); most will not.
<lines>
If — and only if — the new situation clearly continues or refers to one of these, keep its people, names and facts consistent and build on what already happened instead of repeating it. Ignore every unrelated one completely and never mention it. Never say the learner prepared anything before.
```

- [ ] **Step 4: Run tests — PASS**; `npx tsc --noEmit -p .` — no errors (the create page's call to `listRecentConversationPreps(user.uid)` keeps compiling).

- [ ] **Step 5: Commit** — `feat(web): new Chuẩn bị kits see earlier kits' summaries and continue related ones`

---

### Task 3: Full history with paging and search; docs

**Files:**
- Modify: `apps/web/src/lib/prepHistory.ts` (add `foldText`, `matchesPrepQuery`)
- Modify: `apps/web/src/components/conversation/prep/RecentPreps.tsx`
- Modify: `apps/web/src/app/(app)/conversation/prep/page.tsx` (already loads with no `max` after Task 2 — confirm the call passes no `max`)
- Modify: `apps/web/src/styles/bloom.css` only if the reused `.vb-search` / `.btn-secondary` need a prep-specific spacing rule
- Modify: `README.md` (Chuẩn bị bullet, line ~102), spec status line, `.superpowers/sdd/progress.md` (one entry)
- Test: `apps/web/src/lib/prepHistory.test.ts`, `apps/web/src/components/conversation/prep/PrepCards.test.tsx`, `apps/web/src/app/(app)/conversation/prep/page.test.tsx`

**Interfaces:**
- Consumes: `kitSummary`/`PREP_SUMMARY_MAX` (Task 1), unlimited `listRecentConversationPreps` (Task 2).
- Produces: `foldText(s: string): string` (lowercase, NFD, strip `\p{M}`, `đ`→`d`); `matchesPrepQuery(prep: Pick<ConversationPrep, "title" | "situation" | "summary">, query: string): boolean` (empty/whitespace query → true); `RecentPreps` props unchanged (`preps`, `onDelete`), with internal query + page state; `export const PREP_HISTORY_PAGE = 20`.

- [ ] **Step 1: Write failing tests**

- `prepHistory.test.ts`:
  - `matchesPrepQuery({ title: "Lập trình game", situation: "", summary: undefined }, "lap trinh")` → true
  - `matchesPrepQuery({ title: "Đi Đà Lạt", situation: "", summary: undefined }, "da lat")` → true
  - matches on `situation` and on `summary`; `"  "` → true; `"tokyo"` against a game kit → false.
- `PrepCards.test.tsx` (`RecentPreps`):
  - heading `"Lịch sử"`.
  - 45 kits → 20 rows; click `"Xem thêm"` → 40; again → 45 and `"Xem thêm"` gone.
  - type `"game"` into the box labelled `"Tìm bộ tài liệu"` → only matching kits show (even ones beyond the first page); type `"zzz"` → `"Không tìm thấy bộ tài liệu nào."`; clear (✕, `aria-label="Xoá tìm kiếm"`) → back to 20 rows.
  - existing delete and empty-state tests unchanged.
- `page.test.tsx`: `listRecentConversationPreps` is called with only the uid; with a query active, deleting a matching kit removes it from the results.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/prepHistory.test.ts src/components/conversation/prep/PrepCards.test.tsx "src/app/(app)/conversation/prep/page.test.tsx"`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `RecentPreps`: search box reusing the vocab-bank markup (`div.vb-search` > `input type="text"` with `aria-label="Tìm bộ tài liệu"`, placeholder `"Tìm bộ tài liệu…"`, ✕ clear button `.vb-search-clear`) shown only when there is at least one kit. `shown = query.trim() ? preps.filter(p => matchesPrepQuery(p, query)) : preps.slice(0, visible)`; `visible` starts at `PREP_HISTORY_PAGE`, resets when the query changes; `"Xem thêm"` (`btn-secondary`) only when not searching and `visible < preps.length`.
- Page: confirm `listRecentConversationPreps(user.uid)` (no max). Delete already filters `recent`, so search results update.
- Docs: README Chuẩn bị bullet — add: new kits continue related earlier kits (via short summaries, only relevant ones, when Dùng trí nhớ is on); history shows all kits with search. Spec status → `Implemented (2026-11-11).` Progress ledger entry.

- [ ] **Step 4: Run** the three test files — PASS; then full `npx vitest run` — all pass; `npx tsc --noEmit -p .` — no errors.

- [ ] **Step 5: Commit** — `feat(web): Chuẩn bị history shows every kit with paging and search`
