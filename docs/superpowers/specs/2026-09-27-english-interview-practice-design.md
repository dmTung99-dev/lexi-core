# LexiCore — English Interview Practice (web)

**Date:** 2026-09-27
**Status:** Approved (design), pending spec review
**Covers:** A new voice-based English job-interview practice feature: the user speaks answers, an AI interviewer asks planned questions plus follow-ups, and a detailed report is produced at the end. Includes CV/JD import, session history, saving phrases to the vocab bank, and translating a question to Vietnamese.
**Platform:** Web only (`apps/web/`). No Flutter work.
**UI design:** https://claude.ai/artifact/1CdhrCvrncvojA52D43w7y (3 artboards: Setup, Session, Report). Where this spec and the design disagree, this spec wins (see §9).
**Depends on:** the Cloud Run TTS/STT service (`services/tts-stt/`) and the `synthesizeSpeech` / `transcribeAudio` / `generateContent` callables from React Web Plan 2; the BYOK settings flow (`SettingsContext`).

---

## 1. Goal

Let a Vietnamese learner rehearse a real English job interview by voice, turn by turn, and come away with concrete, per-answer corrections (grammar, vocabulary, STAR structure) plus model answers — using only the existing Firebase/Cloud Run stack and the user's own AI key.

Success criteria:
- A 5-question session runs end-to-end on the deployed stack with **~3–6 s** wait between the user finishing an answer and hearing the next question (warm), and at most one visible "starting up" wait (cold start) per session.
- A spoken answer is never lost to a transient STT/LLM/TTS failure.
- The report shows word-level corrections of the user's own transcript, not a paraphrase.

## 2. Scope & Non-Goals

**In scope (MVP):**
- Setup screen: role, level, interview type, question count, interviewer voice, optional CV upload, optional JD paste, "review transcript before sending" toggle.
- Session screen: planned questions + at most one follow-up per main question, turn-based recording, transcript review, "Replay question", "Translate to Vietnamese", "Skip question", "End session".
- Report screen: overall + 5 criteria scores, top-3 improvements, per-question review (word diff, strengths, gaps, model answer with TTS, 2–4 phrases saveable to the vocab bank).
- Session history (recent 5 on Setup; reopen any report).
- Infra: split STT into its own Cloud Run service; `transcribeAudio` points at it; new `warmUpSpeech` callable.

**Non-goals (explicitly deferred):**
- "Feedback after each question" mode — adds an LLM call per turn. Setup shows only "end of session" (see §9).
- "Practice the 3 weakest questions again".
- OCR for scanned PDFs (Tesseract.js or LLM vision). MVP detects the no-text case and offers DOCX/paste instead.
- Pronunciation scoring — Whisper returns text only. The report says so explicitly.
- Realtime/streaming conversation (OpenAI Realtime / Gemini Live), barge-in.
- Push-to-talk keyboard shortcut (Space).
- Flutter parity.
- Storing audio recordings or original CV files. (Added 2026-10-10: the learner can replay their own answer recordings — "Nghe lại giọng tôi" in the session thread and per question on the report — from an in-memory store only, key `interview:<sessionId>:<turnIndex>`, for the tab's lifetime; lost on reload, never uploaded or persisted. It is also offered before sending: in the transcript-review step and after a failed transcription, playing the not-yet-sent recording straight from memory.)

## 3. Architecture & Infrastructure

### 3.1 Speech services

- **New Cloud Run service `stt`**, deployed from the **same image** as `tts-stt` (no code fork):
  `gcloud run deploy stt --image=<same tts-stt image> --region=asia-southeast1 --no-allow-unauthenticated --concurrency=1 --cpu=2 --memory=2Gi --min-instances=0 --max-instances=5 --timeout=60s`
  then grant the Cloud Functions runtime service account `roles/run.invoker` on it.
  - `concurrency=1`: Whisper is CPU-bound; one request per instance makes Cloud Run scale out instead of time-slicing one vCPU across users. `cpu=2` roughly halves transcription time.
  - The existing `tts-stt` service keeps serving TTS unchanged (Piper is light; default concurrency is fine). Its `/transcribe` endpoint simply stops receiving traffic.
- **Audio format:** the browser sends `MediaRecorder` output (webm/opus, typically ~3 KB/s vs ~32 KB/s for 16 kHz WAV). faster-whisper decodes via PyAV, which sniffs container format, so this is expected to work as-is. **Plan must verify first**; if decoding fails, the only change is making `stt.py`'s temp-file suffix follow the request's content type.
- **Whisper model / language (updated 2026-10-10):** the image now ships Whisper `small` (multilingual, int8, CPU; was `base`), and the web client no longer forces `language: "en"`. With no language, `stt.py` splits the audio into ≤25 s VAD speech chunks and detects each chunk's language restricted to en/vi, biased to English (`vi` only if p(vi) ≥ 0.6 and > p(en)), so Vietnamese names/phrases are transcribed in Vietnamese instead of transliterated.
- **`transcribeAudio`** (`functions/src/transcribeAudio.ts`) reads `STT_SERVICE_URL`, falling back to `TTS_STT_SERVICE_URL` when unset (local dev with a single uvicorn). Request/response contract unchanged. Add `STT_SERVICE_URL` to `functions/.env`.
- **New callable `warmUpSpeech`** (`onCall`, `asia-southeast1`, auth required, no payload): fires `GET /health` at both service URLs in parallel and returns `{ ok: true }` regardless of individual outcomes (best-effort). `cloudRunClient.ts` currently only POSTs, so it gains a small `pingCloudRun(serviceUrl)` GET helper using the same IAM ID-token client. The web app calls it once when `/interview` mounts, so containers are starting while the user fills in the form.
- **`generateContent` is unchanged.** All AI work (CV summary, question plan, next-turn decision, report, translation) is prompt-level over the existing callable.

### 3.2 Firestore data

All under the user's own subtree; client-side SDK, same trust model as existing collections.

`users/{uid}/interview_profile/cv` (single doc, replaced on re-upload):
```ts
interface InterviewCvProfile {
  fileName: string;
  text: string;        // extracted text, truncated to 20_000 chars
  summary: string;     // AI summary, English, ≤ ~1200 chars
  topics: string[];    // 4–10 short labels shown as "AI sẽ hỏi về:" chips
  updatedAt: string;   // ISO
}
```

`users/{uid}/interview_sessions/{id}`:
```ts
interface InterviewSession {
  id: string;
  createdAt: string;               // ISO
  status: "in_progress" | "completed";
  setup: {
    role: string;
    level: "intern" | "junior" | "mid" | "senior";
    type: "behavioral" | "technical" | "hr" | "mixed";
    questionCount: 5 | 8 | 10;
    voice: "male1" | "male2" | "female1" | "female2";
    jd: string;                    // may be ""
    cvSummary: string | null;      // snapshot at session start
    reviewTranscript: boolean;
  };
  plan: string[];                  // N main questions
  turns: InterviewTurn[];
  report: InterviewReport | null;  // null until graded, or grading failed
  reportError: boolean;
}

interface InterviewTurn {
  mainIndex: number;               // 0-based index into plan
  kind: "main" | "follow_up";
  question: string;
  answer: string;                  // transcript after optional user review; "" if skipped
  skipped: boolean;
  answerSeconds: number;
}
```
- Session doc is created after the plan is generated; each turn is appended (`updateDoc` with the full `turns` array) as soon as it completes, so a closed tab still leaves gradable turns.
- No audio stored. A 10-question session with follow-ups stays well under Firestore's 1 MB doc limit.
- "Recent sessions": `orderBy("createdAt","desc"), limit(5)` — single-field index, no composite index needed.
- **Security rules:** there is no `firestore.rules` in the repo. Before shipping, confirm in the Console that `users/{uid}/{document=**}` restricts read/write to `request.auth.uid == uid` (CV text is personal data).

### 3.3 Routes

- `/interview` — Setup (+ recent sessions).
- `/interview/[id]` — Session.
- `/interview/[id]/report` — Report.
- Sidebar gains a "Phỏng vấn" item under the skills group.
- The feature is English-only regardless of `settings.targetLanguage`; phrase saves always go to `vocab_records_english`.

## 4. Session Flow

### 4.1 Start

1. User clicks "Bắt đầu phỏng vấn" → navigate to `/interview/[id]` in state `warming`.
2. In parallel: `questionPlan` LLM call; TTS of a fixed greeting ("Hi, thanks for joining today. Let's get started."). Greeting plays as soon as it is ready.
3. When the plan arrives: create the session doc, TTS question 1, play it → `idle`.

### 4.2 Turn state machine

Pure reducer in `lib/interviewMachine.ts` (no I/O; side effects are driven by the page from state transitions):

```
warming → speaking → idle → recording → review → processing → speaking → … → closing → grading → done
```
- `review` is skipped when `setup.reviewTranscript` is false (`recording → processing`).
- Recording auto-stops at 3:00.
- Machine tracks `mainIndex` and `followUpUsed` (per main question).

### 4.3 Per-turn processing

After the user sends an answer to main question *i*:
1. Append the turn to Firestore.
2. **While the user was answering**, the page already TTS'd main question *i+1* (prefetch; one clip held in memory).
3. If `followUpUsed` is false → `nextTurn` LLM call with only: setup (role/level/type), main question *i*, the answer(s) so far for *i*, main question *i+1* (or "none — last question"). Returns one of:
   - `{"action":"follow_up","say":"<question>"}` → TTS `say`, play, set `followUpUsed = true`.
   - `{"action":"next","ack":"<≤ 12 words>"}` → TTS `ack`, play ack then the prefetched clip for *i+1*.
4. If `followUpUsed` is already true → skip the LLM call; play the prefetched *i+1* directly.
5. After the last main question (and its optional follow-up): play a fixed closing line, enter `grading`.

"Skip question" records a turn with `skipped: true, answer: ""` and moves to the next main question without an LLM call.

### 4.4 TTS chunking

`lib/splitSentences.ts` splits any AI utterance into ≤ 500-char chunks on sentence boundaries (Piper's limit). Chunks are synthesized in order; the first plays while later ones synthesize.

### 4.5 Grading

One `report` LLM call with setup, CV summary, and all turns. Result stored on the session; status → `completed`; navigate to the report. On failure: status `completed`, `reportError: true`, report page offers "Chấm lại" (re-runs the same call from stored turns).

"End session" early: grade the turns so far; if there are none, delete the session doc and return to Setup.

## 5. CV Import

1. User picks/drops a `.pdf` or `.docx` (≤ 5 MB).
2. `lib/cvExtract.ts` dynamically imports `pdfjs-dist` (PDF) or `mammoth` (DOCX) — code-split so the libraries only load on upload — and returns plain text.
3. If extracted text is < 200 non-whitespace chars → `no_text` state: "Không đọc được chữ trong file này (có thể là bản scan)." with two actions: **"Tải bản DOCX"** and **"Dán nội dung CV"** (reveals a textarea; its text goes through the same summary step).
4. Truncate to 20 000 chars, call `cvSummary` → `{summary, topics[]}`, save `interview_profile/cv`.
5. Next visits load the saved profile (state "done" with file name, topics chips, "Đổi file", remove). Removing deletes the doc.

Only `questionPlan` and `report` receive CV context, and only the `summary` — never the full text. `nextTurn` receives no CV context.

## 6. Prompts

All in `lib/interviewPrompts.ts`, each a `build*Prompt(input): string` + `parse*(raw): T` pair using `parseAiJsonObject`. Parsers validate shape and throw a typed error on anything missing, so callers have one failure path.

| Prompt | Input | Output JSON |
|---|---|---|
| `cvSummary` | CV text | `{ "summary": string, "topics": string[] }` |
| `questionPlan` | setup, CV summary, JD | `{ "questions": string[] }` (exactly N; parser rejects other lengths) |
| `nextTurn` | see §4.3 | `{ "action": "follow_up", "say": string }` \| `{ "action": "next", "ack": string }` |
| `report` | setup, CV summary, turns | see below |
| `translate` | one question | `{ "vi": string }` |

Report shape:
```ts
interface InterviewReport {
  overall: number;                      // 0–10, one decimal
  criteria: { content: number; structure: number; grammar: number; vocabulary: number; fluency: number };
  criteriaNotes: Record<keyof InterviewReport["criteria"], string>;  // one Vietnamese line each
  improvements: { title: string; detail: string }[];                 // exactly 3, Vietnamese
  questions: {
    mainIndex: number;
    score: number;
    corrected: string;      // user's combined answer with minimal grammar/word fixes, same meaning
    strengths: string;      // Vietnamese
    gaps: string;           // Vietnamese
    modelAnswer: string;    // English
    phrases: string[];      // 2–4 English phrases from modelAnswer
  }[];
}
```
Feedback text is Vietnamese; `corrected`, `modelAnswer`, and `phrases` are English. The prompt instructs `corrected` to change as little as possible so the word diff is meaningful.

## 7. Web Components & Modules

`apps/web/src/lib/`:
- `interviewMachine.ts` — reducer + state types.
- `interviewPrompts.ts` — §6.
- `interviewSessions.ts` — create, append turn, save report/error, get by id, list recent, delete.
- `cvProfile.ts` — get/save/delete CV profile.
- `cvExtract.ts` — §5.
- `useRecorder.ts` — `MediaRecorder` hook: start/stop, 3-min cap, returns `{blob, seconds}`; exposes `supported` and permission state.
- `transcribeAudioClient.ts`, `warmUpSpeechClient.ts` — thin `httpsCallable` wrappers (mirror `synthesizeSpeechClient.ts`).
- `splitSentences.ts`, `wordDiff.ts` — pure helpers.

`apps/web/src/components/interview/`:
- Setup: `SetupForm`, `CvUpload` (states: empty / reading / done / no_text), `ReadinessCard` (AI key, mic permission), `RecentSessions`.
- Session: `SessionThread`, `SessionDock` (per-state controls), `InterviewerCard`, `StarTips`.
- Report: `ScoreSummary`, `ImprovementList`, `QuestionReview`, `WordDiff`.

`WordDiff` is new: the existing `components/listening/DiffText` diffs character-by-character for dictation and is not reusable here. `wordDiff.ts` computes an LCS over word tokens (punctuation attached) between the answer and `corrected`, yielding `equal | removed | added` segments, rendered as strike / highlight per the design.

Phrase save: `getVocabRecordByHeadword` → if present show "✓ đã lưu", else `saveVocabRecord` with language `english`, the phrase as headword and the model answer sentence as example. Translation results are cached in component state for the session.

Viewing an old report reads Firestore only — no AI key needed.

New dependencies: `pdfjs-dist`, `mammoth` (both dynamically imported).

## 8. Error Handling

Rule: a spoken answer is never discarded by a failure.

| Situation | Behavior |
|---|---|
| No AI key for the active provider | Setup shows the existing "AI key missing" card linking to Settings; Start disabled. |
| Mic denied / `MediaRecorder` unsupported | ReadinessCard shows the problem + how to re-enable; Start disabled. |
| STT error/timeout | Keep the blob in memory; show "Chép lời thất bại" with **Thử lại** (resend same blob) and **Thu lại**. |
| Empty transcript | "Không nghe thấy gì — thử nói gần micro hơn." → `idle`. |
| `nextTurn` error or unparseable | Treat as `next` with no ack; play prefetched question. Session never blocks on it. |
| `questionPlan` error | Stay in `warming` with an error message + **Thử lại**; no session doc yet. |
| TTS error | Question text is always shown; mark audio failed, "Nghe lại" retries; user can still answer. |
| `report` error / bad JSON | Session saved `completed` with `reportError: true`; report page shows **Chấm lại**. |
| Cold start | `warming` state copy: "lần đầu có thể mất 10–20 giây". |
| CV extraction fails / no text | `no_text` state with DOCX / paste fallbacks. |

## 9. Deviations from the UI design artifact

- Setup "Nhận xét" chips (Cuối buổi / Sau mỗi câu) are removed — only end-of-session feedback exists in MVP.
- Session dock drops "hoặc giữ phím Space".
- Report "Luyện lại 3 câu yếu nhất" button is removed.
- `CvUpload` gains the `no_text` state (not drawn in the artifact).
- "+x so với buổi trước" compares against the most recent previous `completed` session with a report; hidden when none exists.

## 10. Testing

- **Vitest (pure):** `interviewMachine` (all transitions, one-follow-up rule, stop after N, skip, error branches); `interviewPrompts` parsers (valid, malformed JSON, missing fields, wrong question count); `cvExtract` with mocked pdfjs/mammoth incl. `no_text`; `splitSentences`; `wordDiff`.
- **Component tests (Testing Library, mocked clients):** `CvUpload` 4 states; `SessionDock` per state; `QuestionReview` diff rendering and phrase save / already-saved; `ReadinessCard`.
- **Functions:** `transcribeAudio` uses `STT_SERVICE_URL` and falls back to `TTS_STT_SERVICE_URL`; `warmUpSpeech` auth required, tolerates one service failing.
- **Manual, after deploying `stt`:** webm/opus accepted by `/transcribe`; one real 5-question session; measure per-turn wait warm and cold; CV upload with a text PDF, a scanned PDF, and a DOCX.

## 11. Deploy Steps (manual)

1. Build/push is unchanged; `gcloud run deploy stt …` (§3.1) + `roles/run.invoker` grant.
2. Add `STT_SERVICE_URL` to `functions/.env`; `firebase deploy --only functions`.
3. Confirm Firestore rules (§3.2).
4. Push web → App Hosting auto-deploys.
