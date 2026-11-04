# Learner Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Hội thoại a per-topic memory of what the learner already shared, and give Hội thoại + Phỏng vấn a shared, SM-2-scheduled list of recurring mistakes, with a page to view/delete memory.

**Architecture:** Two Firestore docs per learner (`learner_memory/mistakes`, `conversation_memory/{groupKey}`). A snapshot is copied onto each new session to steer the chat/plan prompts; grading does a fresh read, asks the existing report call for a memory update, merges it with pure functions, writes it once (`memoryApplied`). All web-only, no backend.

**Tech Stack:** Next.js (apps/web), React, TypeScript, Firestore JS SDK, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-04-learner-memory-design.md`

## Global Constraints

- Web only (`apps/web/`). No Cloud Functions / Cloud Run / Firestore rules changes. No Flutter changes.
- Paths: `users/{uid}/learner_memory/mistakes` (one doc), `users/{uid}/conversation_memory/{groupKey}`.
- Caps: 20 tracked mistakes; 12 facts per topic group. Targets: max 3 (Hội thoại), max 2 (Phỏng vấn).
- "Đã quen" ⇔ `sm2Repetitions >= 3`; otherwise "Đang luyện". Derived, never stored.
- Check results: `correct` → `computeSm2(item, 4)`, `wrong` → `computeSm2(item, 1)` (from `lib/sm2.ts`, unchanged).
- New mistake: `sm2Repetitions: 0, sm2EaseFactor: 2.5, sm2Interval: 0, nextReviewAt: now`.
- Group keys: `prep_<prepId>` | `topic_<presetId>` | `roleplay_<presetId>` | `free` (label "Tự do").
- Any memory read/write failure must never block a session, grading, or the report (`.catch(() => {})`, fall back to today's behaviour).
- "Lưu & thoát" never touches memory. Memory is written at most once per session (`memoryApplied: true`).
- AI never corrects during chat and never announces memory ("Last time you told me…" is forbidden as an opener).
- Every CSS `font-size` is `calc(N * var(--type-scale))` (or `max(var(--type-min), …)` under 15px) — enforced by `styles/bloom.fontSize.test.ts`; touch targets ≥ 44px on phones.
- Run tests from `apps/web`: `npx vitest run <path>`; full suite `npx vitest run`; typecheck `npx tsc --noEmit -p .`.

## Review Focus

- AI returns `mistakeChecks` with unknown ids, duplicate ids, or bad `result` values → those entries ignored; one id is applied at most once.
- AI returns `topicFacts: []` or omits it → topic memory unchanged (never wiped by an empty/missing block).
- Regrade ("Chấm lại") on a session whose memory was already applied → no second SM-2 step.
- A fact/group deleted on the memory page while a session is "Đang dở" stays deleted after that session is graded except for facts the session itself adds back (fresh read is the base, not the snapshot).
- Over-long AI strings (facts, angles, patterns) → trimmed: `fact` ≤ 160 chars, each `asked` ≤ 40 chars and ≤ 6 per fact, `pattern`/`rule` ≤ 200 chars.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/learnerMemoryTypes.ts` (new) | Types: `TrackedMistake`, `MistakeMemory`, `TopicFact`, `TopicMemory`, `MistakeTarget`, `SessionMemorySnapshot`, `MemoryUpdate`, `FoundMistake` |
| `lib/learnerMemoryMerge.ts` (new) | Pure: `memoryGroupKey`, `mistakeStatus`, `pickTargets`, `applyMistakeUpdate`, `applyTopicUpdate`, `toTarget` |
| `lib/learnerMemory.ts` (new) | Firestore I/O for both docs + deletes |
| `lib/learnerMemoryGrading.ts` (new) | `loadSessionSnapshot`, `loadInterviewTargets`, `loadGradingMemory`, `applyGradingMemory` (shared by session pages + report pages) |
| `lib/learnerMemoryPrompt.ts` (new) | Prompt sections + `parseMemoryUpdate` shared by both report prompts |
| `lib/conversationTypes.ts`, `lib/interviewTypes.ts` | New optional fields |
| `lib/conversationSessions.ts`, `lib/interviewSessions.ts` | Create with snapshot; `mark…MemoryApplied` |
| `lib/conversationPrompts.ts`, `lib/interviewPrompts.ts` | Chat/plan prompt memory sections |
| `lib/conversationReportPrompt.ts`, `lib/interviewReportPrompt.ts` | Report prompt memory inputs, `trackedId`, interview `recurringMistakes` |
| `components/conversation/ConversationSetupForm.tsx`, `app/(app)/conversation/page.tsx`, `app/(app)/interview/page.tsx` | `presetId`, prepId fix, snapshot at creation, entry links |
| `app/(app)/conversation/[id]/page.tsx`, `app/(app)/interview/[id]/page.tsx`, both `[id]/report/page.tsx` | Grading wiring |
| `app/(app)/conversation/memory/page.tsx`, `components/conversation/memory/*` (new) | Memory page |

---

### Task 1: Types and pure merge logic

**Files:**
- Create: `apps/web/src/lib/learnerMemoryTypes.ts`, `apps/web/src/lib/learnerMemoryMerge.ts`
- Modify: `apps/web/src/lib/conversationTypes.ts` (add `presetId?: string` to `ConversationSetup`)
- Test: `apps/web/src/lib/learnerMemoryMerge.test.ts`

**Interfaces:**
- Produces (types, exactly as spec §3):
  - `TrackedMistake { id; pattern; rule; example: {said; better}; source: "conversation" | "interview"; createdAt; lastSeenAt; sm2Repetitions; sm2EaseFactor; sm2Interval; nextReviewAt }`
  - `MistakeMemory { items: TrackedMistake[]; updatedAt: string }`
  - `TopicFact { id; fact; asked: string[]; updatedAt }`, `TopicMemory { key; label; facts: TopicFact[]; updatedAt }`
  - `MistakeTarget { id; pattern; rule; example: {said; better} }`
  - `SessionMemorySnapshot { groupKey; groupLabel; facts: TopicFact[]; targets: MistakeTarget[] }`
  - `FoundMistake { pattern; rule; example: {said; better}; trackedId?: string }`
  - `MemoryUpdate { checks: { id: string; result: "correct" | "wrong" }[]; found: FoundMistake[]; topicFacts: { fact: string; asked: string[] }[] | null }`
  - Constants: `MAX_TRACKED_MISTAKES = 20`, `MAX_TOPIC_FACTS = 12`, `KNOWN_REPETITIONS = 3`, `CONVERSATION_TARGETS = 3`, `INTERVIEW_TARGETS = 2`.
- Produces (functions, `learnerMemoryMerge.ts`):
  - `memoryGroupKey(setup: ConversationSetup): { key: string; label: string }`
  - `mistakeStatus(m: TrackedMistake): "learning" | "known"`
  - `pickTargets(items: TrackedMistake[], max: number, now: Date): MistakeTarget[]`
  - `applyMistakeUpdate(items: TrackedMistake[], update: Pick<MemoryUpdate, "checks" | "found">, source: TrackedMistake["source"], now: Date, newId: () => string): TrackedMistake[]`
  - `applyTopicUpdate(prev: TopicMemory | null, key: string, label: string, topicFacts: MemoryUpdate["topicFacts"], now: Date, newId: () => string): TopicMemory | null` — returns `null` when `topicFacts` is `null` or empty (= no write).

- [ ] **Step 1: Write the failing tests** in `learnerMemoryMerge.test.ts`:

```ts
describe("memoryGroupKey", () => {
  it("prefers prepId", () => expect(memoryGroupKey({ ...ROLEPLAY, prepId: "p1", presetId: "custom", topic: "Báo cáo task A" })).toEqual({ key: "prep_p1", label: "Báo cáo task A" }));
  it("uses built-in topic card id and its Vietnamese title", () => expect(memoryGroupKey({ ...TOPIC, presetId: "travel" })).toEqual({ key: "topic_travel", label: "Du lịch" }));
  it("uses built-in role-play preset", () => expect(memoryGroupKey({ ...ROLEPLAY, presetId: "restaurant" }).key).toBe("roleplay_restaurant"));
  it("falls back to free for typed topics, custom role-plays and unknown ids", () => {
    expect(memoryGroupKey(TOPIC)).toEqual({ key: "free", label: "Tự do" });
    expect(memoryGroupKey({ ...ROLEPLAY, presetId: "custom" }).key).toBe("free");
    expect(memoryGroupKey({ ...TOPIC, presetId: "gone" }).key).toBe("free");
  });
});

describe("pickTargets", () => {
  it("returns only due items, learning before known, then oldest nextReviewAt, capped", () => {
    // items: a learning due 11-01, b known due 10-01, c learning due 10-20, d learning due 11-10 (future), now 11-04
    expect(pickTargets(items, 2, NOW).map((t) => t.id)).toEqual(["c", "a"]);
    expect(pickTargets(items, 3, NOW).map((t) => t.id)).toEqual(["c", "a", "b"]);
  });
});

describe("applyMistakeUpdate", () => {
  it("correct steps SM-2 up; three corrects make it known", ...);   // repetitions 0→1→2→3, mistakeStatus === "known"
  it("wrong resets repetitions and makes it due tomorrow", ...);    // sm2Repetitions 0, nextReviewAt = now + 1 day
  it("ignores unknown ids, invalid results and applies a duplicated id once", ...);
  it("found with valid trackedId and no check counts as wrong and replaces the example", ...);
  it("found without trackedId (or unknown trackedId) adds a new due item with source", ...); // reps 0, ease 2.5, interval 0, nextReviewAt === now
  it("caps at 20: evicts known with latest nextReviewAt first, then oldest lastSeenAt", ...);
  it("trims pattern/rule to 200 chars", ...);
});

describe("applyTopicUpdate", () => {
  it("returns null for null or empty topicFacts", ...);
  it("replaces facts, keeps label/key, caps at 12 dropping oldest, trims fact to 160 and asked to 6 x 40", ...);
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/learnerMemoryMerge.test.ts` — expect FAIL (module not found).
- [ ] **Step 3: Implement** the types and functions. `memoryGroupKey` looks up `TOPIC_CARDS` / `ROLEPLAY_PRESETS` from `lib/conversationScenarios.ts` for the label (topic card → `title`; preset → `title`); `presetId === CUSTOM_PRESET_ID` (`"custom"`) or not found → `free`. Last-update tie: an item touched by both a check and a found entry gets the check only.
- [ ] **Step 4: Run** the test — expect PASS.
- [ ] **Step 5: Commit** `feat(web): learner memory types and merge logic`.

---

### Task 2: Firestore layer

**Files:**
- Create: `apps/web/src/lib/learnerMemory.ts`
- Test: `apps/web/src/lib/learnerMemory.test.ts` (mock `firebase/firestore` + `./firebase` the same way as `conversationSessions.test.ts`)

**Interfaces:**
- Consumes: Task 1 types.
- Produces:
  - `getMistakeMemory(uid): Promise<MistakeMemory>` — missing doc → `{ items: [], updatedAt: "" }`; throws on Firestore error.
  - `saveMistakeMemory(uid, items: TrackedMistake[]): Promise<void>` — `setDoc` `{ items, updatedAt: now ISO }`.
  - `getTopicMemory(uid, key): Promise<TopicMemory | null>` — missing → `null`; throws on error.
  - `saveTopicMemory(uid, memory: TopicMemory): Promise<void>`.
  - `listTopicMemories(uid): Promise<TopicMemory[]>` — ordered by `updatedAt` desc.
  - `deleteTrackedMistake(uid, id): Promise<void>` — read-modify-write of the mistakes doc.
  - `deleteTopicFact(uid, key, factId): Promise<void>` — read-modify-write; deletes the doc when no facts remain.
  - `deleteTopicMemory(uid, key): Promise<void>`.

- [ ] **Step 1: Write failing tests**: missing mistakes doc → empty; `saveMistakeMemory` writes `{items, updatedAt}`; `getTopicMemory` missing → null; `deleteTrackedMistake` writes items without the id; `deleteTopicFact` removing the last fact calls `deleteDoc`; `listTopicMemories` uses `orderBy("updatedAt","desc")`.
- [ ] **Step 2: Run** `npx vitest run src/lib/learnerMemory.test.ts` — FAIL.
- [ ] **Step 3: Implement** with `doc(getFirebaseDb(), "users", uid, "learner_memory", "mistakes")` and `collection(…, "users", uid, "conversation_memory")`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(web): learner memory Firestore layer`.

---

### Task 3: Session snapshot at creation (+ presetId, prepId fix)

**Files:**
- Create: `apps/web/src/lib/learnerMemoryGrading.ts` (snapshot loaders only in this task)
- Modify: `lib/conversationTypes.ts` (`ConversationSession.memory?: SessionMemorySnapshot`, `memoryApplied?: boolean`), `lib/interviewTypes.ts` (`InterviewSession.targets?: MistakeTarget[]`, `memoryApplied?: boolean`), `lib/conversationSessions.ts`, `lib/interviewSessions.ts`, `components/conversation/ConversationSetupForm.tsx` (`draftToSetup`), `app/(app)/conversation/page.tsx`, `app/(app)/interview/page.tsx`
- Test: `lib/learnerMemoryGrading.test.ts`, `components/conversation/ConversationSetupForm.test.tsx`, `lib/conversationSessions.test.ts`, `lib/interviewSessions.test.ts`, `app/(app)/conversation/page.test.tsx`, `app/(app)/interview/page.test.tsx`

**Interfaces:**
- Consumes: Task 1 `memoryGroupKey`, `pickTargets`; Task 2 `getMistakeMemory`, `getTopicMemory`.
- Produces:
  - `loadSessionSnapshot(uid, setup: ConversationSetup, now?: Date): Promise<SessionMemorySnapshot | undefined>` — both reads succeed → snapshot (empty arrays allowed); any failure → `undefined`.
  - `loadInterviewTargets(uid, now?: Date): Promise<MistakeTarget[] | undefined>` — failure → `undefined`; success → array (maybe empty).
  - `createConversationSession(uid, setup, memory?: SessionMemorySnapshot)` — writes `memory` key only when defined.
  - `createInterviewSession(uid, setup, targets?: MistakeTarget[])` — writes `targets` only when defined.
  - `markConversationMemoryApplied(uid, id)`, `markInterviewMemoryApplied(uid, id)` — `updateDoc(ref, { memoryApplied: true })`.

- [ ] **Step 1: Write failing tests**:
  - `draftToSetup` sets `presetId` for a built-in card/preset, omits the key for `null` and `"custom"`.
  - `loadSessionSnapshot` with empty memory → `{ groupKey: "free", groupLabel: "Tự do", facts: [], targets: [] }`; with a rejected `getMistakeMemory` → `undefined`.
  - `createConversationSession(uid, SETUP, snap)` passes `memory: snap` to `setDoc`; without it the object has no `memory` key. Same for interview `targets`.
  - Conversation setup page: Start calls `createConversationSession("u1", expect.anything(), SNAP)` after `loadSessionSnapshot` resolves; when it resolves `undefined` the third arg is `undefined` and the session is still created.
  - Conversation setup page: after a `?prep=p1` prefill, clicking a built-in role-play preset then Start creates a setup **without** `prepId`.
  - Interview setup page: Start passes the targets from `loadInterviewTargets`.
- [ ] **Step 2: Run** those files — FAIL.
- [ ] **Step 3: Implement.** Setup pages call the loader inside `handleStart` before creating (no extra UI state). PrepId fix: clear `prepId` state whenever the draft's `presetId` changes away from `CUSTOM_PRESET_ID` or `mode` changes (an effect on `draft.presetId`/`draft.mode`, or in the `onChange` wrapper).
- [ ] **Step 4: Run** — PASS, plus `npx tsc --noEmit -p .`.
- [ ] **Step 5: Commit** `feat(web): snapshot learner memory onto new sessions; store presetId; drop stale prepId`.

---

### Task 4: Chat and plan prompts use the snapshot

**Files:**
- Create: `apps/web/src/lib/learnerMemoryPrompt.ts` (prompt sections in this task)
- Modify: `lib/conversationPrompts.ts` (`buildOpeningPrompt`, `buildReplyPrompt` / `ReplyInput`), `lib/interviewPrompts.ts` (`buildQuestionPlanPrompt`), `app/(app)/conversation/[id]/page.tsx`, `app/(app)/interview/[id]/page.tsx` (pass `session.memory` / `session.targets`)
- Test: `lib/learnerMemoryPrompt.test.ts`, `lib/conversationPrompts.test.ts`, `lib/interviewPrompts.test.ts`

**Interfaces:**
- Consumes: `SessionMemorySnapshot`, `MistakeTarget`.
- Produces:
  - `topicMemorySection(facts: TopicFact[]): string` — `""` when empty.
  - `practiceTargetsSection(targets: MistakeTarget[], kind: "conversation" | "interview"): string` — `""` when empty.
  - `buildOpeningPrompt(setup, memory?: SessionMemorySnapshot)`; `ReplyInput.memory?: SessionMemorySnapshot`; `buildQuestionPlanPrompt(setup, targets?: MistakeTarget[])`.

- [ ] **Step 1: Write failing tests**:
  - Without memory, all three prompts equal today's output (snapshot the current strings in the test via a call with `undefined`, compare to a call with no arg).
  - With facts `[{fact: "Went to Da Lat in March with family", asked: ["food","weather"]}]`, opening and reply prompts contain the fact, `food, weather`, and the rules: `Do not ask again about angles already covered`, `never press for small details or private matters`, `move to a different angle`, `Do not open by saying you remember`.
  - With targets, reply prompt contains the target `rule` and `never correct`/`never mention` wording; plan prompt (interview) contains `up to 2 questions` and the target rule.
  - Empty facts + empty targets → no memory headings at all.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; exact wording is the builder's (spec §4), but the four phrases asserted above must appear verbatim.
- [ ] **Step 4: Run** — PASS. Also run `src/app/(app)/conversation/[id]/page.test.tsx` and `src/app/(app)/interview/[id]/page.test.tsx`.
- [ ] **Step 5: Commit** `feat(web): conversation and interview prompts use the learner memory snapshot`.

---

### Task 5: Report prompts ask for a memory update

**Files:**
- Modify: `lib/learnerMemoryPrompt.ts` (add `reportMemorySection`, `parseMemoryUpdate`), `lib/conversationReportPrompt.ts`, `lib/interviewReportPrompt.ts`, `lib/conversationTypes.ts` (`ConversationMistake.trackedId?: string`), `lib/interviewTypes.ts` (`InterviewReport.recurringMistakes?: ConversationMistake[]`)
- Test: `lib/learnerMemoryPrompt.test.ts`, `lib/conversationReportPrompt.test.ts`, `lib/interviewReportPrompt.test.ts`

**Interfaces:**
- Produces:
  - `interface ReportMemoryInput { tracked: { id: string; pattern: string; rule: string }[]; facts: TopicFact[] | null }` (`facts` is `null` for interviews and when the topic read failed).
  - `reportMemorySection(input: ReportMemoryInput, kind: "conversation" | "interview"): string`
  - `parseMemoryUpdate(raw: string, trackedIds: string[], kind: "conversation" | "interview"): MemoryUpdate` — never throws; `found` comes from `recurringMistakes` (said/better of the first example; `trackedId` kept only if in `trackedIds`); `topicFacts` is `null` for interview or when the key is missing/not an array; drops malformed items.
  - `buildConversationReportPrompt(setup, summary, messages, goalsDone, memory?: ReportMemoryInput)`; `buildReportPrompt(setup, plan, turns, memory?: ReportMemoryInput)`.
  - `parseConversationReport` keeps `trackedId` on mistakes when it is a string; `parseReport` (interview) parses optional `recurringMistakes` (max 3, same shape) — absent → key omitted.

- [ ] **Step 1: Write failing tests**:
  - Without `memory`, both report prompts are unchanged except the interview prompt always asks for `recurringMistakes` (assert the JSON schema line includes `"recurringMistakes"`).
  - With memory, prompt lists each tracked `id` and asks for `"mistakeChecks"` and `"trackedId"`; conversation prompt with `facts` asks for `"topicFacts"` and includes the previous facts; with `facts: null` no `topicFacts` request.
  - `parseMemoryUpdate`: valid JSON → checks/found/topicFacts; unknown id / result `"maybe"` dropped; `topicFacts` missing → `null`; garbage string → `{ checks: [], found: [], topicFacts: null }`.
  - Old-format AI output (no new keys) still parses into the same `ConversationReport` / `InterviewReport` as today.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** `parseMemoryUpdate` reuses `parseJson` from `interviewPrompts.ts` inside try/catch.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(web): report prompts return mistake checks and topic facts`.

---

### Task 6: Grading applies memory once (session pages + "Chấm lại")

**Files:**
- Modify: `lib/learnerMemoryGrading.ts`, `app/(app)/conversation/[id]/page.tsx` (grading case), `app/(app)/interview/[id]/page.tsx` (grading case), `app/(app)/conversation/[id]/report/page.tsx` (`handleRegrade`), `app/(app)/interview/[id]/report/page.tsx` (`handleRegrade`)
- Test: `lib/learnerMemoryGrading.test.ts`, `app/(app)/conversation/[id]/page.test.tsx`, `app/(app)/interview/[id]/page.test.tsx`, `app/(app)/interview/[id]/report/page.test.tsx`

**Interfaces:**
- Consumes: Tasks 1, 2, 3 (`mark…MemoryApplied`), 5.
- Produces:
  - `interface GradingMemory { kind: "conversation" | "interview"; mistakes: TrackedMistake[] | null; topic: { key: string; label: string; prev: TopicMemory | null } | null }` — `null` part = read failed (skip that write).
  - `loadGradingMemory(uid, session: { kind: "conversation"; session: ConversationSession } | { kind: "interview"; session: InterviewSession }): Promise<GradingMemory | null>` — returns `null` when `session.memoryApplied === true`. Group key = `session.memory?.groupKey ?? memoryGroupKey(setup).key` (label likewise).
  - `toReportMemoryInput(gm: GradingMemory | null): ReportMemoryInput | undefined`
  - `applyGradingMemory(uid, sessionId, gm: GradingMemory, update: MemoryUpdate, now?: Date): Promise<void>` — writes mistakes (if `gm.mistakes` not null) via `applyMistakeUpdate`, topic (if `gm.topic` not null and `applyTopicUpdate` ≠ null), then `mark…MemoryApplied`. Each write `.catch(() => {})`; never throws.

- [ ] **Step 1: Write failing tests**:
  - `loadGradingMemory` returns `null` when `memoryApplied`; reads fresh (mocked `getTopicMemory` result used, not `session.memory.facts`); failed mistakes read → `mistakes: null` but topic still loaded; session without snapshot uses `memoryGroupKey(setup)`.
  - `applyGradingMemory` with `mistakes: null` does not call `saveMistakeMemory` but still marks applied; with `topicFacts: null` does not call `saveTopicMemory`.
  - Conversation session page: ending a graded session calls `saveMistakeMemory` and `markConversationMemoryApplied` after `completeConversationSession`, and still navigates to the report when `getMistakeMemory` rejects.
  - Interview session page: same, with `source: "interview"` on new items.
  - Interview report page: "Chấm lại" on a `memoryApplied: true` session never calls `saveMistakeMemory`; on a session without it, calls it once.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** In each grading path: `const gm = await loadGradingMemory(...).catch(() => null)` → pass `toReportMemoryInput(gm)` to the report prompt → after `completeXSession` (or after the regrade's save), `if (gm) await applyGradingMemory(uid, id, gm, parseMemoryUpdate(raw, ids, kind))`. Keep `raw` from the single AI call; no second call.
- [ ] **Step 4: Run** the listed tests, then the full suite `npx vitest run` and `npx tsc --noEmit -p .` — all PASS.
- [ ] **Step 5: Commit** `feat(web): grading updates learner memory once per session, including regrade`.

---

### Task 7: Memory page and entry points

**Files:**
- Create: `app/(app)/conversation/memory/page.tsx`, `components/conversation/memory/MistakeMemoryList.tsx`, `components/conversation/memory/TopicMemoryList.tsx`
- Modify: `app/(app)/conversation/page.tsx` (entry card next to "Chuẩn bị tình huống"), `app/(app)/interview/page.tsx` (small link), `styles/bloom.css`
- Test: `app/(app)/conversation/memory/page.test.tsx`, component tests beside the components

**Interfaces:**
- Consumes: Task 2 (`getMistakeMemory`, `listTopicMemories`, `deleteTrackedMistake`, `deleteTopicFact`, `deleteTopicMemory`), Task 1 `mistakeStatus`.
- Produces: route `/conversation/memory`, heading "AI nhớ gì về bạn"; sections `aria-label="Lỗi hay mắc"` and `aria-label="Nội dung đã kể"`.

- [ ] **Step 1: Write failing tests**:
  - Lists mistakes with pattern, rule, `said → better`, chip `Đang luyện` / `Đã quen` (reps 3), and `Nhắc lại: dd/mm`.
  - Lists topic groups by label with facts and asked angles.
  - Delete mistake / fact / group asks `window.confirm`; cancel → no call; confirm → calls the delete fn and removes the row.
  - Empty state text appears when both lists are empty; load error shows an error line, not a crash.
  - Signed-out → sign-in prompt (same pattern as other pages).
  - Conversation setup page renders a link to `/conversation/memory`; interview setup page too.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** with Bloom classes (`iv-card`, `iv-recent-row`, `btn-secondary`, `vb-chip`); new CSS only for layout, obeying the font-size rule.
- [ ] **Step 4: Run** the page/component tests and `src/styles/bloom.fontSize.test.ts` — PASS.
- [ ] **Step 5: Commit** `feat(web): AI nhớ gì về bạn page with per-item delete`.

---

### Task 8: Docs

**Files:**
- Modify: `README.md` (feature list under Hội thoại/Phỏng vấn; Firestore schema block: `learner_memory/mistakes`, `conversation_memory/{groupKey}`; follow-up checklist: manual run with a real AI key per spec §8), `.superpowers/sdd/progress.md` (ledger entry), spec status line → "Implemented".

- [ ] **Step 1:** Update the three docs.
- [ ] **Step 2:** `npx vitest run` and `npx tsc --noEmit -p .` — PASS.
- [ ] **Step 3: Commit** `docs: README, spec status and SDD ledger for learner memory`.
