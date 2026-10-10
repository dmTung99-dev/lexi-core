# LexiCore — English Conversation Practice (web)

**Date:** 2026-10-09
**Status:** Draft, pending spec review
**Covers:** A new chat-style English speaking/writing practice feature. The learner talks (voice or typing) with an AI partner either about a free topic or inside a role-play scenario with goals, gets on-demand help during the chat, and a feedback report at the end.
**Platform:** Web only (`apps/web/`). No Flutter work now; Flutter parity is a later, separate spec/plan (the Firestore schema and Cloud Functions here are platform-neutral so it can reuse them).
**UI design:** https://claude.ai/artifact/9D6N3cv1cULLYjP3PyvFKU (5 artboards: Setup free topic, Chat free topic, Report, Setup role-play, Chat role-play). Where this spec and the design disagree, this spec wins (see §10).
**Depends on:** the Cloud Run TTS/STT services and the `synthesizeSpeech` / `transcribeAudio` / `warmUpSpeech` / `generateContent` callables already shipped with English Interview Practice (`docs/superpowers/specs/2026-09-27-english-interview-practice-design.md`); the BYOK settings flow (`SettingsContext`).

---

## 1. Goal

Let a Vietnamese learner practise open-ended English conversation by voice or text, on a topic of their choice or in a goal-driven role-play, without being interrupted by corrections, and finish with concrete feedback on their own sentences.

Success criteria:
- A turn (user sends → AI reply text visible) takes about **2–4 s** after the answer is sent when warm; the spoken reply starts shortly after (TTS).
- A message the user has said or typed is never lost to a transient STT/LLM/TTS failure.
- The report quotes the user's own sentences with minimal corrections, not paraphrases.
- No new Cloud Function, Cloud Run service, or npm dependency is needed.

## 2. Scope & Non-Goals

**In scope (MVP):**
- Two modes chosen at Setup: **free topic** and **role-play**.
- Setup: topic/scenario cards plus a free-text field, CEFR level (A2/B1/B2/C1), AI voice, "AI reads replies aloud" toggle, "review transcript before sending" toggle, readiness card (AI key, microphone), recent sessions.
- Chat: voice or typed input in one composer; transcript review before sending a voice message; "+ Nói thêm" to merge several segments into one turn; per-AI-message replay and translate to Vietnamese; per-user-message **"Gợi ý sửa"**; composer-level **"Gợi ý cách nói"** (both modes); end session.
- Role-play: persona + 3–4 goals, a live goal checklist with progress, AI stays in character.
- Report: overall score, four criteria, recurring mistakes, most worthwhile corrections, phrases saveable to the vocab bank, goal result for role-play.
- Session history; reopening an old report needs no AI key.

**Non-goals (deferred):**
- Pronunciation scoring (Whisper returns text only; the report says so).
- Realtime/streaming voice, barge-in, sending several separate messages before the AI replies.
- Flutter parity; storing audio (the learner's recordings are only kept in browser memory for "Nghe lại giọng tôi", §4.4 — never uploaded or persisted); per-turn automatic correction.
- Practising again only the weak sentences; leaderboards/streaks.

## 3. Architecture & Infrastructure

No infrastructure changes. All AI work is prompt-level over the existing `generateContent` callable; speech uses the existing `transcribeAudio` and `synthesizeSpeech` callables. On opening `/conversation` the page calls `warmUpSpeech` once (best-effort), as English Interview does.

New code is a parallel feature module (`conversation*`) that **reuses** the existing building blocks without modifying their behaviour: `useRecorder`, `transcribeAudioClient`, `warmUpSpeechClient`, TTS playback (`useInterviewAudio`, wrapped or generalised only if its naming/interface blocks reuse; no behaviour change to Interview), `splitSentences`, `wordDiff` / `WordDiff`, and the "save phrase to vocab" flow (`getVocabRecordByHeadword` → `saveVocabRecord`, language `english`). English Interview code is not refactored in this work; a shared "voice turn engine" is deliberately not extracted yet.

### 3.1 Routes

- `/conversation` — Setup (+ recent sessions).
- `/conversation/[id]` — Chat.
- `/conversation/[id]/report` — Report.
- Sidebar gains a "Hội thoại" item next to "Phỏng vấn".
- English-only regardless of `settings.targetLanguage`; phrase saves go to `vocab_records_english`.

### 3.2 Firestore data

`users/{uid}/conversation_sessions/{id}` (same trust model as other user subtrees; client-side SDK):

```ts
type ConversationLevel = "A2" | "B1" | "B2" | "C1";

interface ConversationSession {
  id: string;
  createdAt: string;                 // ISO
  status: "in_progress" | "completed";
  setup: {
    mode: "topic" | "roleplay";
    topic: string;                   // topic, or scenario title/description
    level: ConversationLevel;
    voice: string;                   // same voice ids as English Interview
    speakAloud: boolean;
    reviewTranscript: boolean;
    persona: string | null;          // role-play: who the AI plays
    goals: string[];                 // role-play: 3–4 goals; [] for topic mode
  };
  summary: string;                   // rolling summary of older messages ("" at start)
  summarizedCount: number;           // how many messages are folded into `summary`
  messages: ConversationMessage[];
  goalsDone: number[];               // role-play: indices into setup.goals; [] for topic
  report: ConversationReport | null; // null until graded, or grading failed
  reportError: boolean;
}

interface ConversationMessage {
  role: "ai" | "user";
  text: string;                      // for a merged user turn: segments joined with a space
  hint?: ConversationHint;           // cached result of "Gợi ý sửa" (user messages only)
}

interface ConversationHint {
  corrected: string;                 // minimal edit of the user's text, same meaning
  note: string;                      // Vietnamese explanation
  alternatives: string[];            // 0–2 more natural phrasings, English
}
```

- The session doc is created when the learner taps Start on Setup, before the opening is generated; the chat page then generates the opening and appends it as the first message. If the opening fails, an empty `in_progress` doc remains (hidden from lists, since it has no messages and is not `completed`). Every message is persisted (`updateDoc` of the full `messages` array, plus `goalsDone` / `summary` when changed) as soon as it completes, so a closed tab still leaves a gradable session.
- No audio is stored. At most 30 user turns plus 31 AI messages stay far under Firestore's 1 MB doc limit.
- "Recent sessions": fetch 20 ordered by `createdAt` desc (single-field index), filter `completed` sessions client-side, show at most 5 (same as English Interview).
- Interrupted `in_progress` sessions are not listed on Setup (same as English Interview) — a deliberate parity decision; they can be reopened by URL and resume.
- **Security rules:** there is no `firestore.rules` in the repo. Before shipping, confirm in the Console that `users/{uid}/{document=**}` restricts read/write to `request.auth.uid == uid` (already required for English Interview; covers this new subcollection).

## 4. Session Flow

### 4.1 Start

1. User picks a card or types a topic, sets level/voice/toggles, taps "Bắt đầu".
2. Navigate to `/conversation/[id]` in state `warming`.
3. Role-play with a **preset** scenario: persona and goals come from `conversationScenarios.ts` (editable on Setup before starting). Role-play with a **custom description**, or a free-text topic: no extra call for topic mode; for custom role-play a `scenario` call returns `{persona, goals}` and the result is shown on Setup for the user to confirm/edit before Start.
4. An `opening` call produces the AI's first message (topic mode: an open question at the learner's level; role-play: an in-character line). The session doc already exists (created at Start, before this call); the chat page appends the opening as the first message, shows it, and reads it aloud if `speakAloud` → `idle`.

### 4.2 Turn state machine

Pure reducer in `lib/conversationMachine.ts` (no I/O; the page drives side effects from transitions), same pattern as `interviewMachine`:

```
warming → aiSpeaking → idle → recording → transcribing → review → aiThinking → aiSpeaking → … → grading
```
- There is no separate sending/closing phase: Send persists the user message and enters `aiThinking`; the AI's final line (all role-play goals done, or the 30-turn cap) is spoken, then the machine goes to `grading`. Failures add `sttError` and `replyError`.
- Extra events: `CANCEL_RECORDING` (recording → idle, keeps earlier segments) and `DISMISS_STT_ERROR` (sttError → idle, so the learner can type instead); the Composer exposes them as "Hủy ghi âm" and "Gõ thay vì nói".
- Ending while composing (idle/review/recording/sttError/transcribing): the pending text and earlier segments are saved as a final user message before grading. A resumed session whose last AI line was already final goes straight to grading. With "AI đọc to" off, the final closing line stays visible ~2.5 s before grading.
- Typing skips `recording` and STT: typed text goes `idle → aiThinking` on Send. `review` applies only to voice transcripts (the transcript lands in the composer for editing); it is skipped, going `recording → transcribing → aiThinking`, when `setup.reviewTranscript` is false.
- **"+ Nói thêm"** at `review`/`idle` with a pending segment: keeps the pending text, returns to `idle`/`recording` for another segment; segments are concatenated into one user message on Send. One user message always gets exactly one AI reply (strict alternation).
- Recording auto-stops at 3:00. The user can stop AI audio at any time and answer.
- Turn counter counts user messages.
  - **Topic mode:** at user turn 12 the `reply` call is told to offer to wrap up (`suggestEnd: true`); the UI shows a dismissible "Kết thúc nhé?" chip; the user may keep going.
  - **Role-play:** when all goals are in `goalsDone`, the AI's reply is the closing line of the scene and the AI's closing line is spoken and the machine goes to `grading`.
  - **Hard cap, both modes:** after user turn 30 the next AI reply is a closing line and the session goes to `grading`.
- "Kết thúc & xem báo cáo" is always available: grade what exists; if there are zero user messages, delete the session doc and return to Setup.

### 4.3 Per-turn processing

After the user sends message *k*:
1. Append the user message; persist.
2. `reply` call with: setup (mode, topic, level, persona, goals), `summary`, and every message not yet folded into the summary (`messages.slice(summarizedCount)`, 8–15 messages in steady state). Returns `{say, goalsDone?, suggestEnd?}`.
3. Append the AI message (merge `goalsDone` into the session set; persist); TTS and play it if `speakAloud`.
4. **Condense:** when `messages.length - summarizedCount >= 16`, fire a background `condense` call that folds `messages[summarizedCount .. length-8)` into `summary` and sets `summarizedCount = length - 8` (an absolute index, safe if messages arrive meanwhile). It does not block the next turn; if it fails, nothing changes and the next turn sends more history instead.

### 4.4 On-demand helpers (no effect on the turn order)

- **Gợi ý sửa** (per user message): calls `hint` for that message, stores the result in `messages[i].hint`. A second tap shows the cached result with no AI call.
- **Gợi ý cách nói** (composer, both modes): calls `suggest` with the setup, current goal (role-play: first not-done goal), `summary`, and the last 4 messages; returns 2–3 English example replies appropriate to the level; shown in a transient panel, not stored, not scored. Tapping an option fills the composer text so the user can read it aloud or edit it.
- **Translate** (per AI message): calls `translate`, result cached in component state for the session.
- **Nghe lại giọng tôi** (per voice-composed user message, in the chat and next to each report correction): replays the learner's own recording(s) of that message — every kept "+ Nói thêm" segment in order; a re-recorded take is dropped; typed-only messages get no button. Blobs live only in a module-level in-memory store (`recordedAudioStore`, key `conversation:<sessionId>:<messageIndex>`) for the tab's lifetime: they survive session → report navigation but are lost on reload. No Storage/Firestore change.
- TTS is chunked by `splitSentences` (≤ 500 chars), first chunk plays while later ones synthesize.

## 5. Prompts

All in `lib/conversationPrompts.ts` except `report`, which lives in `lib/conversationReportPrompt.ts`; each a `build*Prompt(input): string` + `parse*(raw): T` pair using `parseAiJsonObject`. Parsers validate shape and throw one typed error on anything missing or malformed, so callers have a single failure path.

| Prompt | Input | Output JSON |
|---|---|---|
| `scenario` | custom role-play description, level | `{ "persona": string, "goals": string[] }` (3–4 goals) |
| `opening` | setup | `{ "say": string }` |
| `reply` | setup, `summary`, unsummarized messages, user-turn count, flags (`offerEnd`, `mustClose`) | `{ "say": string, "goalsDone"?: number[], "suggestEnd"?: boolean }` |
| `hint` | one user message, setup, previous AI message | `{ "corrected": string, "note": string, "alternatives": string[] }` |
| `suggest` | setup, current goal, `summary`, last 4 messages | `{ "options": string[] }` (2–3) |
| `condense` | previous `summary`, messages to fold | `{ "summary": string }` |
| `translate` | one AI message | `{ "vi": string }` |
| `report` | setup, `summary`, all user messages (+ any cached hints), goals/`goalsDone` | see §6 |

Constraints put in the `reply` prompt: 1–3 short sentences; vocabulary and grammar at the stated CEFR level; end with a question or an opening for the learner to continue; never correct the learner's mistakes during the chat; role-play: stay in persona, report `goalsDone` only for goals the learner clearly completed this turn; `mustClose`/all-goals-done: say a natural closing line. `hint.corrected` must change as little as possible so `wordDiff` is meaningful.

## 6. Report

One `report` call at the end; result stored on the session, status → `completed`. On failure: `completed`, `reportError: true`; the report page offers "Chấm lại" (re-runs from stored data).

```ts
interface ConversationReport {
  overall: number;                       // 0–10, one decimal
  criteria: { grammar: number; vocabulary: number; fluency: number; coherence: number };
  criteriaNotes: Record<keyof ConversationReport["criteria"], string>;   // one Vietnamese line each
  recurringMistakes: { pattern: string; examples: { said: string; better: string }[] }[];  // ≤ 3
  corrections: { messageIndex: number; said: string; corrected: string; note: string }[];  // ≤ ~8, most worthwhile
  phrases: { text: string; meaning: string; example: string }[];  // 4–8 English phrases; meaning is Vietnamese
  goalResult?: { achieved: boolean; comment: string };                    // role-play only
}
```

- Feedback text (notes, pattern descriptions, comments) is Vietnamese; `said`, `corrected`, `better`, `phrases[].text` and `example` are English, `meaning` is Vietnamese. `corrected` changes as little as possible; rendered with `WordDiff`.
- Where a message already has a cached `hint`, the report prompt receives it so the report does not contradict it.
- "+x so với buổi trước" compares against the most recent previous `completed` conversation session with a report; hidden when none exists.
- The report states that pronunciation is not scored.

## 7. Web Components & Modules

`apps/web/src/lib/`:
- `conversationMachine.ts` — reducer + state types; also exports `joinSegments`, `canSend`, `replyFlags`, `isScenarioComplete`.
- `conversationTypes.ts` — shared session/message/report types.
- `conversationPrompts.ts` — §5 (all prompts except `report`).
- `conversationReportPrompt.ts` — the `report` prompt + parser.
- `conversationSessions.ts` — create, append message, save hint / summary / goalsDone / report / error, get by id, list recent, delete.
- `conversationScenarios.ts` — static topic cards and role-play presets (persona + goals), Vietnamese titles with English persona text.
- `conversationHistory.ts` — pure helper: given `summary`, `summarizedCount`, `messages`, returns the unsummarized window (messages not yet folded into the summary, per §4.3) and whether to condense.

`apps/web/src/components/conversation/`:
- Setup: `ModeTabs`, `ScenarioCards`, `ScenarioPreview` (persona/goals, editable), `ConversationSetupForm`, `RecentConversations`.
- Chat: `ChatThread`, `Composer` (text, mic, transcript review, "+ Nói thêm", "Gợi ý cách nói"), `HintBubble`, `SuggestPanel`, `GoalChecklist` (role-play side panel). The wrap-up chip is inline JSX in the chat page.
- Report: `ConversationReportSummary`, `CorrectionList`, `RecurringMistakes`, `PhraseSaveList`.

Reused unchanged: `useRecorder`, `transcribeAudioClient`, `warmUpSpeechClient`, `splitSentences`, `wordDiff`, `WordDiff`, the readiness card pattern (AI key + mic), Bloom styles.

No new npm dependencies.

## 8. Error Handling

Rule: a message the user has said or typed is never discarded by a failure.

| Situation | Behavior |
|---|---|
| No AI key for the active provider | Setup shows the existing "AI key missing" card linking to Settings; Start disabled. |
| Mic denied / `MediaRecorder` unsupported | Readiness card explains; typing still works, so Start stays enabled for text-only use. |
| STT error/timeout | Keep the blob in memory; "Chép lời thất bại" with **Thử lại** (resend same blob) and **Thu lại**. |
| Empty transcript | "Không nghe thấy gì — thử nói gần micro hơn." → `idle`. |
| `reply` error / bad JSON | Keep the user message (already persisted); show "AI chưa trả lời được" with **Thử lại**; session never blocks. |
| `opening` / `scenario` error | Stay in `warming` / on Setup with a message and **Thử lại**; for `opening` the session doc already exists, so a failure leaves an empty `in_progress` doc (hidden from lists). |
| `condense` error | Ignored; retried on a later turn, older messages are sent meanwhile. |
| TTS error | Text is always shown; "Nghe lại" retries; user can still answer. |
| `hint` / `suggest` / `translate` error | One shared inline error message under the thread (cleared by the next helper call); tap again to retry; no state change. |
| `report` error / bad JSON | Session saved `completed` with `reportError: true`; report page shows **Chấm lại**. |
| Cold start | `warming` copy: "lần đầu có thể mất 10–20 giây". |

## 9. Testing

- **Vitest (pure):** `conversationMachine` (all transitions; typing skips STT; "+ Nói thêm" merge; strict alternation; topic wrap-up offer at turn 12; hard cap at 30; role-play closes when all goals done; early end with zero messages; error branches); `conversationPrompts` parsers (valid, malformed JSON, missing fields, out-of-range `goalsDone`, wrong counts); `conversationHistory` (unsummarized window, condense trigger at ≥ 16 unsummarized, folds all but the last 8, failure leaves state unchanged); `conversationScenarios` (every preset has persona and 3–4 goals).
- **Component tests (Testing Library, mocked clients):** `Composer` (type / record / review / merge segments / send); `ChatThread` (a cached hint replaces the hint button, no AI call); `Composer` also covers the suggestions list / pick / close; `GoalChecklist` (progress from `goalsDone`); `CorrectionList` (diff + phrase save / already saved).
- **Manual, after deploying web:** one free-topic and one role-play session by voice end-to-end; per-turn wait warm and cold; role-play ending naturally on goal completion; reopening an old report with no AI key.

## 10. Deviations from the UI design artifact

- The first Chat mockup originally showed two consecutive user messages; that was a drawing mistake. Strict alternation applies; "+ Nói thêm" is the way to say more than one thing in a turn.
- Role-play progress is `goalsDone: number[]` (per-goal checklist), not a single `goalAchieved` flag.
- "Gợi ý cách nói" appears in **both** modes (the role-play mockup showed it first).
- No role-play Report artboard was drawn: it is the same layout as the free-topic report plus a "Kết quả mục tiêu" block.
- Custom role-play descriptions get a confirm/edit step for the AI-generated persona and goals on Setup (not drawn).
- The mic-denied state allows text-only start (not drawn).
- Persona is stored in English (it steers the AI); role-play goals are in Vietnamese (shown to the learner). No character names or avatar letters: the AI avatar is "AI".
- The mockup's mic-denied and "+ Nói thêm" states follow §8/§4.2.

## 11. Deploy Steps

1. Push web → Firebase App Hosting auto-deploys. No functions or Cloud Run changes.
2. Confirm Firestore rules cover `users/{uid}/conversation_sessions` (§3.2).
