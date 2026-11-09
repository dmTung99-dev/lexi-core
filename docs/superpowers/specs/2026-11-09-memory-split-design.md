# LexiCore — Memory split, Chuẩn bị tình huống memory, and the "Dùng trí nhớ" switch (web)

**Date:** 2026-11-09
**Status:** Design approved in brainstorming; spec awaiting owner review.
**Covers:** Splitting learner memory into a Hội thoại/Phỏng vấn store and a new Chuẩn bị tình huống store (with one shared mistake list), giving kit generation a memory, adding a per-screen "Dùng trí nhớ" switch that turns memory *use* off but never memory *writing*, and the rules that keep the stores from conflicting.
**Builds on:** `2026-11-04-learner-memory-design.md` (learner memory), `2026-11-03-conversation-prep-design.md` (prep kits).
**Deferred, separate spec later:** a "Tất cả" / cumulative CEFR level picker weighted toward the top level on every screen with a level picker.

---

## 1. Why

- Role-play sessions started from a prep kit currently write their facts into the same topic memory as ordinary Hội thoại (`conversation_memory/prep_<id>`). Kit scenes are invented ("the task is three days late"), so mixing them with what the learner really shared is the main source of memory conflicts.
- Kit generation does not use memory at all, so consecutive kits on related situations repeat the same patterns and words, and the learner's recurring mistakes never show up in a kit.
- There is no way to start a session or a kit without the AI seeing memory, short of deleting memory.

Success looks like:

- The Hội thoại memory only ever contains things the learner said about themselves in ordinary Hội thoại.
- A second kit on a related situation teaches new main patterns and words; a due mistake shows up as one of its pattern cards.
- A second role-play from the same kit continues the scene instead of replaying it.
- With "Dùng trí nhớ" off, the AI sees nothing from memory, but grading still records what the session taught.

## 2. Goals and non-goals

**Goals**

1. Two content stores plus one shared mistake list:
   - **Hội thoại store:** topic memory for ordinary Hội thoại (unchanged, minus `prep_*` groups). Phỏng vấn keeps using no topic memory.
   - **Chuẩn bị store (new):** what kits have already taught (patterns, words) and per-kit role-play scene memory.
   - **Mistakes:** the existing shared list, read and written by all three features.
2. Kit generation reads the Chuẩn bị store and the mistakes (when the switch is on); creating a kit writes its patterns and words to the Chuẩn bị store (always).
3. A "Dùng trí nhớ" switch on the Hội thoại setup, the Phỏng vấn setup and the kit create form. Off = the AI sees no memory for that session/kit; writing is unaffected.
4. A contradiction rule for topic and scene facts: one line per subject, newer information replaces older.

**Non-goals**

- Kit generation reading the Hội thoại store (the stores stay fully separate; the learner can put personal details in the situation text).
- Topic memory for Phỏng vấn.
- Separate mistake lists per store.
- Editing memory items, exporting memory, Flutter, backend or Firestore rules changes (the deployed `users/{uid}/{document=**}` owner rule covers the new paths).
- Transactions for concurrent writes from two devices (last writer wins, as today).

## 3. Data

All under `users/{uid}/`, web only.

| Store | Path | Read by (switch on) | Written by (always) |
|---|---|---|---|
| Mistakes (shared) | `learner_memory/mistakes` (unchanged) | Hội thoại, Phỏng vấn, kit generation | Grading Hội thoại (incl. role-play from a kit), grading Phỏng vấn |
| Hội thoại topic memory | `conversation_memory/{groupKey}` (unchanged; no more `prep_*` docs) | Ordinary Hội thoại | Grading ordinary Hội thoại (no `prepId`) |
| Chuẩn bị coverage | `prep_memory/coverage` (new, one doc) | Kit generation | Successful kit creation |
| Chuẩn bị scene memory | `prep_scene_memory/{prepId}` (new, one doc per kit) | Role-play from that kit | Grading role-play from that kit |

### 3.1 Coverage: `prep_memory/coverage`

```ts
interface CoveredPattern { pattern: string; lastSeenAt: string }   // pattern as shown on the card
interface CoveredWord { text: string; lastSeenAt: string }         // vocab item text
interface PrepCoverage {
  patterns: CoveredPattern[];   // cap 60
  words: CoveredWord[];         // cap 120
  updatedAt: string;
}
```

- Dedupe key: lower-case, trimmed, inner whitespace collapsed, straight/curly apostrophes unified. A repeat updates `lastSeenAt` instead of adding a row.
- When over the cap, drop the oldest `lastSeenAt` first.

### 3.2 Scene memory: `prep_scene_memory/{prepId}`

Same shape as `TopicMemory` (`key`, `label`, `facts: TopicFact[]` cap 12, `updatedAt`), with `key = prep_<prepId>` and `label` = the kit title. Facts describe what happened in the role-play scene and which angles were covered.

### 3.3 Switch state

- **Settings** (`users/{uid}/settings/config`, `UserSettings`) gains three booleans remembering the last choice per screen: `memoryInConversation`, `memoryInInterview`, `memoryInPrep`. Missing = `true`.
- **ConversationSetup** and **InterviewSetup** each gain `useMemory?: boolean`; **ConversationPrep** gains `usedMemory?: boolean` (reference only). Missing = `true` (old sessions and kits behave as today). Firestore never receives `undefined`: write the field only as a boolean.

### 3.4 Old data

`conversation_memory/prep_<id>` docs written before this change are migrated lazily:

- Reading scene memory for a kit: read `prep_scene_memory/{prepId}`; if it does not exist, read `conversation_memory/prep_<prepId>` instead.
- Writing scene memory: write `prep_scene_memory/{prepId}`, then delete `conversation_memory/prep_<prepId>` (best-effort).
- The memory page lists leftover `conversation_memory/prep_*` docs under Chuẩn bị, not under Hội thoại.

## 4. Reading memory (only when the switch is on)

| Screen | Snapshot / prompt input |
|---|---|
| Ordinary Hội thoại | Hội thoại group facts + up to 3 due mistakes (unchanged) |
| Role-play from a kit (`setup.prepId`) | That kit's scene facts (§3.2, with §3.4 fallback) + up to 3 due mistakes |
| Phỏng vấn | Up to 2 due mistakes (unchanged) |
| Kit generation | Coverage (§3.1) + up to 2 due mistakes |

- Switch off: Hội thoại / Phỏng vấn sessions are created **without** the memory snapshot / targets, so their chat and plan prompts are exactly today's no-memory prompts. Kit generation uses today's prompt.
- A failed read behaves like the switch being off, silently.

### 4.1 Kit prompt additions (switch on)

- *Already taught in earlier kits* — the covered patterns and words. Rule: do not use them as this kit's main pattern cards or new-vocab items; they may appear again in the dialogue as natural review.
- *Practice targets* — the due mistakes (pattern, rule, example). Rule: turn each into exactly one pattern card whose example line in the dialogue uses the correct form; never mention that it is a past mistake.
- The prompt keeps today's limits (5–8 patterns, 6–10 words). If coverage is large, send the most recent 40 patterns and 80 words only, to keep the prompt short.

## 5. Writing memory (always, regardless of the switch)

| Event | Writes |
|---|---|
| Grading ordinary Hội thoại | Hội thoại group facts + mistakes (unchanged) |
| Grading role-play from a kit | `prep_scene_memory/{prepId}` + mistakes. **Never** `conversation_memory`. |
| Grading Phỏng vấn | Mistakes (unchanged) |
| Kit created and saved | Coverage: the kit's `patterns[].pattern` and `vocab[].text`. No AI call. |
| Kit deleted | Delete `prep_scene_memory/{prepId}` and any legacy `conversation_memory/prep_<prepId>` (best-effort). Coverage is kept. |

Existing grading rules stay: the base is a fresh read at grading time (never the snapshot), memory is applied once per session (`memoryApplied`), "Lưu & thoát" never writes, failures never block the session, the report or navigation.

**Routing:** `memoryGroupKey(setup)` already returns `prep_<prepId>` for kit sessions. The storage layer (`getTopicMemory` / `saveTopicMemory`) routes keys starting with `prep_` to `prep_scene_memory/{prepId}` (with the §3.4 fallback and cleanup); every other key stays in `conversation_memory`. Grading code does not change shape.

## 6. Conflict rules

1. **Invented vs real facts:** solved by routing (§5). Built-in role-play presets in Hội thoại keep their own `roleplay_<presetId>` group, so their invented details never reach other groups.
2. **Contradictions:** the report prompt's topic-facts instruction (both stores) adds: keep one line per subject; when this session contradicts an earlier fact, replace the earlier fact with the newer information; never keep both versions.
3. **Switch off but writing on:** the AI may re-ask an old angle; the fresh-read base plus the merge instruction de-duplicates. Mistakes are only rescheduled when the learner had a real chance to use the form (existing `mistakeChecks` rule), so a session without targets does not penalise anything.
4. **Different switch states across screens** (e.g. kit created with memory off, role-play from it with memory on): each screen follows its own switch; they are independent.
5. **Two devices grading at once:** last writer wins (unchanged).

## 7. UI

### 7.1 "Dùng trí nhớ" switch

- `BloomSwitch` (existing) with label "Dùng trí nhớ" and hint "AI dựa vào những gì đã học trước đó. Tắt vẫn ghi nhớ sau buổi."
- Placed on: Hội thoại setup (near Start), Phỏng vấn setup (near Start), kit create form (under the level picker).
- Initial value from the matching Settings field; each toggle saves it back (`memoryInConversation` / `memoryInInterview` / `memoryInPrep`). A failed save keeps the on-screen value and does not block anything.
- The value at Start / Tạo is stored on the session setup / kit (§3.3), so resuming an unfinished session keeps its mode.

### 7.2 Memory page `/conversation/memory` ("AI nhớ gì về bạn")

Three sections:

1. **Lỗi hay mắc** (shared): unchanged.
2. **Hội thoại**: topic groups as today, excluding `prep_*` groups.
3. **Chuẩn bị tình huống** (new):
   - *Mẫu câu đã học* and *Từ đã học*: compact lists, delete per item (confirm). Deleting lets kits use it as a main pattern / word again.
   - *Diễn biến nhập vai*: one block per kit (title, link to `/conversation/prep/{id}` when the kit still exists), delete per fact or whole block (confirm).

Empty states per section. The prep create page gets a small link to the memory page. Phone mode rules from `CLAUDE.md` apply (font-size `calc(... var(--type-scale))`, ≥44px targets, no horizontal overflow; long English patterns wrap).

## 8. Error handling

| Case | Behaviour |
|---|---|
| Memory read fails when creating a session or kit | Same as switch off; no message |
| Memory write fails (grading, kit creation, deletes) | Ignored; session, report and kit unaffected |
| First use (docs missing) | Empty memory |
| Scene memory left for a deleted kit | Shown on the memory page without the kit link; deletable |
| Settings save of the switch fails | On-screen value used for this session/kit |

## 9. Modules (suggested)

- `lib/learnerMemoryTypes.ts`: `PrepCoverage`, caps (`MAX_COVERED_PATTERNS = 60`, `MAX_COVERED_WORDS = 120`), `KIT_TARGETS = 2`.
- `lib/learnerMemory.ts`: `prep_*` routing + legacy fallback/cleanup in `getTopicMemory` / `saveTopicMemory` / `deleteTopicMemory` / `deleteTopicFact`; `getPrepCoverage`, `savePrepCoverage`, `deleteCoveredPattern`, `deleteCoveredWord`, `listPrepSceneMemories`; `listTopicMemories` excludes `prep_*`.
- `lib/learnerMemoryMerge.ts`: `applyCoverageUpdate(prev, kit, now)` (normalise, dedupe, cap).
- `lib/conversationPrepPrompt.ts`: `buildPrepPrompt(situation, level, memory?)`.
- Report prompt topic-facts instruction: the contradiction rule.
- `lib/settings.ts`: the three booleans with `true` defaults.
- Setup pages (Hội thoại, Phỏng vấn), prep create page: switch + store `useMemory` / `usedMemory`; skip the snapshot / targets / kit memory when off.
- Prep create page: after a successful kit save, `applyCoverageUpdate` + save (best-effort). Kit delete: scene memory cleanup.
- Memory page: Chuẩn bị section components under `components/conversation/memory/`.

## 10. Testing

- **Unit:** key routing (`prep_` → scene store, others → Hội thoại store); legacy fallback read and cleanup after write; coverage normalise/dedupe/cap/eviction; `buildPrepPrompt` with and without memory (sections, rules, truncation to 40/80); report prompt carries the contradiction rule; settings defaults for missing fields.
- **Page:** switch off → session created without snapshot/targets but grading still writes; switch value saved to settings and stored on the session/kit; role-play from a kit never writes `conversation_memory`; kit creation updates coverage; kit deletion removes its scene memory; memory page shows three sections, excludes `prep_*` from Hội thoại, deletes coverage items and scene facts.
- **Manual with a real AI key:** two kits on related situations → the second has different main patterns; a due mistake appears as a pattern card; two role-plays from one kit → the second continues the scene; after a kit role-play the Hội thoại section on the memory page has no invented details; switch off → the chat shows no sign of memory, and the memory page still updates after grading.
