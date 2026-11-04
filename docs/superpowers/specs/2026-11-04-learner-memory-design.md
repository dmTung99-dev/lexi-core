# LexiCore — Learner memory for Hội thoại and Phỏng vấn (web)

**Date:** 2026-11-04
**Status:** Implemented (branch feat/learner-memory, 2026-11-04).
**Covers:** Cross-session memory so a new Hội thoại doesn't repeat what earlier ones on the same topic already covered, and a shared list of the learner's recurring English mistakes that both Hội thoại and Phỏng vấn practise with spaced repetition.
**Builds on:** `2026-10-09-conversation-practice-design.md` (Hội thoại), the interview practice spec, `2026-11-03-conversation-prep-design.md` (`prepId`), and the "Lưu & thoát / Đang dở" change (commit `ab73229`).

---

## 1. Why

The owner practises the same topics repeatedly (e.g. Du lịch). Each Hội thoại starts from zero, so two sessions about the same place ask nearly the same questions ("What did you do there?", "What was the food like?") and the second one teaches nothing new. Separately, the end-of-session reports already find recurring mistakes, but nothing carries them forward, so the same mistake is never deliberately practised again.

Success looks like:

- A second Travel chat that touches Đà Lạt again goes somewhere new: a bit deeper on what wasn't said, or onto a different angle, without the learner re-answering old questions.
- A mistake found once keeps coming back as a natural chance to use the right form, until the learner has used it correctly several times; then it returns only occasionally, like vocab review.

## 2. Goals, non-goals, anti-goals

**Goals**

1. **Topic memory (Hội thoại only):** per topic group, remember short facts the learner shared and which angles were already asked; feed it to the conversation AI.
2. **Mistake memory (shared by Hội thoại and Phỏng vấn):** one list of recurring mistakes per learner, scheduled with the existing SM-2 (`apps/web/src/lib/sm2.ts`), fed to both features as practice targets and graded at the end of each session.
3. **Memory page:** the learner can see everything remembered and delete individual items. No editing.

**Non-goals**

- Flutter app. Backend / Cloud Functions / Cloud Run changes. Firestore rules changes (the deployed `users/{uid}/{document=**}` owner rule already covers the new paths).
- An on/off switch for memory, editing memory items, exporting memory.
- Topic memory for Phỏng vấn (each mock interview should feel like a fresh round).
- Showing mistake-check results in the session reports (may come later).
- Memory for Chuẩn bị tình huống kit generation.

**Anti-goals (would be a failure even if it technically works)**

- The AI **interrogates**: digs for tiny details or private matters, or keeps drilling one thing after short answers. It should deepen lightly, like a friend, and know when to move on.
- The AI **announces the memory**: opening with "Last time you told me…". Memory works in the background; it may reference a past detail only when that is natural mid-conversation.
- The chat turns into a **grammar drill**: practice targets must be woven into natural questions, at most 2–3 per session, and the AI still never corrects during the chat.
- Memory **breaks a session**: any memory read/write failure must leave the feature working exactly as it does today.

## 3. Data

All under `users/{uid}/`, web only.

### 3.1 Mistakes: `users/{uid}/learner_memory/mistakes` (one document)

```ts
interface TrackedMistake {
  id: string;                 // random, stable
  pattern: string;            // Vietnamese description (as in ConversationMistake.pattern)
  rule: string;               // one Vietnamese sentence (as in ConversationMistake.rule)
  example: { said: string; better: string }; // most recent example, English
  source: "conversation" | "interview";       // where it was first found
  createdAt: string;          // ISO
  lastSeenAt: string;         // ISO, last session that graded or re-found it
  sm2Repetitions: number;     // SM-2 fields, same meaning as vocab records
  sm2EaseFactor: number;      // starts 2.5
  sm2Interval: number;        // days
  nextReviewAt: string;       // ISO; a new mistake is due immediately
}

interface MistakeMemory { items: TrackedMistake[]; updatedAt: string }
```

- **Status is derived, not stored:** `sm2Repetitions >= 3` → "Đã quen", otherwise "Đang luyện". (3 consecutive correct uses = familiar, per the owner.)
- **Cap 20 items.** When full, drop the "Đã quen" item with the latest `nextReviewAt` first, then the oldest `lastSeenAt`.

### 3.2 Topic memory: `users/{uid}/conversation_memory/{groupKey}`

```ts
interface TopicFact {
  id: string;
  fact: string;        // English, one short line: what the learner shared
  asked: string[];     // English, short angles already covered ("food", "weather")
  updatedAt: string;   // ISO
}

interface TopicMemory {
  key: string;         // = document id
  label: string;       // Vietnamese display name for the memory page
  facts: TopicFact[];  // cap 12; oldest updatedAt dropped first
  updatedAt: string;
}
```

**Group key** (pure function `memoryGroupKey(setup)`):

| Session started from | key | label |
|---|---|---|
| A Chuẩn bị tình huống kit (`setup.prepId`) | `prep_<prepId>` | the kit title (`setup.topic`) |
| A built-in topic card or role-play preset | `topic_<presetId>` / `roleplay_<presetId>` | the card/preset title |
| Typed-in topic, or a custom role-play | `free` | "Tự do" |

This needs `presetId` on `ConversationSetup` (new optional field, set by `draftToSetup` only for built-in cards, never for `CUSTOM_PRESET_ID`). Fix while here: the setup page must drop the stored `prepId` once the learner changes mode or picks another card after a `?prep=` prefill (open review note from the prep feature), or a different scenario would be filed under the kit.

### 3.3 Session snapshot

Memory is read **once when a session is created** and stored on the session document, so a resumed session (other device, "Đang dở") uses exactly the same memory and the grader knows which mistakes were targets:

- `ConversationSession.memory?: { groupKey: string; groupLabel: string; facts: TopicFact[]; targets: MistakeTarget[] }`
- `InterviewSession.targets?: MistakeTarget[]`
- `MistakeTarget = { id: string; pattern: string; rule: string; example: { said; better } }`

**Targets** = due mistakes (`nextReviewAt <= now`), "Đang luyện" before "Đã quen", then oldest `nextReviewAt`; at most **3** for Hội thoại and **2** for Phỏng vấn.

- When the read succeeds the snapshot is **always written, even with empty arrays** (first session ever), so `memory` present = "memory was read".
- If reading memory fails, the session is created without the field and its **chat prompts** behave as today. Old sessions without the field likewise.
- The snapshot only steers the chat/plan prompts. **Grading does not depend on it** (§5): sessions without a snapshot still learn mistakes and topic facts at grading time.

## 4. How the AI uses memory

### 4.1 Hội thoại (opening + reply prompts, `conversationPrompts.ts`)

When `session.memory` exists, `buildOpeningPrompt` and `buildReplyPrompt` get an extra section, roughly:

- *"What you already know about this learner from earlier chats on this topic"* — the facts with their asked angles.
- Rules:
  - Do not ask again about angles already covered; when the learner returns to a known subject, ask about something not yet covered or how they feel about it now. Deepen lightly; never press for small details or private matters.
  - If answers get short, or a subject has been covered well, move to a different angle or a neighbouring subject.
  - Do not open by saying you remember; mention a past detail only if it fits naturally.
- *"Practice targets"* — the targets' pattern/rule/example, with: create natural chances for the learner to use these forms (e.g. ask about a past event for a past-tense target); never correct, never mention the targets. The reply prompt includes this section only on the learner's user turns 2, 5, 8 and 11 (the model sees just a recent window and cannot count, so the app decides), worded as "if it fits naturally, let your question this turn invite one of these forms".

The suggest/hint prompts are unchanged.

### 4.2 Phỏng vấn (`buildQuestionPlanPrompt`)

When `session.targets` exists, the plan prompt adds: shape up to 2 questions so that answering them naturally needs these forms (e.g. "Tell me about a time…" for past tense), staying a realistic interviewer question. Follow-up prompt unchanged. No topic memory.

## 5. Updating memory at the end of a session

Done in the **existing grading call** (no extra AI call), only after a report parses. "Lưu & thoát" never updates memory. A failed grading leaves memory untouched.

**Base = fresh read at grading time, never the snapshot.** Right before building the report prompt, grading reads the current mistakes document and (Hội thoại) the current topic-memory document for the group. The snapshot can be days old (resumed via "Đang dở", another device), and using it as the base would resurrect items the learner deleted on the memory page or overwrite a newer session's update.

- If the mistakes read fails: send no tracked mistakes, still ask for `recurringMistakes`, and **skip the mistakes write** for this session (never write a merge built on an unknown base).
- If the topic read fails: send no previous facts and **skip the topic write**.
- A missing document (first time) is not a failure; it is an empty base.
- The write re-reads nothing further: last writer wins between two devices grading at the same moment, which is acceptable for a single-user app.

**Group key at grading:** `session.memory.groupKey` when the snapshot exists, else `memoryGroupKey(session.setup)`. Older setups have no `presetId`, so their topic-card sessions fall into `free` (or `prep_<id>` when `prepId` exists); that is acceptable.

**Exactly once per session:** grading sets `memoryApplied: true` on the session document after a successful memory write (or after deciding both writes are skipped). The **"Chấm lại" (regrade) button on both report pages** (`conversation/[id]/report`, `interview/[id]/report`), which reruns a grading that failed, also updates memory, but only when `memoryApplied` is not `true`. So the memory-aware prompt inputs, the fresh read and the merge live in one shared helper per feature, used by both the session page's grading step and the report page's regrade.

### 5.1 Report prompt additions

Both report prompts (Hội thoại and Phỏng vấn alike) receive the **tracked mistakes** from the fresh read (all current items, id + pattern + rule; none if the read failed) and, for Hội thoại, the group's current facts. They return extra fields:

- `mistakeChecks: [{ id, result: "correct" | "wrong" }]` — only for tracked mistakes the learner had a real chance to use in this session; omit the rest ("không có dịp dùng").
- Hội thoại: each `recurringMistakes` item gets optional `trackedId` when it is the same mistake as a tracked one.
- Phỏng vấn: new `recurringMistakes` field, same shape as Hội thoại's (max 3, with optional `trackedId`), used for memory only — not displayed in the interview report this iteration.
- Hội thoại only: `topicFacts: [{ fact, asked[] }]` — the **full updated list** for this group: previous facts merged with what this session added, rewritten short, max 12, in English. Transcription-error and STT caveats from the existing prompt still apply.

Parsers ignore unknown ids, invalid results, and malformed items; a missing block means "no change" for that part. Old-format AI output keeps the report working.

### 5.2 Merge (pure, unit-tested functions)

- `mistakeChecks`: `correct` → `computeSm2(item, 4)`; `wrong` → `computeSm2(item, 1)`; update `lastSeenAt`.
- A `recurringMistakes` item with a valid `trackedId` and no check → treated as `wrong`; its example replaces the stored one.
- Without `trackedId` → new `TrackedMistake` (repetitions 0, ease 2.5, interval 0, due now). The AI is the only de-duplicator; no fuzzy matching on our side.
- Apply the cap (§3.1).
- `topicFacts` → replace the group's facts (new ids for new lines are fine), apply cap, set `label`.
- Writes are best-effort (`.catch(() => {})`), after the session is marked completed, and never block navigation to the report.

## 6. Memory page

- Route `/conversation/memory`, title "AI nhớ gì về bạn". Entry: a card on the Hội thoại setup page next to "Chuẩn bị tình huống", and a small link on the Phỏng vấn setup page.
- Section **Lỗi hay mắc**: each item shows pattern, rule, example (said → better), a status chip ("Đang luyện" / "Đã quen"), and when it comes back ("Nhắc lại: 12/11"). Delete button per item (confirm).
- Section **Nội dung đã kể**: one block per topic group (label), each fact with its asked angles; delete per fact (confirm), and delete a whole group (confirm).
- Empty state explains memory fills in after finishing and grading a session.
- Follows Bloom + phone-mode rules from `CLAUDE.md` (font-size `calc(... var(--type-scale))`, ≥44px touch targets).

## 7. Modules (suggested)

- `lib/learnerMemoryTypes.ts` — types above.
- `lib/learnerMemory.ts` — Firestore read/write/delete for both docs.
- `lib/learnerMemoryMerge.ts` — `memoryGroupKey`, `pickTargets`, `applyMistakeUpdate`, `applyTopicUpdate`, caps.
- One grading helper per feature (fresh read → prompt inputs → after parse: merge + write + `memoryApplied`), shared by the session page grading step and the report page "Chấm lại".
- Prompt/parser changes in `conversationPrompts.ts`, `conversationReportPrompt.ts`, `interviewPrompts.ts`, `interviewReportPrompt.ts`.
- Session creation (`createConversationSession` / `createInterviewSession` callers) takes the snapshot; grading steps in both `[id]/page.tsx` call the merge.
- `app/(app)/conversation/memory/page.tsx` + components under `components/conversation/memory/`.

## 8. Testing

- Unit: group key table; target picking/order/limits; SM-2 transitions incl. "3 correct → Đã quen"; caps/eviction; parsers with valid, partial, malformed and old-format output.
- Prompt tests: memory/target sections present only when the snapshot exists; anti-goal rules present.
- Page tests: snapshot stored at creation (also when empty) and survives resume; grading reads fresh memory, not the snapshot (an item deleted mid-session stays deleted); a failed read skips that write; "Chấm lại" applies memory once and never twice (`memoryApplied`); a session without a snapshot still updates memory; memory failures don't block session or report; memory page lists and deletes.
- Manual with a real AI key: two Travel chats mentioning the same place ask different things; a past-tense target produces a natural past-event question; the interview plan includes a target-shaped question.

## 9. Left to the builder

Exact prompt wording; copy text on the memory page; component split; how the memory page is reached on phones beyond the setup-page card.
