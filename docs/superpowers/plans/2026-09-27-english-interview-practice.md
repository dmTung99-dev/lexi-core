# English Interview Practice (web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a web-only, voice-based English job-interview practice feature (Setup → Session → Report) per `docs/superpowers/specs/2026-09-27-english-interview-practice-design.md`.

**Architecture:** All AI work is prompt-level over the existing `generateContent` callable (BYOK). Speech uses the existing `synthesizeSpeech` (Piper) and `transcribeAudio` (Whisper) callables; `transcribeAudio` is re-pointed at a new dedicated Cloud Run service `stt` via `STT_SERVICE_URL`, and a new `warmUpSpeech` callable pings both services. The session flow is a pure reducer (`interviewMachine.ts`) driven by a client page that performs side effects on phase changes. Data lives in `users/{uid}/interview_profile/cv` and `users/{uid}/interview_sessions/{id}`.

**Tech Stack:** Next.js 16 (App Router, client components), React 19, Firebase JS SDK 12 (Firestore, Functions), Vitest 4 + Testing Library + jsdom, Firebase Functions v2 (TypeScript), `pdfjs-dist`, `mammoth`.

## Global Constraints

- Web only (`apps/web/`) plus `functions/`. No Flutter changes. No change to `services/tts-stt/` code unless Task 15's verification proves webm/opus is rejected.
- Region `asia-southeast1` on every new `onCall`.
- `apps/web/AGENTS.md`: this is Next.js 16 — read `node_modules/next/dist/docs/` before using any Next API not already used in this repo. Dynamic route pages receive `params: Promise<...>`; unwrap with the existing `useRouteParams` hook (`apps/web/src/lib/useRouteParams.ts`), exactly like `app/(app)/knowledge/note/[id]/page.tsx`.
- All pages are `"use client"` and follow the existing page pattern: `useAuthUser()`, `useSettingsContext()`, signed-out → `<SignInButton />`.
- AI calls always go through `generateContent({ provider, model, apiKeyCiphertext, prompt })` using `settings.providers[settings.activeProvider]`; parse with `parseAiJsonObject` from `@/lib/parseAiJson`.
- Styling: plain CSS appended to `apps/web/src/styles/bloom.css` using existing tokens (`var(--accent)`, `var(--surface)`, `var(--border)`, `var(--ink)`, `var(--ink-soft)`, `var(--sage)`, `var(--danger)`, etc.). New classes prefixed `iv-`. Reuse existing `btn-primary`, `btn-secondary`, `vb-chip` (+ `.active`), `scr-title`, `scr-sub`. Do not add `@import` to bloom.css (a test forbids it).
- User-facing copy is Vietnamese; interviewer speech, questions, corrected answers, model answers and phrases are English.
- Feature is English-only regardless of `settings.targetLanguage`; saved phrases go to `vocab_records_english` (`targetLanguage: "english"`).
- CV: accept `.pdf` and `.docx`, max 5 MB; extracted text truncated to 20 000 chars; `< 200` non-whitespace chars ⇒ `no_text`. Never upload the original file; store only text + summary + topics.
- Question counts: 5 | 8 | 10. At most **one** follow-up per main question. Recording auto-stops at 180 s.
- Piper TTS limit: 500 chars per `synthesizeSpeech` call.
- A spoken answer must never be discarded by an STT/LLM/TTS failure.
- Test commands: web `cd apps/web && npx vitest run <path>`; functions `cd functions && npx vitest run <path>`. Typecheck: `npm run typecheck` in each package.
- Commit after every task; message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Deliberate refinement vs spec §3.2 / §4.1

The spec says the session doc is created after the plan is generated. To give the Session route a real id (and survive reloads), **Setup creates the session doc immediately with `plan: []`**; the Session page generates and saves the plan when `plan` is empty. If plan generation fails the doc exists with an empty plan and the page offers "Thử lại"; "Kết thúc buổi" with no turns deletes it (same as spec). "Buổi gần đây" lists only `completed` sessions. Reloading an `in_progress` session resumes at the next unanswered main question.

## File Map

`functions/src/`
- Modify `services/cloudRunClient.ts` — add `pingCloudRun`.
- Modify `transcribeAudio.ts` — `STT_SERVICE_URL` with fallback.
- Create `warmUpSpeech.ts` (+ test). Modify `index.ts`.

`apps/web/src/lib/`
- `interviewTypes.ts` — all shared types/constants.
- `splitSentences.ts`, `wordDiff.ts` — pure helpers.
- `interviewPrompts.ts` — build/parse for cvSummary, questionPlan, nextTurn, translate.
- `interviewReportPrompt.ts` — build/parse for the report.
- `interviewAi.ts` — `callInterviewAi(settings, prompt)`.
- `interviewSessions.ts`, `cvProfile.ts` — Firestore.
- `cvParsers.ts` (dynamic pdfjs/mammoth), `cvExtract.ts`.
- `transcribeAudioClient.ts`, `warmUpSpeechClient.ts`, `micPermission.ts`, `useRecorder.ts`.
- `interviewMachine.ts` — reducer.
- `useInterviewAudio.ts` — TTS queue/prefetch/playback.

`apps/web/src/components/interview/`
- Setup: `CvUpload.tsx`, `ReadinessCard.tsx`, `RecentSessions.tsx`, `SetupForm.tsx`.
- Session: `SessionThread.tsx`, `SessionDock.tsx`, `InterviewerCard.tsx`, `StarTips.tsx`.
- Report: `WordDiff.tsx`, `ScoreSummary.tsx`, `ImprovementList.tsx`, `QuestionReview.tsx`.

`apps/web/src/app/(app)/interview/`
- `page.tsx` (Setup), `[id]/page.tsx` (Session), `[id]/report/page.tsx` (Report) — each with `page.test.tsx`.

Also: `components/shell/Sidebar.tsx` (nav item), `styles/bloom.css`, `README.md`.

---

### Task 1: Backend — dedicated STT URL + `warmUpSpeech` callable

**Files:**
- Modify: `functions/src/services/cloudRunClient.ts`
- Modify: `functions/src/transcribeAudio.ts`
- Modify: `functions/src/transcribeAudio.test.ts`
- Create: `functions/src/warmUpSpeech.ts`, `functions/src/warmUpSpeech.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Produces: callable `warmUpSpeech` (no payload) → `{ ok: true }`; `pingCloudRun(serviceUrl: string): Promise<void>`; `transcribeAudio` now resolves its URL as `process.env.STT_SERVICE_URL || process.env.TTS_STT_SERVICE_URL`.

- [ ] **Step 1: Write failing tests for the URL fallback**

Append to the `describe("transcribeAudioHandler", ...)` block in `functions/src/transcribeAudio.test.ts`:

```ts
  it("prefers STT_SERVICE_URL over TTS_STT_SERVICE_URL when both are set", async () => {
    vi.stubEnv("STT_SERVICE_URL", "https://stt.a.run.app");
    vi.stubEnv("TTS_STT_SERVICE_URL", "https://tts-stt.a.run.app");
    vi.mocked(transcribeViaCloudRun).mockResolvedValue({ text: "hi", language: "en" });

    await transcribeAudioHandler(makeRequest({ audioBase64: "aGVsbG8=", language: "en" }));

    expect(transcribeViaCloudRun).toHaveBeenCalledWith(
      "https://stt.a.run.app",
      expect.any(Buffer),
      "en"
    );
  });

  it("falls back to TTS_STT_SERVICE_URL when STT_SERVICE_URL is unset", async () => {
    vi.stubEnv("STT_SERVICE_URL", "");
    vi.stubEnv("TTS_STT_SERVICE_URL", "https://tts-stt.a.run.app");
    vi.mocked(transcribeViaCloudRun).mockResolvedValue({ text: "hi", language: "en" });

    await transcribeAudioHandler(makeRequest({ audioBase64: "aGVsbG8=", language: "en" }));

    expect(transcribeViaCloudRun).toHaveBeenCalledWith(
      "https://tts-stt.a.run.app",
      expect.any(Buffer),
      "en"
    );
  });
```

Also change the existing test titled `"throws failed-precondition when TTS_STT_SERVICE_URL is unset"` to stub **both** vars empty:

```ts
  it("throws failed-precondition when neither STT_SERVICE_URL nor TTS_STT_SERVICE_URL is set", async () => {
    vi.stubEnv("STT_SERVICE_URL", "");
    vi.stubEnv("TTS_STT_SERVICE_URL", "");
    await expect(
      transcribeAudioHandler(makeRequest({ audioBase64: "aGVsbG8=" }))
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });
```

- [ ] **Step 2: Run to verify the new test fails**

Run: `cd functions && npx vitest run src/transcribeAudio.test.ts`
Expected: FAIL — "prefers STT_SERVICE_URL…" called with `https://tts-stt.a.run.app`.

- [ ] **Step 3: Implement the fallback**

In `functions/src/transcribeAudio.ts` replace the `serviceUrl` line with:

```ts
  // Whisper runs on its own Cloud Run service (`stt`, concurrency=1) so it
  // never time-slices a vCPU with Piper TTS. Local dev runs one uvicorn for
  // both, so fall back to the shared URL when STT_SERVICE_URL is unset.
  const serviceUrl = process.env.STT_SERVICE_URL || process.env.TTS_STT_SERVICE_URL || "";
```

- [ ] **Step 4: Run tests — PASS**

Run: `cd functions && npx vitest run src/transcribeAudio.test.ts`
Expected: all pass.

- [ ] **Step 5: Write failing tests for `warmUpSpeech`**

Create `functions/src/warmUpSpeech.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CallableRequest } from "firebase-functions/v2/https";

vi.mock("./services/cloudRunClient", async () => {
  const actual = await vi.importActual<typeof import("./services/cloudRunClient")>(
    "./services/cloudRunClient"
  );
  return { ...actual, pingCloudRun: vi.fn() };
});

import { pingCloudRun } from "./services/cloudRunClient";
import { warmUpSpeechHandler } from "./warmUpSpeech";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function makeRequest(authed = true): CallableRequest<unknown> {
  return { auth: authed ? { uid: "u1" } : undefined, data: {} } as CallableRequest<unknown>;
}

describe("warmUpSpeechHandler", () => {
  it("throws unauthenticated without auth", async () => {
    await expect(warmUpSpeechHandler(makeRequest(false))).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("pings both distinct service URLs", async () => {
    vi.stubEnv("TTS_STT_SERVICE_URL", "https://tts-stt.a.run.app");
    vi.stubEnv("STT_SERVICE_URL", "https://stt.a.run.app");
    vi.mocked(pingCloudRun).mockResolvedValue(undefined);

    await expect(warmUpSpeechHandler(makeRequest())).resolves.toEqual({ ok: true });

    expect(pingCloudRun).toHaveBeenCalledTimes(2);
    expect(pingCloudRun).toHaveBeenCalledWith("https://tts-stt.a.run.app");
    expect(pingCloudRun).toHaveBeenCalledWith("https://stt.a.run.app");
  });

  it("pings once when STT_SERVICE_URL is unset", async () => {
    vi.stubEnv("TTS_STT_SERVICE_URL", "https://tts-stt.a.run.app");
    vi.stubEnv("STT_SERVICE_URL", "");
    vi.mocked(pingCloudRun).mockResolvedValue(undefined);

    await warmUpSpeechHandler(makeRequest());

    expect(pingCloudRun).toHaveBeenCalledTimes(1);
  });

  it("still returns ok when a ping fails", async () => {
    vi.stubEnv("TTS_STT_SERVICE_URL", "https://tts-stt.a.run.app");
    vi.stubEnv("STT_SERVICE_URL", "https://stt.a.run.app");
    vi.mocked(pingCloudRun)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);

    await expect(warmUpSpeechHandler(makeRequest())).resolves.toEqual({ ok: true });
  });
});
```

- [ ] **Step 6: Run — FAIL (module not found)**

Run: `cd functions && npx vitest run src/warmUpSpeech.test.ts`

- [ ] **Step 7: Implement `pingCloudRun` and `warmUpSpeech`**

Append to `functions/src/services/cloudRunClient.ts`:

```ts
// GET /health — used only to wake a scaled-to-zero service. Same IAM
// ID-token path as callCloudRun (which only POSTs).
export async function pingCloudRun(serviceUrl: string): Promise<void> {
  const url = `${serviceUrl}/health`;
  if (serviceUrl.startsWith("http://")) {
    await fetch(url);
    return;
  }
  const client = await getAuth().getIdTokenClient(serviceUrl);
  await client.request({ url, method: "GET" });
}
```

Create `functions/src/warmUpSpeech.ts`:

```ts
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { pingCloudRun } from "./services/cloudRunClient";

// Best-effort: wakes the TTS and STT Cloud Run services while the user is
// still on the interview Setup screen, so the first real call skips most of
// the cold start. Never fails the caller.
export async function warmUpSpeechHandler(
  request: CallableRequest<unknown>
): Promise<{ ok: true }> {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const urls = new Set(
    [process.env.TTS_STT_SERVICE_URL, process.env.STT_SERVICE_URL].filter(
      (u): u is string => typeof u === "string" && u.length > 0
    )
  );
  await Promise.allSettled([...urls].map((u) => pingCloudRun(u)));
  return { ok: true };
}

export const warmUpSpeech = onCall(
  { region: "asia-southeast1", maxInstances: 10, timeoutSeconds: 60 },
  warmUpSpeechHandler
);
```

Add to `functions/src/index.ts`:

```ts
export { warmUpSpeech } from "./warmUpSpeech";
```

- [ ] **Step 8: Run all function tests + typecheck — PASS**

Run: `cd functions && npx vitest run && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 9: Commit**

```bash
git add functions/src
git commit -m "feat(functions): dedicated STT service URL and warmUpSpeech callable

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Shared interview types + pure text helpers

**Files:**
- Create: `apps/web/src/lib/interviewTypes.ts`
- Create: `apps/web/src/lib/splitSentences.ts`, `apps/web/src/lib/splitSentences.test.ts`
- Create: `apps/web/src/lib/wordDiff.ts`, `apps/web/src/lib/wordDiff.test.ts`

**Interfaces:**
- Produces (used by every later task): all types in `interviewTypes.ts` below; `splitSentences(text: string, maxLen?: number): string[]`; `wordDiff(before: string, after: string): DiffSegment[]` with `DiffSegment = { kind: "equal" | "removed" | "added"; text: string }`.

- [ ] **Step 1: Create the types module** (no test — types only)

`apps/web/src/lib/interviewTypes.ts`:

```ts
export type InterviewLevel = "intern" | "junior" | "mid" | "senior";
export type InterviewType = "behavioral" | "technical" | "hr" | "mixed";
export type InterviewVoice = "male1" | "male2" | "female1" | "female2";
export type QuestionCount = 5 | 8 | 10;

export const INTERVIEW_LEVELS: { id: InterviewLevel; label: string }[] = [
  { id: "intern", label: "Intern" },
  { id: "junior", label: "Junior" },
  { id: "mid", label: "Mid" },
  { id: "senior", label: "Senior" },
];

export const INTERVIEW_TYPES: { id: InterviewType; label: string; sub: string }[] = [
  { id: "behavioral", label: "Behavioral", sub: "Kể tình huống thực tế, chấm theo STAR" },
  { id: "technical", label: "Technical", sub: "Giải thích kiến thức, dự án, thiết kế" },
  { id: "hr", label: "HR & văn hóa", sub: "Giới thiệu bản thân, mục tiêu, văn hóa" },
  { id: "mixed", label: "Hỗn hợp", sub: "Trộn cả ba như một vòng thật" },
];

export const QUESTION_COUNTS: QuestionCount[] = [5, 8, 10];

// Voice ids map to Piper models in services/tts-stt/app/tts.py.
export const INTERVIEW_VOICES: { id: InterviewVoice; label: string; sub: string }[] = [
  { id: "male2", label: "Nam 1", sub: "norman · trầm" },
  { id: "male1", label: "Nam 2", sub: "hfc_male · trẻ" },
  { id: "female1", label: "Nữ 1", sub: "lessac · rõ ràng" },
  { id: "female2", label: "Nữ 2", sub: "hfc_female · nhẹ" },
];

export interface InterviewSetup {
  role: string;
  level: InterviewLevel;
  type: InterviewType;
  questionCount: QuestionCount;
  voice: InterviewVoice;
  jd: string;
  cvSummary: string | null;
  reviewTranscript: boolean;
}

export interface InterviewTurn {
  mainIndex: number;
  kind: "main" | "follow_up";
  question: string;
  answer: string;
  skipped: boolean;
  answerSeconds: number;
}

export type CriterionKey = "content" | "structure" | "grammar" | "vocabulary" | "fluency";

export const CRITERIA: { key: CriterionKey; label: string }[] = [
  { key: "content", label: "Nội dung & ví dụ" },
  { key: "structure", label: "Cấu trúc (STAR)" },
  { key: "grammar", label: "Ngữ pháp" },
  { key: "vocabulary", label: "Từ vựng" },
  { key: "fluency", label: "Độ trôi chảy" },
];

export interface InterviewPhrase {
  text: string;     // English, verbatim from modelAnswer
  meaning: string;  // short Vietnamese meaning (saved as the vocab record's meaning)
}

export interface InterviewReportQuestion {
  mainIndex: number;
  score: number;
  corrected: string;
  strengths: string;
  gaps: string;
  modelAnswer: string;
  phrases: InterviewPhrase[];
}

export interface InterviewReport {
  overall: number;
  criteria: Record<CriterionKey, number>;
  criteriaNotes: Record<CriterionKey, string>;
  improvements: { title: string; detail: string }[];
  questions: InterviewReportQuestion[];
}

export interface InterviewSession {
  id: string;
  createdAt: string;
  status: "in_progress" | "completed";
  setup: InterviewSetup;
  plan: string[];
  turns: InterviewTurn[];
  report: InterviewReport | null;
  reportError: boolean;
}

export interface InterviewCvProfile {
  fileName: string;
  text: string;
  summary: string;
  topics: string[];
  updatedAt: string;
}

export const MAX_ANSWER_SECONDS = 180;
export const INTERVIEW_GREETING = "Hi, thanks for joining today. Let's get started.";
export const INTERVIEW_CLOSING =
  "That's all the questions I have. Thank you for your time — I'll put together your feedback now.";

/** The user's answer to a main question, joined across the main turn and its follow-up. */
export function combinedAnswer(turns: InterviewTurn[], mainIndex: number): string {
  return turns
    .filter((t) => t.mainIndex === mainIndex && !t.skipped)
    .map((t) => t.answer.trim())
    .filter((a) => a.length > 0)
    .join(" ");
}
```

- [ ] **Step 2: Write failing tests for `splitSentences`**

`apps/web/src/lib/splitSentences.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { splitSentences } from "./splitSentences";

describe("splitSentences", () => {
  it("returns a single chunk for short text", () => {
    expect(splitSentences("Hello there. How are you?")).toEqual(["Hello there. How are you?"]);
  });

  it("returns [] for blank text", () => {
    expect(splitSentences("   ")).toEqual([]);
  });

  it("packs whole sentences into chunks no longer than maxLen", () => {
    const text = "One two three. Four five six. Seven eight nine.";
    const chunks = splitSentences(text, 30);
    expect(chunks).toEqual(["One two three. Four five six.", "Seven eight nine."]);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(30));
  });

  it("hard-splits a single sentence longer than maxLen on word boundaries", () => {
    const long = Array.from({ length: 20 }, (_, i) => `word${i}`).join(" ") + ".";
    const chunks = splitSentences(long, 40);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(40));
    expect(chunks.join(" ")).toBe(long);
  });

  it("defaults maxLen to 500", () => {
    const sentence = "a".repeat(300) + ". ";
    const chunks = splitSentences(sentence.repeat(2).trim());
    expect(chunks).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run — FAIL**

Run: `cd apps/web && npx vitest run src/lib/splitSentences.test.ts`

- [ ] **Step 4: Implement**

`apps/web/src/lib/splitSentences.ts`:

```ts
// Piper (services/tts-stt) rejects text over 500 chars per call. Split an AI
// utterance into chunks of whole sentences, each ≤ maxLen; a single sentence
// longer than maxLen is split on word boundaries.
export function splitSentences(text: string, maxLen = 500): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const sentences = trimmed.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [trimmed];

  const pieces: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= maxLen) {
      pieces.push(sentence);
      continue;
    }
    let current = "";
    for (const word of sentence.split(/\s+/)) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxLen && current) {
        pieces.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) pieces.push(current);
  }

  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    const next = current ? `${current} ${piece}` : piece;
    if (next.length > maxLen && current) {
      chunks.push(current);
      current = piece;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
```

- [ ] **Step 5: Run — PASS**

- [ ] **Step 6: Write failing tests for `wordDiff`**

`apps/web/src/lib/wordDiff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { wordDiff } from "./wordDiff";

describe("wordDiff", () => {
  it("returns one equal segment for identical text", () => {
    expect(wordDiff("I went home.", "I went home.")).toEqual([{ kind: "equal", text: "I went home." }]);
  });

  it("marks a replaced word as removed then added", () => {
    expect(wordDiff("We disagree about it", "We disagreed about it")).toEqual([
      { kind: "equal", text: "We" },
      { kind: "removed", text: "disagree" },
      { kind: "added", text: "disagreed" },
      { kind: "equal", text: "about it" },
    ]);
  });

  it("handles a multi-word replacement", () => {
    expect(wordDiff("me and my teammate disagreed", "my teammate and I disagreed")).toEqual([
      { kind: "removed", text: "me and" },
      { kind: "equal", text: "my teammate" },
      { kind: "added", text: "and I" },
      { kind: "equal", text: "disagreed" },
    ]);
  });

  it("handles empty inputs", () => {
    expect(wordDiff("", "Hello")).toEqual([{ kind: "added", text: "Hello" }]);
    expect(wordDiff("Hello", "")).toEqual([{ kind: "removed", text: "Hello" }]);
    expect(wordDiff("", "")).toEqual([]);
  });

  it("compares words case- and punctuation-sensitively as whole tokens", () => {
    expect(wordDiff("finally we chose", "in the end, we chose")).toEqual([
      { kind: "removed", text: "finally" },
      { kind: "added", text: "in the end," },
      { kind: "equal", text: "we chose" },
    ]);
  });
});
```

- [ ] **Step 7: Run — FAIL**

- [ ] **Step 8: Implement**

`apps/web/src/lib/wordDiff.ts`:

```ts
export interface DiffSegment {
  kind: "equal" | "removed" | "added";
  text: string;
}

// Word-level LCS diff between the user's transcript and the AI's minimally
// corrected version. Tokens are whitespace-separated words with punctuation
// attached. Within a changed region, removed words come before added words;
// adjacent tokens of the same kind are merged into one segment.
export function wordDiff(before: string, after: string): DiffSegment[] {
  const a = before.trim() ? before.trim().split(/\s+/) : [];
  const b = after.trim() ? after.trim().split(/\s+/) : [];
  const n = a.length;
  const m = b.length;

  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const tokens: { kind: DiffSegment["kind"]; word: string }[] = [];
  let i = 0;
  let j = 0;
  let removed: string[] = [];
  let added: string[] = [];
  const flush = () => {
    removed.forEach((w) => tokens.push({ kind: "removed", word: w }));
    added.forEach((w) => tokens.push({ kind: "added", word: w }));
    removed = [];
    added = [];
  };
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      flush();
      tokens.push({ kind: "equal", word: a[i] });
      i++;
      j++;
    } else if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      added.push(b[j]);
      j++;
    } else {
      removed.push(a[i]);
      i++;
    }
  }
  flush();

  const segments: DiffSegment[] = [];
  for (const t of tokens) {
    const last = segments[segments.length - 1];
    if (last && last.kind === t.kind) {
      last.text += ` ${t.word}`;
    } else {
      segments.push({ kind: t.kind, text: t.word });
    }
  }
  return segments;
}
```

- [ ] **Step 9: Run — PASS**

Run: `cd apps/web && npx vitest run src/lib/splitSentences.test.ts src/lib/wordDiff.test.ts`
If the multi-word test's exact segmentation differs only because of LCS tie-breaking, adjust the tie-break (`>=` vs `>`) until all 5 tests pass — do not loosen the tests.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/lib/interviewTypes.ts apps/web/src/lib/splitSentences.* apps/web/src/lib/wordDiff.*
git commit -m "feat(web): interview types, sentence splitter, word diff

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Interview prompts (CV summary, question plan, next turn, translate) + AI helper

**Files:**
- Create: `apps/web/src/lib/interviewPrompts.ts`, `apps/web/src/lib/interviewPrompts.test.ts`
- Create: `apps/web/src/lib/interviewAi.ts`, `apps/web/src/lib/interviewAi.test.ts`

**Interfaces:**
- Consumes: `InterviewSetup`, `QuestionCount` (Task 2); `parseAiJsonObject` (`@/lib/parseAiJson`); `generateContent` (`@/lib/generateContent`); `UserSettings` (`@/lib/settings`).
- Produces:
  - `class InterviewAiError extends Error {}`
  - `buildCvSummaryPrompt(cvText: string): string`; `parseCvSummary(raw: string): { summary: string; topics: string[] }`
  - `buildQuestionPlanPrompt(setup: InterviewSetup): string`; `parseQuestionPlan(raw: string, count: number): string[]`
  - `interface NextTurnInput { setup: InterviewSetup; mainQuestion: string; exchanges: { question: string; answer: string }[]; nextMainQuestion: string | null }`
  - `type NextTurnDecision = { action: "follow_up"; say: string } | { action: "next"; ack: string }`
  - `buildNextTurnPrompt(input: NextTurnInput): string`; `parseNextTurn(raw: string): NextTurnDecision`
  - `buildTranslatePrompt(question: string): string`; `parseTranslation(raw: string): string`
  - `hasAiKey(settings: UserSettings | null): boolean`; `callInterviewAi(settings: UserSettings, prompt: string): Promise<string>` (throws `InterviewAiError` when no key)

- [ ] **Step 1: Write failing tests**

`apps/web/src/lib/interviewPrompts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  InterviewAiError,
  buildCvSummaryPrompt,
  buildNextTurnPrompt,
  buildQuestionPlanPrompt,
  buildTranslatePrompt,
  parseCvSummary,
  parseNextTurn,
  parseQuestionPlan,
  parseTranslation,
} from "./interviewPrompts";
import type { InterviewSetup } from "./interviewTypes";

const SETUP: InterviewSetup = {
  role: "Software Engineer",
  level: "junior",
  type: "behavioral",
  questionCount: 5,
  voice: "male2",
  jd: "We build payment systems.",
  cvSummary: "2 years of React; built a clinic booking app with VNPay.",
  reviewTranscript: true,
};

describe("cv summary", () => {
  it("embeds the CV text and asks for JSON", () => {
    const p = buildCvSummaryPrompt("My CV text");
    expect(p).toContain("My CV text");
    expect(p).toContain('"summary"');
    expect(p).toContain('"topics"');
  });

  it("parses summary and topics, trimming and capping", () => {
    const raw = JSON.stringify({ summary: "  S  ", topics: [" React ", "", 3, ...Array(12).fill("x")] });
    expect(parseCvSummary(raw)).toEqual({ summary: "S", topics: ["React", ...Array(9).fill("x")] });
  });

  it("caps summary at 1200 chars", () => {
    const raw = JSON.stringify({ summary: "a".repeat(2000), topics: [] });
    expect(parseCvSummary(raw).summary).toHaveLength(1200);
  });

  it("throws InterviewAiError on missing summary", () => {
    expect(() => parseCvSummary('{"topics":[]}')).toThrow(InterviewAiError);
  });

  it("throws InterviewAiError on non-JSON", () => {
    expect(() => parseCvSummary("sorry")).toThrow(InterviewAiError);
  });
});

describe("question plan", () => {
  it("includes role, level, type, count, CV summary and JD", () => {
    const p = buildQuestionPlanPrompt(SETUP);
    expect(p).toContain("Software Engineer");
    expect(p).toContain("junior");
    expect(p).toContain("behavioral");
    expect(p).toContain("exactly 5");
    expect(p).toContain("VNPay");
    expect(p).toContain("payment systems");
  });

  it("omits CV/JD sections when absent", () => {
    const p = buildQuestionPlanPrompt({ ...SETUP, cvSummary: null, jd: "" });
    expect(p).not.toContain("Candidate CV summary");
    expect(p).not.toContain("Job description");
  });

  it("returns exactly count questions, trimming extras", () => {
    const raw = JSON.stringify({ questions: ["Q1", " Q2 ", "Q3", "Q4", "Q5", "Q6"] });
    expect(parseQuestionPlan(raw, 5)).toEqual(["Q1", "Q2", "Q3", "Q4", "Q5"]);
  });

  it("throws when fewer than count valid questions", () => {
    expect(() => parseQuestionPlan(JSON.stringify({ questions: ["Q1", ""] }), 5)).toThrow(InterviewAiError);
  });
});

describe("next turn", () => {
  const input = {
    setup: SETUP,
    mainQuestion: "Tell me about a conflict.",
    exchanges: [{ question: "Tell me about a conflict.", answer: "We argued about Redux." }],
    nextMainQuestion: "Describe a project you are proud of.",
  };

  it("includes the exchange and the next question", () => {
    const p = buildNextTurnPrompt(input);
    expect(p).toContain("We argued about Redux.");
    expect(p).toContain("Describe a project you are proud of.");
  });

  it("says when this is the last question", () => {
    expect(buildNextTurnPrompt({ ...input, nextMainQuestion: null })).toContain("This is the last main question");
  });

  it("parses follow_up", () => {
    expect(parseNextTurn('{"action":"follow_up","say":"Why Redux?"}')).toEqual({
      action: "follow_up",
      say: "Why Redux?",
    });
  });

  it("parses next with ack, defaulting ack to empty", () => {
    expect(parseNextTurn('{"action":"next","ack":"Thanks."}')).toEqual({ action: "next", ack: "Thanks." });
    expect(parseNextTurn('{"action":"next"}')).toEqual({ action: "next", ack: "" });
  });

  it("throws on follow_up without say, or unknown action", () => {
    expect(() => parseNextTurn('{"action":"follow_up","say":""}')).toThrow(InterviewAiError);
    expect(() => parseNextTurn('{"action":"dance"}')).toThrow(InterviewAiError);
  });
});

describe("translate", () => {
  it("builds and parses", () => {
    expect(buildTranslatePrompt("Why us?")).toContain("Why us?");
    expect(parseTranslation('{"vi":" Tại sao? "}')).toBe("Tại sao?");
    expect(() => parseTranslation("{}")).toThrow(InterviewAiError);
  });
});
```

`apps/web/src/lib/interviewAi.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { callInterviewAi, hasAiKey } from "./interviewAi";
import { InterviewAiError } from "./interviewPrompts";
import { generateContent } from "./generateContent";
import { DEFAULT_SETTINGS, type UserSettings } from "./settings";

vi.mock("./generateContent", () => ({ generateContent: vi.fn() }));

const WITH_KEY: UserSettings = {
  ...DEFAULT_SETTINGS,
  providers: {
    ...DEFAULT_SETTINGS.providers,
    gemini: { ...DEFAULT_SETTINGS.providers.gemini, apiKeyCiphertext: "cipher" },
  },
};

beforeEach(() => vi.clearAllMocks());

describe("interviewAi", () => {
  it("hasAiKey reflects the active provider's ciphertext", () => {
    expect(hasAiKey(null)).toBe(false);
    expect(hasAiKey(DEFAULT_SETTINGS)).toBe(false);
    expect(hasAiKey(WITH_KEY)).toBe(true);
  });

  it("calls generateContent with the active provider config", async () => {
    vi.mocked(generateContent).mockResolvedValue({ text: "out" });
    await expect(callInterviewAi(WITH_KEY, "p")).resolves.toBe("out");
    expect(generateContent).toHaveBeenCalledWith({
      provider: "gemini",
      model: WITH_KEY.providers.gemini.model,
      apiKeyCiphertext: "cipher",
      prompt: "p",
    });
  });

  it("throws InterviewAiError without a key", async () => {
    await expect(callInterviewAi(DEFAULT_SETTINGS, "p")).rejects.toBeInstanceOf(InterviewAiError);
    expect(generateContent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd apps/web && npx vitest run src/lib/interviewPrompts.test.ts src/lib/interviewAi.test.ts`

- [ ] **Step 3: Implement `interviewPrompts.ts`**

```ts
import { parseAiJsonObject } from "./parseAiJson";
import type { InterviewSetup } from "./interviewTypes";

export class InterviewAiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InterviewAiError";
  }
}

export function parseJson(raw: string): Record<string, unknown> {
  try {
    return parseAiJsonObject(raw);
  } catch {
    throw new InterviewAiError("AI trả về dữ liệu không hợp lệ.");
  }
}

export function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(str).filter((s) => s.length > 0) : [];
}

const LEVEL_DESC: Record<InterviewSetup["level"], string> = {
  intern: "an intern / fresh graduate",
  junior: "a junior (1–2 years of experience)",
  mid: "a mid-level (3–5 years of experience)",
  senior: "a senior (5+ years of experience)",
};

const TYPE_DESC: Record<InterviewSetup["type"], string> = {
  behavioral: "behavioral interview (past situations, answered with STAR)",
  technical: "technical interview (explaining concepts, projects, design decisions — spoken, no coding)",
  hr: "HR / culture-fit interview (self-introduction, motivation, goals, working style)",
  mixed: "mixed interview combining behavioral, technical-discussion and HR questions",
};

export function describeCandidate(setup: InterviewSetup): string {
  return `Role: ${setup.role}\nSeniority: ${setup.level} — ${LEVEL_DESC[setup.level]}\nInterview type: ${setup.type} — ${TYPE_DESC[setup.type]}`;
}

export function contextSections(setup: InterviewSetup): string {
  const parts: string[] = [];
  if (setup.cvSummary) parts.push(`Candidate CV summary:\n${setup.cvSummary}`);
  if (setup.jd.trim()) parts.push(`Job description:\n${setup.jd.trim().slice(0, 4000)}`);
  return parts.join("\n\n");
}

export function buildCvSummaryPrompt(cvText: string): string {
  return `You are preparing a mock job interview. Below is a candidate's CV (it may be in English or Vietnamese).

Return ONLY a JSON object, no prose:
{"summary": "...", "topics": ["...", "..."]}

- "summary": in English, at most 1200 characters, written for an interviewer: current/target role, years of experience, key skills and technologies, 2–4 notable projects or achievements with the candidate's own contribution and any numbers.
- "topics": 4 to 10 short labels IN VIETNAMESE (max 6 words each) naming the concrete things an interviewer would ask about (e.g. "2 năm React / Next.js", "Tích hợp VNPay").

CV:
"""
${cvText}
"""`;
}

export function parseCvSummary(raw: string): { summary: string; topics: string[] } {
  const json = parseJson(raw);
  const summary = str(json.summary).slice(0, 1200);
  if (!summary) throw new InterviewAiError("AI không tóm tắt được CV.");
  return { summary, topics: strList(json.topics).slice(0, 10) };
}

export function buildQuestionPlanPrompt(setup: InterviewSetup): string {
  const context = contextSections(setup);
  return `You are an experienced interviewer preparing a spoken English job interview.

${describeCandidate(setup)}
${context ? `\n${context}\n` : ""}
Write exactly ${setup.questionCount} main interview questions, in the order you will ask them.
- Start with a short warm-up question (e.g. a brief self-introduction), end with a natural closing question.
- Fit the seniority and interview type. If a CV summary is given, at least half the questions must reference specific experience from it. If a job description is given, cover its key requirements.
- One question per item, spoken style, max 35 words each, no numbering.

Return ONLY a JSON object, no prose:
{"questions": ["...", "..."]}`;
}

export function parseQuestionPlan(raw: string, count: number): string[] {
  const questions = strList(parseJson(raw).questions);
  if (questions.length < count) throw new InterviewAiError("AI không tạo đủ câu hỏi.");
  return questions.slice(0, count);
}

export interface NextTurnInput {
  setup: InterviewSetup;
  mainQuestion: string;
  exchanges: { question: string; answer: string }[];
  nextMainQuestion: string | null;
}

export type NextTurnDecision = { action: "follow_up"; say: string } | { action: "next"; ack: string };

export function buildNextTurnPrompt(input: NextTurnInput): string {
  const exchange = input.exchanges
    .map((e) => `Interviewer: ${e.question}\nCandidate: ${e.answer || "(no answer)"}`)
    .join("\n");
  const next = input.nextMainQuestion
    ? `Your next planned question is: "${input.nextMainQuestion}"`
    : "This is the last main question of the interview.";
  return `You are a friendly but rigorous interviewer in a spoken English job interview.

${describeCandidate(input.setup)}

Current main question: "${input.mainQuestion}"
${exchange}

${next}

Decide ONE of:
1. Ask ONE follow-up question if the answer is vague, lacks the candidate's own concrete actions or results, or makes a claim worth probing. Max 30 words, spoken style, directly about what they said.
2. Move on, with a brief neutral acknowledgement (max 12 words, e.g. "Thanks, that's helpful."). Do not give feedback or scores.

Return ONLY a JSON object, no prose — either
{"action": "follow_up", "say": "..."}
or
{"action": "next", "ack": "..."}`;
}

export function parseNextTurn(raw: string): NextTurnDecision {
  const json = parseJson(raw);
  if (json.action === "follow_up") {
    const say = str(json.say);
    if (!say) throw new InterviewAiError("AI thiếu câu hỏi xoáy.");
    return { action: "follow_up", say };
  }
  if (json.action === "next") {
    return { action: "next", ack: str(json.ack) };
  }
  throw new InterviewAiError("AI trả về hành động không hợp lệ.");
}

export function buildTranslatePrompt(question: string): string {
  return `Translate this job-interview question into natural Vietnamese.

"${question}"

Return ONLY a JSON object: {"vi": "..."}`;
}

export function parseTranslation(raw: string): string {
  const vi = str(parseJson(raw).vi);
  if (!vi) throw new InterviewAiError("AI không dịch được câu hỏi.");
  return vi;
}
```

- [ ] **Step 4: Implement `interviewAi.ts`**

```ts
import { generateContent } from "./generateContent";
import { InterviewAiError } from "./interviewPrompts";
import type { UserSettings } from "./settings";

export function hasAiKey(settings: UserSettings | null): boolean {
  return !!settings?.providers[settings.activeProvider].apiKeyCiphertext;
}

export async function callInterviewAi(settings: UserSettings, prompt: string): Promise<string> {
  const config = settings.providers[settings.activeProvider];
  if (!config.apiKeyCiphertext) {
    throw new InterviewAiError("Chưa có API key cho nhà cung cấp AI đang chọn — vào Cài đặt để thêm.");
  }
  const response = await generateContent({
    provider: settings.activeProvider,
    model: config.model,
    apiKeyCiphertext: config.apiKeyCiphertext,
    prompt,
  });
  return response.text;
}
```

- [ ] **Step 5: Run — PASS**, then `cd apps/web && npm run typecheck`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/interviewPrompts.* apps/web/src/lib/interviewAi.*
git commit -m "feat(web): interview prompts and AI helper

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Report prompt and parser

**Files:**
- Create: `apps/web/src/lib/interviewReportPrompt.ts`, `apps/web/src/lib/interviewReportPrompt.test.ts`

**Interfaces:**
- Consumes: `InterviewSetup`, `InterviewTurn`, `InterviewReport`, `InterviewPhrase`, `CRITERIA`, `CriterionKey`, `combinedAnswer` (Task 2); `InterviewAiError`, `parseJson`, `str`, `describeCandidate` (Task 3).
- Refinement vs spec §6: `phrases` items are `{ text, meaning }` (Vietnamese meaning) instead of bare strings, so a saved vocab record has a real `meaning`.
- Produces: `buildReportPrompt(setup: InterviewSetup, plan: string[], turns: InterviewTurn[]): string`; `parseReport(raw: string, answeredMainIndexes: number[]): InterviewReport`; `answeredMainIndexes(turns: InterviewTurn[]): number[]`.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { answeredMainIndexes, buildReportPrompt, parseReport } from "./interviewReportPrompt";
import { InterviewAiError } from "./interviewPrompts";
import type { InterviewSetup, InterviewTurn } from "./interviewTypes";

const SETUP: InterviewSetup = {
  role: "Software Engineer",
  level: "junior",
  type: "behavioral",
  questionCount: 5,
  voice: "male2",
  jd: "",
  cvSummary: null,
  reviewTranscript: true,
};

const TURNS: InterviewTurn[] = [
  { mainIndex: 0, kind: "main", question: "Intro?", answer: "I am Tung.", skipped: false, answerSeconds: 10 },
  { mainIndex: 1, kind: "main", question: "Conflict?", answer: "We disagree.", skipped: false, answerSeconds: 20 },
  { mainIndex: 1, kind: "follow_up", question: "Why?", answer: "Because Redux.", skipped: false, answerSeconds: 8 },
  { mainIndex: 2, kind: "main", question: "Project?", answer: "", skipped: true, answerSeconds: 0 },
];

const GOOD = {
  overall: 7.24,
  criteria: { content: 8, structure: 6.5, grammar: 6, vocabulary: 7.5, fluency: 12 },
  criteriaNotes: { content: "Tốt", structure: "Thiếu R", grammar: "Thì", vocabulary: "Ổn", fluency: "Ổn" },
  improvements: [
    { title: "A", detail: "a" },
    { title: "B", detail: "b" },
    { title: "C", detail: "c" },
    { title: "D", detail: "d" },
  ],
  questions: [
    { mainIndex: 0, score: 8, corrected: "I am Tung.", strengths: "s", gaps: "g", modelAnswer: "m", phrases: [1, 2, 3, 4, 5].map((n) => ({ text: `p${n}`, meaning: `n${n}` })) },
    { mainIndex: 1, score: 6, corrected: "We disagreed.", strengths: "s", gaps: "g", modelAnswer: "m", phrases: [] },
    { mainIndex: 9, score: 5, corrected: "x", strengths: "", gaps: "", modelAnswer: "", phrases: [] },
  ],
};

describe("answeredMainIndexes", () => {
  it("lists main indexes that have at least one non-skipped answer", () => {
    expect(answeredMainIndexes(TURNS)).toEqual([0, 1]);
  });
});

describe("buildReportPrompt", () => {
  it("includes every answered main question with its combined answer and skips skipped ones", () => {
    const p = buildReportPrompt(SETUP, ["Intro?", "Conflict?", "Project?"], TURNS);
    expect(p).toContain("mainIndex 0");
    expect(p).toContain("We disagree.");
    expect(p).toContain("Because Redux.");
    expect(p).not.toContain("mainIndex 2");
    expect(p).toContain('"criteria"');
  });
});

describe("parseReport", () => {
  it("clamps and rounds scores, caps lists, drops unknown mainIndexes", () => {
    const r = parseReport(JSON.stringify(GOOD), [0, 1]);
    expect(r.overall).toBe(7.2);
    expect(r.criteria.fluency).toBe(10);
    expect(r.improvements).toHaveLength(3);
    expect(r.questions.map((q) => q.mainIndex)).toEqual([0, 1]);
    expect(r.questions[0].phrases).toHaveLength(4);
    expect(r.questions[0].phrases[0]).toEqual({ text: "p1", meaning: "n1" });
    expect(r.criteriaNotes.structure).toBe("Thiếu R");
  });

  it("throws when a criterion score is missing", () => {
    const bad = { ...GOOD, criteria: { content: 8 } };
    expect(() => parseReport(JSON.stringify(bad), [0, 1])).toThrow(InterviewAiError);
  });

  it("throws when overall is missing", () => {
    const { overall: _o, ...rest } = GOOD;
    expect(() => parseReport(JSON.stringify(rest), [0, 1])).toThrow(InterviewAiError);
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd apps/web && npx vitest run src/lib/interviewReportPrompt.test.ts`

- [ ] **Step 3: Implement**

`apps/web/src/lib/interviewReportPrompt.ts`:

```ts
import {
  CRITERIA,
  combinedAnswer,
  type CriterionKey,
  type InterviewPhrase,
  type InterviewReport,
  type InterviewReportQuestion,
  type InterviewSetup,
  type InterviewTurn,
} from "./interviewTypes";
import { InterviewAiError, describeCandidate, parseJson, str } from "./interviewPrompts";

export function answeredMainIndexes(turns: InterviewTurn[]): number[] {
  const set = new Set<number>();
  turns.forEach((t) => {
    if (!t.skipped && t.answer.trim()) set.add(t.mainIndex);
  });
  return [...set].sort((a, b) => a - b);
}

export function buildReportPrompt(setup: InterviewSetup, plan: string[], turns: InterviewTurn[]): string {
  const blocks = answeredMainIndexes(turns).map((i) => {
    const lines = turns
      .filter((t) => t.mainIndex === i && !t.skipped)
      .map((t) => `${t.kind === "main" ? "Interviewer" : "Interviewer (follow-up)"}: ${t.question}\nCandidate: ${t.answer}`)
      .join("\n");
    return `### mainIndex ${i}\nPlanned question: ${plan[i] ?? ""}\n${lines}\nCombined candidate answer: ${combinedAnswer(turns, i)}`;
  });
  return `You are an expert English interview coach for Vietnamese learners. Evaluate this spoken mock interview. Candidate answers are speech-to-text transcripts: judge grammar and word choice, but ignore punctuation/capitalization and do NOT judge pronunciation.

${describeCandidate(setup)}
${setup.cvSummary ? `\nCandidate CV summary:\n${setup.cvSummary}\n` : ""}
${blocks.join("\n\n")}

Return ONLY a JSON object, no prose:
{
  "overall": 0-10 (one decimal),
  "criteria": {"content": n, "structure": n, "grammar": n, "vocabulary": n, "fluency": n},
  "criteriaNotes": {"content": "...", "structure": "...", "grammar": "...", "vocabulary": "...", "fluency": "..."},
  "improvements": [{"title": "...", "detail": "..."}],
  "questions": [{"mainIndex": n, "score": n, "corrected": "...", "strengths": "...", "gaps": "...", "modelAnswer": "...", "phrases": [{"text": "...", "meaning": "..."}]}]
}

Rules:
- Scores are 0–10 with one decimal. "structure" means STAR for behavioral questions, and clear logical structure otherwise.
- criteriaNotes, improvements, strengths and gaps are in VIETNAMESE. criteriaNotes: one short line each. improvements: exactly 3 items, the most impactful fixes across the whole interview, citing the candidate's own words where useful.
- One "questions" item per mainIndex above, using the SAME mainIndex values.
- "corrected": the Combined candidate answer with only the minimal grammar and word-choice fixes, keeping their words, meaning and order wherever possible (do not rewrite or improve content).
- "modelAnswer": a strong English answer (60–120 words) in the candidate's situation, reusing their facts.
- "phrases": 2–4 items; "text" is a useful English phrase taken verbatim from modelAnswer, "meaning" its short Vietnamese meaning.`;
}

function parsePhrases(value: unknown): InterviewPhrase[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const o = (item ?? {}) as Record<string, unknown>;
      return { text: str(o.text), meaning: str(o.meaning) };
    })
    .filter((p) => p.text)
    .slice(0, 4);
}

function score(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.round(Math.min(10, Math.max(0, value)) * 10) / 10;
}

export function parseReport(raw: string, answered: number[]): InterviewReport {
  const json = parseJson(raw);
  const overall = score(json.overall);
  if (overall === null) throw new InterviewAiError("AI thiếu điểm tổng.");

  const rawCriteria = (json.criteria ?? {}) as Record<string, unknown>;
  const rawNotes = (json.criteriaNotes ?? {}) as Record<string, unknown>;
  const criteria = {} as Record<CriterionKey, number>;
  const criteriaNotes = {} as Record<CriterionKey, string>;
  for (const { key } of CRITERIA) {
    const s = score(rawCriteria[key]);
    if (s === null) throw new InterviewAiError("AI thiếu điểm tiêu chí.");
    criteria[key] = s;
    criteriaNotes[key] = str(rawNotes[key]);
  }

  const improvements = (Array.isArray(json.improvements) ? json.improvements : [])
    .map((item) => {
      const o = (item ?? {}) as Record<string, unknown>;
      return { title: str(o.title), detail: str(o.detail) };
    })
    .filter((i) => i.title)
    .slice(0, 3);

  const allowed = new Set(answered);
  const seen = new Set<number>();
  const questions: InterviewReportQuestion[] = [];
  for (const item of Array.isArray(json.questions) ? json.questions : []) {
    const o = (item ?? {}) as Record<string, unknown>;
    const mainIndex = typeof o.mainIndex === "number" ? o.mainIndex : -1;
    if (!allowed.has(mainIndex) || seen.has(mainIndex)) continue;
    seen.add(mainIndex);
    questions.push({
      mainIndex,
      score: score(o.score) ?? 0,
      corrected: str(o.corrected),
      strengths: str(o.strengths),
      gaps: str(o.gaps),
      modelAnswer: str(o.modelAnswer),
      phrases: parsePhrases(o.phrases),
    });
  }
  questions.sort((a, b) => a.mainIndex - b.mainIndex);

  return { overall, criteria, criteriaNotes, improvements, questions };
}
```

- [ ] **Step 4: Run — PASS**; `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/interviewReportPrompt.*
git commit -m "feat(web): interview report prompt and parser

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Firestore modules — sessions and CV profile

**Files:**
- Create: `apps/web/src/lib/interviewSessions.ts`, `apps/web/src/lib/interviewSessions.test.ts`
- Create: `apps/web/src/lib/cvProfile.ts`, `apps/web/src/lib/cvProfile.test.ts`

**Interfaces:**
- Consumes: types from Task 2; `getFirebaseDb` from `./firebase`.
- Produces:
  - `createInterviewSession(uid: string, setup: InterviewSetup): Promise<string>`
  - `getInterviewSession(uid: string, id: string): Promise<InterviewSession | null>`
  - `saveInterviewPlan(uid: string, id: string, plan: string[]): Promise<void>`
  - `saveInterviewTurns(uid: string, id: string, turns: InterviewTurn[]): Promise<void>`
  - `completeInterviewSession(uid: string, id: string, report: InterviewReport | null): Promise<void>`
  - `deleteInterviewSession(uid: string, id: string): Promise<void>`
  - `listRecentInterviewSessions(uid: string, max?: number): Promise<InterviewSession[]>` (completed only, newest first, default 5)
  - `getCvProfile(uid): Promise<InterviewCvProfile | null>`, `saveCvProfile(uid, profile: InterviewCvProfile): Promise<void>`, `deleteCvProfile(uid): Promise<void>`

- [ ] **Step 1: Write failing tests**

`apps/web/src/lib/interviewSessions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc } from "firebase/firestore";
import {
  completeInterviewSession,
  createInterviewSession,
  deleteInterviewSession,
  getInterviewSession,
  listRecentInterviewSessions,
  saveInterviewPlan,
  saveInterviewTurns,
} from "./interviewSessions";
import type { InterviewSetup } from "./interviewTypes";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => "col"),
  doc: vi.fn(() => ({ id: "new-id" })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(() => "q"),
  orderBy: vi.fn(() => "ob"),
  limit: vi.fn(() => "lim"),
}));
vi.mock("./firebase", () => ({ getFirebaseDb: vi.fn(() => "db") }));

const SETUP: InterviewSetup = {
  role: "SE",
  level: "junior",
  type: "behavioral",
  questionCount: 5,
  voice: "male2",
  jd: "",
  cvSummary: null,
  reviewTranscript: true,
};

beforeEach(() => vi.clearAllMocks());

describe("interviewSessions", () => {
  it("creates an in_progress session with empty plan and turns and returns its id", async () => {
    vi.mocked(doc).mockReturnValue({ id: "new-id" } as never);
    const id = await createInterviewSession("u1", SETUP);
    expect(id).toBe("new-id");
    expect(setDoc).toHaveBeenCalledWith(
      { id: "new-id" },
      expect.objectContaining({
        id: "new-id",
        status: "in_progress",
        setup: SETUP,
        plan: [],
        turns: [],
        report: null,
        reportError: false,
        createdAt: expect.any(String),
      })
    );
  });

  it("returns null for a missing session", async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    await expect(getInterviewSession("u1", "x")).resolves.toBeNull();
  });

  it("returns the session with its id", async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => true, id: "s1", data: () => ({ plan: ["Q"] }) } as never);
    await expect(getInterviewSession("u1", "s1")).resolves.toEqual({ plan: ["Q"], id: "s1" });
  });

  it("updates plan, turns, and completion", async () => {
    await saveInterviewPlan("u1", "s1", ["Q1"]);
    expect(updateDoc).toHaveBeenLastCalledWith(expect.anything(), { plan: ["Q1"] });
    await saveInterviewTurns("u1", "s1", []);
    expect(updateDoc).toHaveBeenLastCalledWith(expect.anything(), { turns: [] });
    await completeInterviewSession("u1", "s1", null);
    expect(updateDoc).toHaveBeenLastCalledWith(expect.anything(), {
      status: "completed",
      report: null,
      reportError: true,
    });
  });

  it("deletes", async () => {
    await deleteInterviewSession("u1", "s1");
    expect(deleteDoc).toHaveBeenCalled();
  });

  it("lists recent completed sessions newest first", async () => {
    vi.mocked(getDocs).mockResolvedValue({
      docs: [
        { id: "a", data: () => ({ status: "completed", createdAt: "2026-09-02" }) },
        { id: "b", data: () => ({ status: "in_progress", createdAt: "2026-09-01" }) },
        { id: "c", data: () => ({ status: "completed", createdAt: "2026-08-30" }) },
      ],
    } as never);
    const list = await listRecentInterviewSessions("u1", 5);
    expect(list.map((s) => s.id)).toEqual(["a", "c"]);
    expect(orderBy).toHaveBeenCalledWith("createdAt", "desc");
    expect(limit).toHaveBeenCalledWith(20);
    expect(query).toHaveBeenCalled();
  });
});
```

`apps/web/src/lib/cvProfile.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDoc, getDoc, setDoc } from "firebase/firestore";
import { deleteCvProfile, getCvProfile, saveCvProfile } from "./cvProfile";

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => "ref"),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));
vi.mock("./firebase", () => ({ getFirebaseDb: vi.fn(() => "db") }));

const PROFILE = { fileName: "cv.pdf", text: "t", summary: "s", topics: ["a"], updatedAt: "2026-09-27" };

beforeEach(() => vi.clearAllMocks());

describe("cvProfile", () => {
  it("returns null when missing", async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    await expect(getCvProfile("u1")).resolves.toBeNull();
  });

  it("returns stored data", async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => PROFILE } as never);
    await expect(getCvProfile("u1")).resolves.toEqual(PROFILE);
  });

  it("saves and deletes", async () => {
    await saveCvProfile("u1", PROFILE);
    expect(setDoc).toHaveBeenCalledWith("ref", PROFILE);
    await deleteCvProfile("u1");
    expect(deleteDoc).toHaveBeenCalledWith("ref");
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

`apps/web/src/lib/interviewSessions.ts`:

```ts
import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc } from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import type { InterviewReport, InterviewSession, InterviewSetup, InterviewTurn } from "./interviewTypes";

function sessionsCol(uid: string) {
  return collection(getFirebaseDb(), "users", uid, "interview_sessions");
}

function sessionRef(uid: string, id: string) {
  return doc(getFirebaseDb(), "users", uid, "interview_sessions", id);
}

export async function createInterviewSession(uid: string, setup: InterviewSetup): Promise<string> {
  const ref = doc(sessionsCol(uid));
  const session: InterviewSession = {
    id: ref.id,
    createdAt: new Date().toISOString(),
    status: "in_progress",
    setup,
    plan: [],
    turns: [],
    report: null,
    reportError: false,
  };
  await setDoc(ref, session);
  return ref.id;
}

export async function getInterviewSession(uid: string, id: string): Promise<InterviewSession | null> {
  const snap = await getDoc(sessionRef(uid, id));
  if (!snap.exists()) return null;
  return { ...(snap.data() as InterviewSession), id: snap.id };
}

export async function saveInterviewPlan(uid: string, id: string, plan: string[]): Promise<void> {
  await updateDoc(sessionRef(uid, id), { plan });
}

// Called after every turn with the full array — a closed tab still leaves
// every completed turn gradable.
export async function saveInterviewTurns(uid: string, id: string, turns: InterviewTurn[]): Promise<void> {
  await updateDoc(sessionRef(uid, id), { turns });
}

export async function completeInterviewSession(
  uid: string,
  id: string,
  report: InterviewReport | null
): Promise<void> {
  await updateDoc(sessionRef(uid, id), { status: "completed", report, reportError: report === null });
}

export async function deleteInterviewSession(uid: string, id: string): Promise<void> {
  await deleteDoc(sessionRef(uid, id));
}

// Over-fetch then filter client-side: a single-field orderBy needs no
// composite index, and abandoned in_progress sessions are rare.
export async function listRecentInterviewSessions(uid: string, max = 5): Promise<InterviewSession[]> {
  const snap = await getDocs(query(sessionsCol(uid), orderBy("createdAt", "desc"), limit(20)));
  return snap.docs
    .map((d) => ({ ...(d.data() as InterviewSession), id: d.id }))
    .filter((s) => s.status === "completed")
    .slice(0, max);
}
```

`apps/web/src/lib/cvProfile.ts`:

```ts
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import type { InterviewCvProfile } from "./interviewTypes";

// Only extracted text + AI summary are stored — never the original file.
function cvRef(uid: string) {
  return doc(getFirebaseDb(), "users", uid, "interview_profile", "cv");
}

export async function getCvProfile(uid: string): Promise<InterviewCvProfile | null> {
  const snap = await getDoc(cvRef(uid));
  return snap.exists() ? (snap.data() as InterviewCvProfile) : null;
}

export async function saveCvProfile(uid: string, profile: InterviewCvProfile): Promise<void> {
  await setDoc(cvRef(uid), profile);
}

export async function deleteCvProfile(uid: string): Promise<void> {
  await deleteDoc(cvRef(uid));
}
```

- [ ] **Step 4: Run — PASS**; typecheck.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/interviewSessions.* apps/web/src/lib/cvProfile.*
git commit -m "feat(web): Firestore modules for interview sessions and CV profile

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: CV text extraction (pdfjs-dist + mammoth)

**Files:**
- Modify: `apps/web/package.json` (+ lockfile) — add `pdfjs-dist`, `mammoth`
- Create: `apps/web/src/lib/cvParsers.ts`
- Create: `apps/web/src/lib/cvExtract.ts`, `apps/web/src/lib/cvExtract.test.ts`

**Interfaces:**
- Produces:
  - `extractPdfText(data: ArrayBuffer): Promise<string>`, `extractDocxText(data: ArrayBuffer): Promise<string>` (in `cvParsers.ts`; dynamic imports so the libraries load only on upload)
  - `CV_MAX_BYTES = 5 * 1024 * 1024`, `CV_MAX_CHARS = 20_000`, `CV_MIN_TEXT_CHARS = 200`
  - `type CvExtractResult = { ok: true; text: string } | { ok: false; reason: "unsupported" | "too_large" | "no_text" | "read_error" }`
  - `extractCvText(file: File): Promise<CvExtractResult>`; `normalizeCvText(raw: string): string`

- [ ] **Step 1: Install dependencies**

Run: `cd apps/web && npm install pdfjs-dist mammoth`
Expected: both added to `dependencies`. If `mammoth` has no bundled types (`npx tsc --noEmit` complains), create `apps/web/src/types/mammoth.d.ts`:

```ts
declare module "mammoth" {
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
}
```

- [ ] **Step 2: Create `cvParsers.ts`** (thin I/O wrapper — not unit-tested; verified in Task 15)

```ts
// Dynamic imports keep pdfjs (~1 MB) and mammoth out of every other page's
// bundle; they load only when a user actually uploads a CV.
const MAX_PDF_PAGES = 10;

export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, MAX_PDF_PAGES); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return pages.join("\n");
}

export async function extractDocxText(data: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: data });
  return result.value;
}
```

- [ ] **Step 3: Write failing tests**

`apps/web/src/lib/cvExtract.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CV_MAX_BYTES, extractCvText, normalizeCvText } from "./cvExtract";
import { extractDocxText, extractPdfText } from "./cvParsers";

vi.mock("./cvParsers", () => ({ extractPdfText: vi.fn(), extractDocxText: vi.fn() }));

const LONG = "Experienced React developer who built a booking app. ".repeat(10);

function file(name: string, size = 10, type = ""): File {
  const f = new File(["x".repeat(size)], name, { type });
  return f;
}

beforeEach(() => vi.clearAllMocks());

describe("normalizeCvText", () => {
  it("collapses whitespace, drops blank lines and truncates to 20000", () => {
    expect(normalizeCvText("  a   b \n\n\n c\t d  ")).toBe("a b\nc d");
    expect(normalizeCvText("x".repeat(25_000))).toHaveLength(20_000);
  });
});

describe("extractCvText", () => {
  it("rejects unsupported extensions", async () => {
    await expect(extractCvText(file("cv.png"))).resolves.toEqual({ ok: false, reason: "unsupported" });
  });

  it("rejects files over 5 MB", async () => {
    const big = file("cv.pdf");
    Object.defineProperty(big, "size", { value: CV_MAX_BYTES + 1 });
    await expect(extractCvText(big)).resolves.toEqual({ ok: false, reason: "too_large" });
  });

  it("extracts PDF text", async () => {
    vi.mocked(extractPdfText).mockResolvedValue(LONG);
    const result = await extractCvText(file("CV.PDF"));
    expect(result).toEqual({ ok: true, text: normalizeCvText(LONG) });
    expect(extractDocxText).not.toHaveBeenCalled();
  });

  it("extracts DOCX text", async () => {
    vi.mocked(extractDocxText).mockResolvedValue(LONG);
    await expect(extractCvText(file("cv.docx"))).resolves.toMatchObject({ ok: true });
  });

  it("reports no_text for a scanned PDF (under 200 non-whitespace chars)", async () => {
    vi.mocked(extractPdfText).mockResolvedValue("   Page 1   \n  ");
    await expect(extractCvText(file("scan.pdf"))).resolves.toEqual({ ok: false, reason: "no_text" });
  });

  it("reports read_error when the parser throws", async () => {
    vi.mocked(extractDocxText).mockRejectedValue(new Error("corrupt"));
    await expect(extractCvText(file("cv.docx"))).resolves.toEqual({ ok: false, reason: "read_error" });
  });
});
```

- [ ] **Step 4: Run — FAIL**

Run: `cd apps/web && npx vitest run src/lib/cvExtract.test.ts`

- [ ] **Step 5: Implement `cvExtract.ts`**

```ts
import { extractDocxText, extractPdfText } from "./cvParsers";

export const CV_MAX_BYTES = 5 * 1024 * 1024;
export const CV_MAX_CHARS = 20_000;
export const CV_MIN_TEXT_CHARS = 200;

export type CvExtractResult =
  | { ok: true; text: string }
  | { ok: false; reason: "unsupported" | "too_large" | "no_text" | "read_error" };

export function normalizeCvText(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .slice(0, CV_MAX_CHARS);
}

function kindOf(file: File): "pdf" | "docx" | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  return null;
}

export async function extractCvText(file: File): Promise<CvExtractResult> {
  const kind = kindOf(file);
  if (!kind) return { ok: false, reason: "unsupported" };
  if (file.size > CV_MAX_BYTES) return { ok: false, reason: "too_large" };
  let raw: string;
  try {
    const data = await file.arrayBuffer();
    raw = kind === "pdf" ? await extractPdfText(data) : await extractDocxText(data);
  } catch {
    return { ok: false, reason: "read_error" };
  }
  // A scanned/image-only PDF has no text layer — no OCR in MVP.
  if (raw.replace(/\s/g, "").length < CV_MIN_TEXT_CHARS) return { ok: false, reason: "no_text" };
  return { ok: true, text: normalizeCvText(raw) };
}
```

- [ ] **Step 6: Run — PASS**; `npm run typecheck`.

- [ ] **Step 7: Verify the production build bundles pdfjs's worker**

Run: `cd apps/web && npm run build`
Expected: build succeeds. If the bundler rejects the `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)` pattern, instead copy the worker to `apps/web/public/pdf.worker.min.mjs` (add `"postinstall": "node -e \"require('fs').copyFileSync(require.resolve('pdfjs-dist/build/pdf.worker.min.mjs'),'public/pdf.worker.min.mjs')\""` to `apps/web/package.json` scripts, run `npm run postinstall`, commit the copied file) and set `workerSrc = "/pdf.worker.min.mjs"`. Re-run the build.

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/src/lib/cvParsers.ts apps/web/src/lib/cvExtract.* apps/web/src/types apps/web/public
git commit -m "feat(web): client-side CV text extraction (PDF/DOCX)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Speech clients, mic permission, recorder hook

**Files:**
- Create: `apps/web/src/lib/transcribeAudioClient.ts`, `apps/web/src/lib/transcribeAudioClient.test.ts`
- Create: `apps/web/src/lib/warmUpSpeechClient.ts`
- Create: `apps/web/src/lib/micPermission.ts`
- Create: `apps/web/src/lib/useRecorder.ts`, `apps/web/src/lib/useRecorder.test.ts`

**Interfaces:**
- Produces:
  - `blobToBase64(blob: Blob): Promise<string>`; `transcribeAudio(blob: Blob): Promise<string>` (English transcript text)
  - `warmUpSpeech(): Promise<void>` (never throws)
  - `type MicPermission = "granted" | "denied" | "prompt" | "unsupported"`; `isRecordingSupported(): boolean`; `getMicPermission(): Promise<MicPermission>`; `requestMicPermission(): Promise<boolean>`
  - `interface RecordedAudio { blob: Blob; seconds: number }`; `useRecorder(): { recording: boolean; elapsed: number; error: "denied" | null; start(): Promise<boolean>; stop(): Promise<RecordedAudio | null>; cancel(): void }`

- [ ] **Step 1: Write failing tests**

`apps/web/src/lib/transcribeAudioClient.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { httpsCallable } from "firebase/functions";
import { blobToBase64, transcribeAudio } from "./transcribeAudioClient";

const callableMock = vi.fn();
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn(() => callableMock) }));
vi.mock("./firebase", () => ({ getFirebaseFunctions: vi.fn(() => "fns") }));

describe("transcribeAudioClient", () => {
  it("base64-encodes a blob", async () => {
    await expect(blobToBase64(new Blob(["hello"]))).resolves.toBe("aGVsbG8=");
  });

  it("calls transcribeAudio with English and returns the text", async () => {
    callableMock.mockResolvedValue({ data: { text: "I built it.", language: "en" } });
    await expect(transcribeAudio(new Blob(["hello"]))).resolves.toBe("I built it.");
    expect(httpsCallable).toHaveBeenCalledWith("fns", "transcribeAudio");
    expect(callableMock).toHaveBeenCalledWith({ audioBase64: "aGVsbG8=", language: "en" });
  });
});
```

`apps/web/src/lib/useRecorder.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRecorder } from "./useRecorder";

class FakeRecorder {
  static isTypeSupported = () => true;
  mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {}
  stop() {
    this.ondataavailable?.({ data: new Blob(["abc"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

const trackStop = vi.fn();

beforeEach(() => {
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: trackStop }] }) },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  trackStop.mockClear();
});

describe("useRecorder", () => {
  it("records and returns a blob, releasing the mic", async () => {
    const { result } = renderHook(() => useRecorder());
    let started = false;
    await act(async () => {
      started = await result.current.start();
    });
    expect(started).toBe(true);
    expect(result.current.recording).toBe(true);

    let audio: Awaited<ReturnType<typeof result.current.stop>> = null;
    await act(async () => {
      audio = await result.current.stop();
    });
    expect(audio!.blob.size).toBe(3);
    expect(result.current.recording).toBe(false);
    expect(trackStop).toHaveBeenCalled();
  });

  it("sets error=denied when getUserMedia rejects", async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(new Error("NotAllowed"));
    const { result } = renderHook(() => useRecorder());
    await act(async () => {
      expect(await result.current.start()).toBe(false);
    });
    expect(result.current.error).toBe("denied");
  });

  it("stop without start returns null", async () => {
    const { result } = renderHook(() => useRecorder());
    await act(async () => {
      expect(await result.current.stop()).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd apps/web && npx vitest run src/lib/transcribeAudioClient.test.ts src/lib/useRecorder.test.ts`

- [ ] **Step 3: Implement**

`apps/web/src/lib/transcribeAudioClient.ts`:

```ts
import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "./firebase";

// Keep in sync with functions/src/transcribeAudio.ts.
interface TranscribeAudioRequest {
  audioBase64: string;
  language?: "vi" | "en";
}

interface TranscribeAudioResult {
  text: string;
  language: string;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Sends MediaRecorder output (webm/opus or mp4) as-is; faster-whisper
// decodes it via PyAV.
export async function transcribeAudio(blob: Blob): Promise<string> {
  const callable = httpsCallable<TranscribeAudioRequest, TranscribeAudioResult>(
    getFirebaseFunctions(),
    "transcribeAudio"
  );
  const response = await callable({ audioBase64: await blobToBase64(blob), language: "en" });
  return response.data.text;
}
```

`apps/web/src/lib/warmUpSpeechClient.ts`:

```ts
import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "./firebase";

// Best-effort wake-up of the TTS/STT Cloud Run services. Never throws.
export async function warmUpSpeech(): Promise<void> {
  try {
    await httpsCallable(getFirebaseFunctions(), "warmUpSpeech")({});
  } catch {
    // ignore — the real calls will simply pay the cold start
  }
}
```

`apps/web/src/lib/micPermission.ts`:

```ts
export type MicPermission = "granted" | "denied" | "prompt" | "unsupported";

export function isRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export async function getMicPermission(): Promise<MicPermission> {
  if (!isRecordingSupported()) return "unsupported";
  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return status.state;
  } catch {
    // Firefox/Safari may not support querying "microphone" — treat as askable.
    return "prompt";
  }
}

export async function requestMicPermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}
```

`apps/web/src/lib/useRecorder.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface RecordedAudio {
  blob: Blob;
  seconds: number;
}

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<"denied" | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const release = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("denied");
      return false;
    }
    setError(null);
    const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    streamRef.current = stream;
    recorderRef.current = recorder;
    recorder.start();
    startedAtRef.current = Date.now();
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 250);
    setRecording(true);
    return true;
  }, []);

  const stop = useCallback((): Promise<RecordedAudio | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return Promise.resolve(null);
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const seconds = Math.round((Date.now() - startedAtRef.current) / 1000);
        release();
        resolve({ blob, seconds });
      };
      recorder.stop();
    });
  }, [release]);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        // already stopped
      }
    }
    release();
  }, [release]);

  useEffect(() => cancel, [cancel]);

  return { recording, elapsed, error, start, stop, cancel };
}
```

- [ ] **Step 4: Run — PASS**; typecheck.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/transcribeAudioClient.* apps/web/src/lib/warmUpSpeechClient.ts apps/web/src/lib/micPermission.ts apps/web/src/lib/useRecorder.*
git commit -m "feat(web): STT/warm-up clients, mic permission, recorder hook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Interview state machine

**Files:**
- Create: `apps/web/src/lib/interviewMachine.ts`, `apps/web/src/lib/interviewMachine.test.ts`

**Interfaces:**
- Consumes: `InterviewTurn` (Task 2).
- Produces:
  - `type InterviewPhase = "warming" | "speaking" | "idle" | "recording" | "transcribing" | "sttError" | "review" | "processing" | "closing" | "grading"`
  - `type InterviewNotice = null | "plan_failed" | "empty_transcript" | "tts_failed"`
  - `interface InterviewState { phase; plan: string[]; mainIndex: number; followUpUsed: boolean; question: string; kind: "main" | "follow_up"; draft: string; notice: InterviewNotice }`
  - `type InterviewEvent` (union below), `initialInterviewState`, `interviewReducer(state, event)`, `canFollowUp(state): boolean`, `resumeIndex(turns: InterviewTurn[]): number`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  canFollowUp,
  initialInterviewState,
  interviewReducer,
  resumeIndex,
  type InterviewEvent,
  type InterviewState,
} from "./interviewMachine";

const PLAN = ["Q1", "Q2"];

function run(events: InterviewEvent[], from: InterviewState = initialInterviewState): InterviewState {
  return events.reduce(interviewReducer, from);
}

describe("interviewMachine", () => {
  it("starts warming and speaks the first question when the plan is ready", () => {
    const s = run([{ type: "PLAN_READY", plan: PLAN }]);
    expect(s).toMatchObject({ phase: "speaking", mainIndex: 0, question: "Q1", kind: "main" });
  });

  it("can resume from a later index, or go straight to closing", () => {
    expect(run([{ type: "PLAN_READY", plan: PLAN, startIndex: 1 }]).question).toBe("Q2");
    expect(run([{ type: "PLAN_READY", plan: PLAN, startIndex: 2 }]).phase).toBe("closing");
  });

  it("flags plan failure and clears it on retry", () => {
    const failed = run([{ type: "PLAN_FAILED" }]);
    expect(failed).toMatchObject({ phase: "warming", notice: "plan_failed" });
    expect(run([{ type: "RETRY_PLAN" }], failed).notice).toBeNull();
  });

  it("runs a turn with review", () => {
    const s = run([
      { type: "PLAN_READY", plan: PLAN },
      { type: "SPEECH_ENDED" },
      { type: "START_RECORDING" },
      { type: "STOP_RECORDING" },
      { type: "TRANSCRIBED", text: "My answer", review: true },
    ]);
    expect(s).toMatchObject({ phase: "review", draft: "My answer" });
    const edited = run([{ type: "EDIT_DRAFT", text: "My fixed answer" }, { type: "SEND" }], s);
    expect(edited).toMatchObject({ phase: "processing", draft: "My fixed answer" });
  });

  it("skips review when disabled", () => {
    const s = run([
      { type: "PLAN_READY", plan: PLAN },
      { type: "SPEECH_ENDED" },
      { type: "START_RECORDING" },
      { type: "STOP_RECORDING" },
      { type: "TRANSCRIBED", text: "x", review: false },
    ]);
    expect(s.phase).toBe("processing");
  });

  it("returns to idle with a notice on an empty transcript", () => {
    const s = run([
      { type: "PLAN_READY", plan: PLAN },
      { type: "SPEECH_ENDED" },
      { type: "START_RECORDING" },
      { type: "STOP_RECORDING" },
      { type: "TRANSCRIBED", text: "   ", review: true },
    ]);
    expect(s).toMatchObject({ phase: "idle", notice: "empty_transcript" });
  });

  it("keeps the recording for retry on STT failure", () => {
    const failed = run([
      { type: "PLAN_READY", plan: PLAN },
      { type: "SPEECH_ENDED" },
      { type: "START_RECORDING" },
      { type: "STOP_RECORDING" },
      { type: "TRANSCRIBE_FAILED" },
    ]);
    expect(failed.phase).toBe("sttError");
    expect(run([{ type: "RETRY_TRANSCRIBE" }], failed).phase).toBe("transcribing");
    expect(run([{ type: "START_RECORDING" }], failed).phase).toBe("recording");
  });

  it("allows exactly one follow-up per main question", () => {
    const processing = run([
      { type: "PLAN_READY", plan: PLAN },
      { type: "SPEECH_ENDED" },
      { type: "START_RECORDING" },
      { type: "STOP_RECORDING" },
      { type: "TRANSCRIBED", text: "a", review: false },
    ]);
    expect(canFollowUp(processing)).toBe(true);
    const followUp = run([{ type: "FOLLOW_UP", question: "Why?" }], processing);
    expect(followUp).toMatchObject({ phase: "speaking", question: "Why?", kind: "follow_up", mainIndex: 0 });
    const secondProcessing = run(
      [{ type: "SPEECH_ENDED" }, { type: "START_RECORDING" }, { type: "STOP_RECORDING" }, { type: "TRANSCRIBED", text: "b", review: false }],
      followUp
    );
    expect(canFollowUp(secondProcessing)).toBe(false);
    const next = run([{ type: "NEXT_MAIN" }], secondProcessing);
    expect(next).toMatchObject({ phase: "speaking", question: "Q2", mainIndex: 1, kind: "main", followUpUsed: false });
    expect(canFollowUp({ ...next, phase: "processing" })).toBe(true);
  });

  it("goes to closing after the last main question, then grading", () => {
    const last = run([{ type: "PLAN_READY", plan: PLAN, startIndex: 1 }, { type: "SPEECH_ENDED" }, { type: "SKIP" }]);
    expect(last.phase).toBe("closing");
    expect(run([{ type: "CLOSING_ENDED" }], last).phase).toBe("grading");
  });

  it("REPLAY from idle speaks again; END_EARLY jumps to grading", () => {
    const idle = run([{ type: "PLAN_READY", plan: PLAN }, { type: "SPEECH_ENDED", ttsFailed: true }]);
    expect(idle.notice).toBe("tts_failed");
    expect(run([{ type: "REPLAY" }], idle)).toMatchObject({ phase: "speaking", notice: null });
    expect(run([{ type: "END_EARLY" }], idle).phase).toBe("grading");
  });

  it("ignores events that are invalid for the current phase", () => {
    const idle = run([{ type: "PLAN_READY", plan: PLAN }, { type: "SPEECH_ENDED" }]);
    expect(run([{ type: "SEND" }], idle)).toBe(idle);
  });

  it("resumeIndex is one past the highest answered main index", () => {
    expect(resumeIndex([])).toBe(0);
    expect(
      resumeIndex([
        { mainIndex: 0, kind: "main", question: "", answer: "", skipped: false, answerSeconds: 0 },
        { mainIndex: 1, kind: "main", question: "", answer: "", skipped: true, answerSeconds: 0 },
      ])
    ).toBe(2);
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd apps/web && npx vitest run src/lib/interviewMachine.test.ts`

- [ ] **Step 3: Implement**

```ts
import type { InterviewTurn } from "./interviewTypes";

export type InterviewPhase =
  | "warming"
  | "speaking"
  | "idle"
  | "recording"
  | "transcribing"
  | "sttError"
  | "review"
  | "processing"
  | "closing"
  | "grading";

export type InterviewNotice = null | "plan_failed" | "empty_transcript" | "tts_failed";

export interface InterviewState {
  phase: InterviewPhase;
  plan: string[];
  mainIndex: number;
  followUpUsed: boolean;
  question: string;
  kind: "main" | "follow_up";
  draft: string;
  notice: InterviewNotice;
}

export type InterviewEvent =
  | { type: "PLAN_READY"; plan: string[]; startIndex?: number }
  | { type: "PLAN_FAILED" }
  | { type: "RETRY_PLAN" }
  | { type: "SPEECH_ENDED"; ttsFailed?: boolean }
  | { type: "REPLAY" }
  | { type: "START_RECORDING" }
  | { type: "STOP_RECORDING" }
  | { type: "TRANSCRIBED"; text: string; review: boolean }
  | { type: "TRANSCRIBE_FAILED" }
  | { type: "RETRY_TRANSCRIBE" }
  | { type: "EDIT_DRAFT"; text: string }
  | { type: "SEND" }
  | { type: "FOLLOW_UP"; question: string }
  | { type: "NEXT_MAIN" }
  | { type: "SKIP" }
  | { type: "CLOSING_ENDED" }
  | { type: "END_EARLY" };

export const initialInterviewState: InterviewState = {
  phase: "warming",
  plan: [],
  mainIndex: 0,
  followUpUsed: false,
  question: "",
  kind: "main",
  draft: "",
  notice: null,
};

function askMain(state: InterviewState, index: number): InterviewState {
  if (index >= state.plan.length) {
    return { ...state, phase: "closing", draft: "", notice: null };
  }
  return {
    ...state,
    phase: "speaking",
    mainIndex: index,
    followUpUsed: false,
    question: state.plan[index],
    kind: "main",
    draft: "",
    notice: null,
  };
}

export function interviewReducer(state: InterviewState, event: InterviewEvent): InterviewState {
  const { phase } = state;
  switch (event.type) {
    case "PLAN_READY":
      return phase === "warming" ? askMain({ ...state, plan: event.plan }, event.startIndex ?? 0) : state;
    case "PLAN_FAILED":
      return phase === "warming" ? { ...state, notice: "plan_failed" } : state;
    case "RETRY_PLAN":
      return phase === "warming" ? { ...state, notice: null } : state;
    case "SPEECH_ENDED":
      return phase === "speaking" ? { ...state, phase: "idle", notice: event.ttsFailed ? "tts_failed" : null } : state;
    case "REPLAY":
      return phase === "idle" ? { ...state, phase: "speaking", notice: null } : state;
    case "START_RECORDING":
      return phase === "idle" || phase === "sttError" || phase === "review"
        ? { ...state, phase: "recording", draft: "", notice: null }
        : state;
    case "STOP_RECORDING":
      return phase === "recording" ? { ...state, phase: "transcribing" } : state;
    case "TRANSCRIBED": {
      if (phase !== "transcribing") return state;
      const text = event.text.trim();
      if (!text) return { ...state, phase: "idle", notice: "empty_transcript" };
      return { ...state, phase: event.review ? "review" : "processing", draft: text };
    }
    case "TRANSCRIBE_FAILED":
      return phase === "transcribing" ? { ...state, phase: "sttError" } : state;
    case "RETRY_TRANSCRIBE":
      return phase === "sttError" ? { ...state, phase: "transcribing" } : state;
    case "EDIT_DRAFT":
      return phase === "review" ? { ...state, draft: event.text } : state;
    case "SEND":
      return phase === "review" && state.draft.trim() ? { ...state, phase: "processing" } : state;
    case "FOLLOW_UP":
      return phase === "processing"
        ? { ...state, phase: "speaking", question: event.question, kind: "follow_up", followUpUsed: true, draft: "" }
        : state;
    case "NEXT_MAIN":
      return phase === "processing" ? askMain(state, state.mainIndex + 1) : state;
    case "SKIP":
      return phase === "idle" || phase === "sttError" || phase === "review" ? askMain(state, state.mainIndex + 1) : state;
    case "CLOSING_ENDED":
      return phase === "closing" ? { ...state, phase: "grading" } : state;
    case "END_EARLY":
      return phase === "grading" ? state : { ...state, phase: "grading" };
  }
}

export function canFollowUp(state: InterviewState): boolean {
  return state.kind === "main" && !state.followUpUsed;
}

export function resumeIndex(turns: InterviewTurn[]): number {
  return turns.length === 0 ? 0 : Math.max(...turns.map((t) => t.mainIndex)) + 1;
}
```

- [ ] **Step 4: Run — PASS**; typecheck.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/interviewMachine.*
git commit -m "feat(web): interview session state machine

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Interview audio hook (TTS chunking, prefetch, playback)

**Files:**
- Create: `apps/web/src/lib/useInterviewAudio.ts`, `apps/web/src/lib/useInterviewAudio.test.ts`

**Interfaces:**
- Consumes: `splitSentences` (Task 2); `synthesizeSpeech`, `toAudioDataUrl` (`./synthesizeSpeechClient`); `InterviewVoice` (Task 2).
- Produces: `interface InterviewAudio { speak(text: string): Promise<boolean>; prefetch(key: string, text: string): void; playPrefetched(key: string, text: string): Promise<boolean>; stop(): void }`; `useInterviewAudio(voice: InterviewVoice): InterviewAudio`. Each play method resolves `true` if every chunk played to the end, `false` on any TTS/playback failure or `stop()`. Never rejects.

- [ ] **Step 1: Write failing tests**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useInterviewAudio } from "./useInterviewAudio";
import { synthesizeSpeech } from "./synthesizeSpeechClient";

vi.mock("./synthesizeSpeechClient", () => ({
  synthesizeSpeech: vi.fn(),
  toAudioDataUrl: (b64: string) => `data:${b64}`,
}));

const played: string[] = [];
let autoEnd = true;

class FakeAudio {
  src = "";
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play() {
    played.push(this.src);
    if (autoEnd) queueMicrotask(() => this.onended?.());
    return Promise.resolve();
  }
  pause() {}
}

beforeEach(() => {
  played.length = 0;
  autoEnd = true;
  vi.stubGlobal("Audio", FakeAudio);
  vi.mocked(synthesizeSpeech).mockImplementation(async ({ text }) => ({ audioBase64: text }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("useInterviewAudio", () => {
  it("speaks every chunk in order with the chosen voice", async () => {
    const { result } = renderHook(() => useInterviewAudio("female2"));
    const text = `${"a".repeat(300)}. ${"b".repeat(300)}.`;
    let ok = false;
    await act(async () => {
      ok = await result.current.speak(text);
    });
    expect(ok).toBe(true);
    expect(synthesizeSpeech).toHaveBeenCalledTimes(2);
    expect(synthesizeSpeech).toHaveBeenCalledWith(expect.objectContaining({ language: "en", voice: "female2" }));
    expect(played).toEqual([`data:${"a".repeat(300)}.`, `data:${"b".repeat(300)}.`]);
  });

  it("resolves false when synthesis fails", async () => {
    vi.mocked(synthesizeSpeech).mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useInterviewAudio("male1"));
    await act(async () => {
      expect(await result.current.speak("Hello.")).toBe(false);
    });
  });

  it("reuses prefetched clips", async () => {
    const { result } = renderHook(() => useInterviewAudio("male1"));
    act(() => result.current.prefetch("main-1", "Next question?"));
    await act(async () => {
      expect(await result.current.playPrefetched("main-1", "Next question?")).toBe(true);
    });
    expect(synthesizeSpeech).toHaveBeenCalledTimes(1);
  });

  it("playPrefetched synthesizes on demand when nothing was prefetched", async () => {
    const { result } = renderHook(() => useInterviewAudio("male1"));
    await act(async () => {
      expect(await result.current.playPrefetched("main-9", "Hi.")).toBe(true);
    });
    expect(synthesizeSpeech).toHaveBeenCalledTimes(1);
  });

  it("stop() resolves the pending play with false", async () => {
    autoEnd = false;
    const { result } = renderHook(() => useInterviewAudio("male1"));
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.speak("Hello.");
    });
    await act(async () => {
      await Promise.resolve();
      result.current.stop();
    });
    await expect(pending).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd apps/web && npx vitest run src/lib/useInterviewAudio.test.ts`

- [ ] **Step 3: Implement**

```ts
"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { splitSentences } from "./splitSentences";
import { synthesizeSpeech, toAudioDataUrl } from "./synthesizeSpeechClient";
import type { InterviewVoice } from "./interviewTypes";

export interface InterviewAudio {
  speak(text: string): Promise<boolean>;
  prefetch(key: string, text: string): void;
  playPrefetched(key: string, text: string): Promise<boolean>;
  stop(): void;
}

type Clip = Promise<string | null>;

// Every chunk's synthesis starts immediately; playback awaits them in order,
// so chunk 1 plays while later chunks are still synthesizing.
export function useInterviewAudio(voice: InterviewVoice): InterviewAudio {
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prefetchedRef = useRef(new Map<string, Clip[]>());
  const generationRef = useRef(0);
  const cancelCurrentRef = useRef<(() => void) | null>(null);

  const synthesize = useCallback((text: string): Clip[] => {
    return splitSentences(text).map((chunk) =>
      synthesizeSpeech({ text: chunk, language: "en", voice: voiceRef.current })
        .then((r) => toAudioDataUrl(r.audioBase64))
        .catch(() => null)
    );
  }, []);

  const playUrl = useCallback((url: string): Promise<boolean> => {
    audioRef.current ??= new Audio();
    const audio = audioRef.current;
    return new Promise((resolve) => {
      const done = (ok: boolean) => {
        audio.onended = null;
        audio.onerror = null;
        cancelCurrentRef.current = null;
        resolve(ok);
      };
      audio.onended = () => done(true);
      audio.onerror = () => done(false);
      cancelCurrentRef.current = () => done(false);
      audio.src = url;
      audio.play().catch(() => done(false));
    });
  }, []);

  const playClips = useCallback(
    async (clips: Clip[]): Promise<boolean> => {
      const generation = ++generationRef.current;
      if (clips.length === 0) return false;
      for (const clip of clips) {
        const url = await clip;
        if (generation !== generationRef.current || !url) return false;
        const ok = await playUrl(url);
        if (!ok || generation !== generationRef.current) return false;
      }
      return true;
    },
    [playUrl]
  );

  const stop = useCallback(() => {
    generationRef.current++;
    audioRef.current?.pause();
    cancelCurrentRef.current?.();
  }, []);

  useEffect(() => stop, [stop]);

  return useMemo(
    () => ({
      speak: (text: string) => playClips(synthesize(text)),
      prefetch: (key: string, text: string) => {
        if (!prefetchedRef.current.has(key)) prefetchedRef.current.set(key, synthesize(text));
      },
      playPrefetched: (key: string, text: string) => {
        const clips = prefetchedRef.current.get(key) ?? synthesize(text);
        prefetchedRef.current.delete(key);
        return playClips(clips);
      },
      stop,
    }),
    [playClips, synthesize, stop]
  );
}
```

- [ ] **Step 4: Run — PASS**; typecheck.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/useInterviewAudio.*
git commit -m "feat(web): interview TTS hook with chunking and prefetch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 10: Setup components — CV upload, readiness card, recent sessions

**Files:**
- Create: `apps/web/src/components/interview/CvUpload.tsx`, `CvUpload.test.tsx`
- Create: `apps/web/src/components/interview/ReadinessCard.tsx`, `ReadinessCard.test.tsx`
- Create: `apps/web/src/components/interview/RecentSessions.tsx`, `RecentSessions.test.tsx`
- Modify: `apps/web/src/styles/bloom.css` (append)

**Interfaces:**
- Consumes: `extractCvText`, `normalizeCvText`, `CV_MIN_TEXT_CHARS` (Task 6); `buildCvSummaryPrompt`, `parseCvSummary` (Task 3); `callInterviewAi` (Task 3); `saveCvProfile`, `deleteCvProfile` (Task 5); `MicPermission` (Task 7); `InterviewCvProfile`, `InterviewSession`, `INTERVIEW_TYPES` (Task 2); `UserSettings`.
- Produces:
  - `<CvUpload uid settings profile onChange />` — `onChange(profile: InterviewCvProfile | null)`
  - `<ReadinessCard aiReady: boolean mic: MicPermission onRequestMic: () => void />`
  - `<RecentSessions sessions: InterviewSession[] />`

- [ ] **Step 1: Write failing tests**

`apps/web/src/components/interview/CvUpload.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CvUpload } from "./CvUpload";
import { extractCvText } from "@/lib/cvExtract";
import { callInterviewAi } from "@/lib/interviewAi";
import { deleteCvProfile, saveCvProfile } from "@/lib/cvProfile";
import { DEFAULT_SETTINGS } from "@/lib/settings";

vi.mock("@/lib/cvExtract", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cvExtract")>("@/lib/cvExtract");
  return { ...actual, extractCvText: vi.fn() };
});
vi.mock("@/lib/interviewAi", () => ({ callInterviewAi: vi.fn() }));
vi.mock("@/lib/cvProfile", () => ({ saveCvProfile: vi.fn(), deleteCvProfile: vi.fn() }));

const SUMMARY_JSON = JSON.stringify({ summary: "React dev", topics: ["2 năm React", "VNPay"] });
const PROFILE = { fileName: "cv.pdf", text: "t", summary: "s", topics: ["2 năm React", "VNPay"], updatedAt: "x" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(callInterviewAi).mockResolvedValue(SUMMARY_JSON);
  vi.mocked(saveCvProfile).mockResolvedValue(undefined);
  vi.mocked(deleteCvProfile).mockResolvedValue(undefined);
});

function upload(name = "cv.pdf") {
  fireEvent.change(screen.getByTestId("cv-file-input"), {
    target: { files: [new File(["x"], name)] },
  });
}

describe("CvUpload", () => {
  it("extracts, summarizes, saves and reports the new profile", async () => {
    vi.mocked(extractCvText).mockResolvedValue({ ok: true, text: "CV TEXT" });
    const onChange = vi.fn();
    render(<CvUpload uid="u1" settings={DEFAULT_SETTINGS} profile={null} onChange={onChange} />);
    expect(screen.getByText(/Kéo thả CV vào đây/)).toBeInTheDocument();
    upload();
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const saved = vi.mocked(saveCvProfile).mock.calls[0][1];
    expect(saved).toMatchObject({ fileName: "cv.pdf", text: "CV TEXT", summary: "React dev", topics: ["2 năm React", "VNPay"] });
    expect(onChange).toHaveBeenCalledWith(saved);
  });

  it("offers DOCX and paste fallbacks when the PDF has no text", async () => {
    vi.mocked(extractCvText).mockResolvedValue({ ok: false, reason: "no_text" });
    const onChange = vi.fn();
    render(<CvUpload uid="u1" settings={DEFAULT_SETTINGS} profile={null} onChange={onChange} />);
    upload("scan.pdf");
    expect(await screen.findByText(/có thể là bản scan/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tải bản DOCX" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dán nội dung CV" }));
    fireEvent.change(screen.getByLabelText("Nội dung CV"), { target: { value: "word ".repeat(80) } });
    fireEvent.click(screen.getByRole("button", { name: "Dùng nội dung này" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(vi.mocked(saveCvProfile).mock.calls[0][1].fileName).toBe("Nội dung dán");
  });

  it("rejects pasted text that is too short", async () => {
    vi.mocked(extractCvText).mockResolvedValue({ ok: false, reason: "no_text" });
    render(<CvUpload uid="u1" settings={DEFAULT_SETTINGS} profile={null} onChange={vi.fn()} />);
    upload("scan.pdf");
    fireEvent.click(await screen.findByRole("button", { name: "Dán nội dung CV" }));
    fireEvent.change(screen.getByLabelText("Nội dung CV"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Dùng nội dung này" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("quá ngắn");
    expect(callInterviewAi).not.toHaveBeenCalled();
  });

  it("shows an error for unsupported files", async () => {
    vi.mocked(extractCvText).mockResolvedValue({ ok: false, reason: "unsupported" });
    render(<CvUpload uid="u1" settings={DEFAULT_SETTINGS} profile={null} onChange={vi.fn()} />);
    upload("cv.png");
    expect(await screen.findByRole("alert")).toHaveTextContent("PDF hoặc DOCX");
  });

  it("shows a saved profile with topics and can remove it", async () => {
    const onChange = vi.fn();
    render(<CvUpload uid="u1" settings={DEFAULT_SETTINGS} profile={PROFILE} onChange={onChange} />);
    expect(screen.getByText("cv.pdf")).toBeInTheDocument();
    expect(screen.getByText("VNPay")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gỡ CV" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
    expect(deleteCvProfile).toHaveBeenCalledWith("u1");
  });
});
```

`apps/web/src/components/interview/ReadinessCard.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ReadinessCard } from "./ReadinessCard";

describe("ReadinessCard", () => {
  it("links to Settings when the AI key is missing", () => {
    render(<ReadinessCard aiReady={false} mic="granted" onRequestMic={vi.fn()} />);
    expect(screen.getByRole("link", { name: /Cài đặt/ })).toHaveAttribute("href", "/settings");
  });

  it("asks for mic permission when promptable", () => {
    const onRequestMic = vi.fn();
    render(<ReadinessCard aiReady mic="prompt" onRequestMic={onRequestMic} />);
    fireEvent.click(screen.getByRole("button", { name: "Cho phép" }));
    expect(onRequestMic).toHaveBeenCalled();
  });

  it("explains a blocked or unsupported mic", () => {
    const { rerender } = render(<ReadinessCard aiReady mic="denied" onRequestMic={vi.fn()} />);
    expect(screen.getByText(/Micro bị chặn/)).toBeInTheDocument();
    rerender(<ReadinessCard aiReady mic="unsupported" onRequestMic={vi.fn()} />);
    expect(screen.getByText(/không hỗ trợ ghi âm/)).toBeInTheDocument();
  });

  it("shows both ready", () => {
    render(<ReadinessCard aiReady mic="granted" onRequestMic={vi.fn()} />);
    expect(screen.getByText("Đã có khóa AI")).toBeInTheDocument();
    expect(screen.getByText("Micro đã sẵn sàng")).toBeInTheDocument();
  });
});
```

`apps/web/src/components/interview/RecentSessions.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecentSessions } from "./RecentSessions";
import type { InterviewSession } from "@/lib/interviewTypes";

const SESSION: InterviewSession = {
  id: "s1",
  createdAt: "2026-09-25T10:00:00.000Z",
  status: "completed",
  setup: { role: "Software Engineer", level: "junior", type: "behavioral", questionCount: 5, voice: "male2", jd: "", cvSummary: null, reviewTranscript: true },
  plan: ["a", "b", "c", "d", "e"],
  turns: [],
  report: {
    overall: 7.2,
    criteria: { content: 7, structure: 7, grammar: 7, vocabulary: 7, fluency: 7 },
    criteriaNotes: { content: "", structure: "", grammar: "", vocabulary: "", fluency: "" },
    improvements: [],
    questions: [],
  },
  reportError: false,
};

describe("RecentSessions", () => {
  it("links each session to its report with its score", () => {
    render(<RecentSessions sessions={[SESSION]} />);
    const link = screen.getByRole("link", { name: /Software Engineer · Behavioral/ });
    expect(link).toHaveAttribute("href", "/interview/s1/report");
    expect(link).toHaveTextContent("7.2");
    expect(link).toHaveTextContent("25/09 · 5 câu");
  });

  it("shows a dash when a session has no report", () => {
    render(<RecentSessions sessions={[{ ...SESSION, report: null, reportError: true }]} />);
    expect(screen.getByRole("link")).toHaveTextContent("—");
  });

  it("shows an empty state", () => {
    render(<RecentSessions sessions={[]} />);
    expect(screen.getByText("Chưa có buổi nào.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd apps/web && npx vitest run src/components/interview`

- [ ] **Step 3: Implement `CvUpload.tsx`**

```tsx
"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { CV_MIN_TEXT_CHARS, extractCvText, normalizeCvText } from "@/lib/cvExtract";
import { buildCvSummaryPrompt, parseCvSummary } from "@/lib/interviewPrompts";
import { callInterviewAi } from "@/lib/interviewAi";
import { deleteCvProfile, saveCvProfile } from "@/lib/cvProfile";
import type { InterviewCvProfile } from "@/lib/interviewTypes";
import type { UserSettings } from "@/lib/settings";

type Mode = "idle" | "reading" | "no_text" | "paste";

const EXTRACT_ERRORS = {
  unsupported: "Chỉ nhận file PDF hoặc DOCX.",
  too_large: "File lớn hơn 5 MB.",
  read_error: "Không đọc được file này — thử file khác.",
} as const;

export interface CvUploadProps {
  uid: string;
  settings: UserSettings;
  profile: InterviewCvProfile | null;
  onChange(profile: InterviewCvProfile | null): void;
}

export function CvUpload({ uid, settings, profile, onChange }: CvUploadProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [pasted, setPasted] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function summarize(text: string, name: string) {
    setMode("reading");
    try {
      const { summary, topics } = parseCvSummary(await callInterviewAi(settings, buildCvSummaryPrompt(text)));
      const next: InterviewCvProfile = { fileName: name, text, summary, topics, updatedAt: new Date().toISOString() };
      await saveCvProfile(uid, next);
      onChange(next);
      setPasted("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tóm tắt được CV.");
    }
    setMode("idle");
  }

  async function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    setMode("reading");
    const result = await extractCvText(file);
    if (result.ok) {
      await summarize(result.text, file.name);
    } else if (result.reason === "no_text") {
      setMode("no_text");
    } else {
      setError(EXTRACT_ERRORS[result.reason]);
      setMode("idle");
    }
  }

  function handleInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void handleFile(file);
  }

  function handleDrop(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function handlePasteSubmit() {
    if (pasted.replace(/\s/g, "").length < CV_MIN_TEXT_CHARS) {
      setError("Nội dung quá ngắn — hãy dán toàn bộ CV.");
      return;
    }
    setError(null);
    void summarize(normalizeCvText(pasted), "Nội dung dán");
  }

  async function handleRemove() {
    await deleteCvProfile(uid);
    onChange(null);
  }

  const pickFile = () => inputRef.current?.click();

  return (
    <div className="iv-cv">
      <input ref={inputRef} type="file" accept=".pdf,.docx" hidden data-testid="cv-file-input" onChange={handleInput} />

      {mode === "reading" && (
        <div className="iv-cv-box" role="status">
          <strong>{fileName || "CV"}</strong>
          <span className="iv-muted">AI đang đọc CV…</span>
        </div>
      )}

      {mode === "no_text" && (
        <div className="iv-cv-box iv-cv-warn">
          <p>Không đọc được chữ trong file này (có thể là bản scan).</p>
          <div className="iv-row">
            <button type="button" className="btn-secondary" onClick={pickFile}>Tải bản DOCX</button>
            <button type="button" className="btn-secondary" onClick={() => setMode("paste")}>Dán nội dung CV</button>
          </div>
        </div>
      )}

      {mode === "paste" && (
        <div className="iv-cv-box">
          <label htmlFor="iv-cv-paste" className="iv-label">Nội dung CV</label>
          <textarea id="iv-cv-paste" rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)} />
          <div className="iv-row">
            <button type="button" className="btn-primary" onClick={handlePasteSubmit}>Dùng nội dung này</button>
            <button type="button" className="btn-secondary" onClick={() => setMode("idle")}>Hủy</button>
          </div>
        </div>
      )}

      {mode === "idle" && profile && (
        <div className="iv-cv-box iv-cv-done">
          <div className="iv-row iv-cv-head">
            <div className="iv-cv-name">
              <strong>{profile.fileName}</strong>
              <span className="iv-ok">Đã đọc · lưu cho lần sau</span>
            </div>
            <button type="button" className="btn-secondary" onClick={pickFile}>Đổi file</button>
            <button type="button" className="iv-icon-btn" aria-label="Gỡ CV" onClick={() => void handleRemove()}>×</button>
          </div>
          <span className="iv-label">AI sẽ hỏi về:</span>
          <div className="iv-topics">
            {profile.topics.map((t) => (
              <span key={t} className="iv-topic">{t}</span>
            ))}
          </div>
        </div>
      )}

      {mode === "idle" && !profile && (
        <button type="button" className="iv-cv-drop" onClick={pickFile} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
          <strong>Kéo thả CV vào đây, hoặc chọn file</strong>
          <span className="iv-muted">PDF hoặc DOCX · tối đa 5 MB · tiếng Anh hay tiếng Việt đều được</span>
        </button>
      )}

      {error && <p className="iv-error" role="alert">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Implement `ReadinessCard.tsx`**

```tsx
import Link from "next/link";
import type { MicPermission } from "@/lib/micPermission";

export interface ReadinessCardProps {
  aiReady: boolean;
  mic: MicPermission;
  onRequestMic: () => void;
}

export function ReadinessCard({ aiReady, mic, onRequestMic }: ReadinessCardProps) {
  return (
    <section className="iv-card iv-readiness" aria-label="Sẵn sàng chưa?">
      <h3 className="iv-card-title">Sẵn sàng chưa?</h3>
      {aiReady ? (
        <p className="iv-check iv-check-ok">Đã có khóa AI</p>
      ) : (
        <p className="iv-check iv-check-warn">
          Chưa có khóa AI — <Link href="/settings">thêm trong Cài đặt</Link>
        </p>
      )}
      {mic === "granted" && <p className="iv-check iv-check-ok">Micro đã sẵn sàng</p>}
      {mic === "prompt" && (
        <div className="iv-check iv-check-warn iv-row">
          <span>Chưa cấp quyền micro</span>
          <button type="button" className="btn-secondary" onClick={onRequestMic}>Cho phép</button>
        </div>
      )}
      {mic === "denied" && (
        <p className="iv-check iv-check-bad">
          Micro bị chặn — bật lại bằng biểu tượng ổ khóa trên thanh địa chỉ rồi tải lại trang.
        </p>
      )}
      {mic === "unsupported" && (
        <p className="iv-check iv-check-bad">Trình duyệt không hỗ trợ ghi âm — dùng Chrome, Edge hoặc Firefox bản mới.</p>
      )}
      <p className="iv-muted">Nên dùng tai nghe có mic. Mỗi câu trả lời tối đa 3 phút.</p>
    </section>
  );
}
```

- [ ] **Step 5: Implement `RecentSessions.tsx`**

```tsx
import Link from "next/link";
import { INTERVIEW_TYPES, type InterviewSession } from "@/lib/interviewTypes";

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function RecentSessions({ sessions }: { sessions: InterviewSession[] }) {
  return (
    <section className="iv-card" aria-label="Buổi gần đây">
      <h3 className="iv-card-title">Buổi gần đây</h3>
      {sessions.length === 0 && <p className="iv-muted">Chưa có buổi nào.</p>}
      {sessions.map((s) => {
        const typeLabel = INTERVIEW_TYPES.find((t) => t.id === s.setup.type)?.label ?? s.setup.type;
        return (
          <Link key={s.id} href={`/interview/${s.id}/report`} className="iv-recent-row">
            <span className="iv-recent-main">
              <span className="iv-recent-title">{`${s.setup.role} · ${typeLabel}`}</span>
              <span className="iv-muted">{`${shortDate(s.createdAt)} · ${s.plan.length} câu`}</span>
            </span>
            <span className="iv-recent-score">{s.report ? s.report.overall.toFixed(1) : "—"}</span>
          </Link>
        );
      })}
    </section>
  );
}
```

Note: `shortDate` uses local time; the test's `2026-09-25T10:00:00.000Z` is 25/09 in every UTC−10…UTC+13 zone.

- [ ] **Step 6: Append Setup CSS to `apps/web/src/styles/bloom.css`**

```css
/* ── Interview (Phỏng vấn) ─────────────────────────────── */
.iv-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.iv-card-title { margin: 0; font-size: 17px; }
.iv-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.iv-label { font-size: 15px; font-weight: 700; }
.iv-muted { color: var(--ink-soft); font-size: 14.5px; }
.iv-ok { color: var(--success); font-size: 14.5px; font-weight: 600; }
.iv-error { color: var(--danger); font-size: 15px; margin: 6px 0 0; }
.iv-check { margin: 0; font-size: 15.5px; padding-left: 26px; position: relative; }
.iv-check::before { position: absolute; left: 0; font-weight: 800; }
.iv-check-ok::before { content: "✓"; color: var(--success); }
.iv-check-warn::before { content: "!"; color: var(--amber); }
.iv-check-bad::before { content: "×"; color: var(--danger); }
.iv-cv { display: flex; flex-direction: column; gap: 8px; }
.iv-cv-drop {
  min-height: 150px;
  border: 2px dashed var(--border);
  border-radius: 16px;
  background: var(--surface-2);
  color: var(--ink);
  font: inherit;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 16px;
  cursor: pointer;
}
.iv-cv-box {
  border: 1.5px solid var(--border);
  border-radius: 16px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.iv-cv-box textarea { font: inherit; border: 1.5px solid var(--border); border-radius: 12px; padding: 10px 12px; background: var(--surface); color: var(--ink); }
.iv-cv-warn { border-color: var(--amber); background: var(--amber-bg); }
.iv-cv-warn p { margin: 0; }
.iv-cv-done { border-color: var(--sage); }
.iv-cv-head { flex-wrap: nowrap; }
.iv-cv-name { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.iv-icon-btn { width: 36px; height: 36px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); font-size: 18px; cursor: pointer; }
.iv-topics { display: flex; flex-wrap: wrap; gap: 6px; }
.iv-topic { font-size: 13.5px; padding: 4px 10px; border-radius: 999px; background: var(--surface-3); color: var(--ink); }
.iv-recent-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--surface-3); color: var(--ink); text-decoration: none; }
.iv-recent-main { display: flex; flex-direction: column; }
.iv-recent-title { font-weight: 600; }
.iv-recent-score { font-weight: 800; font-size: 16px; }
```

- [ ] **Step 7: Run — PASS**

Run: `cd apps/web && npx vitest run src/components/interview src/styles/bloom.test.ts && npm run typecheck`

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/interview apps/web/src/styles/bloom.css
git commit -m "feat(web): interview setup components (CV upload, readiness, recent sessions)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Setup form, `/interview` page, sidebar entry

**Files:**
- Create: `apps/web/src/components/interview/SetupForm.tsx`, `SetupForm.test.tsx`
- Create: `apps/web/src/app/(app)/interview/page.tsx`, `page.test.tsx`
- Modify: `apps/web/src/components/shell/Sidebar.tsx` (+ `Sidebar.test.tsx` if it enumerates items)
- Modify: `apps/web/src/styles/bloom.css` (append)

**Interfaces:**
- Consumes: Task 2 constants/types; Task 3 `hasAiKey`; Task 5 `createInterviewSession`, `listRecentInterviewSessions`, `getCvProfile`; Task 7 `warmUpSpeech`, `getMicPermission`, `requestMicPermission`, `MicPermission`; Task 9 `useInterviewAudio`; Task 10 components.
- Produces: `type SetupDraft = Omit<InterviewSetup, "cvSummary">`; `DEFAULT_SETUP_DRAFT`; `<SetupForm value onChange onPreviewVoice cvSlot />`; route `/interview` which creates a session and navigates to `/interview/{id}`.

- [ ] **Step 1: Write failing tests**

`apps/web/src/components/interview/SetupForm.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_SETUP_DRAFT, SetupForm } from "./SetupForm";

describe("SetupForm", () => {
  it("edits every field through onChange", () => {
    const onChange = vi.fn();
    render(<SetupForm value={DEFAULT_SETUP_DRAFT} onChange={onChange} onPreviewVoice={vi.fn()} cvSlot={<div>CV</div>} />);

    fireEvent.change(screen.getByLabelText("Vị trí ứng tuyển"), { target: { value: "Data Analyst" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETUP_DRAFT, role: "Data Analyst" });

    fireEvent.click(screen.getByRole("button", { name: "Senior" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETUP_DRAFT, level: "senior" });

    fireEvent.click(screen.getByRole("button", { name: /Technical/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETUP_DRAFT, type: "technical" });

    fireEvent.click(screen.getByRole("button", { name: "10 câu" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETUP_DRAFT, questionCount: 10 });

    fireEvent.click(screen.getByRole("button", { name: /Nữ 2/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETUP_DRAFT, voice: "female2" });

    fireEvent.change(screen.getByLabelText(/Mô tả công việc/), { target: { value: "JD" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETUP_DRAFT, jd: "JD" });

    fireEvent.click(screen.getByLabelText("Xem lại bản chép lời trước khi gửi"));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETUP_DRAFT, reviewTranscript: false });

    expect(screen.getByText("CV")).toBeInTheDocument();
  });

  it("marks the selected options and previews a voice", () => {
    const onPreviewVoice = vi.fn();
    render(<SetupForm value={DEFAULT_SETUP_DRAFT} onChange={vi.fn()} onPreviewVoice={onPreviewVoice} cvSlot={null} />);
    expect(screen.getByRole("button", { name: "Junior" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getAllByRole("button", { name: "Nghe thử giọng" })[3]);
    expect(onPreviewVoice).toHaveBeenCalledWith("female2");
  });
});
```

`apps/web/src/app/(app)/interview/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import InterviewSetupPage from "./page";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { createInterviewSession, listRecentInterviewSessions } from "@/lib/interviewSessions";
import { getCvProfile } from "@/lib/cvProfile";
import { warmUpSpeech } from "@/lib/warmUpSpeechClient";
import { getMicPermission } from "@/lib/micPermission";
import { DEFAULT_SETTINGS, type UserSettings } from "@/lib/settings";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("@/lib/useAuthUser", () => ({ useAuthUser: vi.fn() }));
vi.mock("@/lib/SettingsContext", () => ({ useSettingsContext: vi.fn() }));
vi.mock("@/lib/interviewSessions", () => ({ createInterviewSession: vi.fn(), listRecentInterviewSessions: vi.fn() }));
vi.mock("@/lib/cvProfile", () => ({ getCvProfile: vi.fn(), saveCvProfile: vi.fn(), deleteCvProfile: vi.fn() }));
vi.mock("@/lib/warmUpSpeechClient", () => ({ warmUpSpeech: vi.fn() }));
vi.mock("@/lib/micPermission", () => ({ getMicPermission: vi.fn(), requestMicPermission: vi.fn() }));
vi.mock("@/lib/useInterviewAudio", () => ({
  useInterviewAudio: () => ({ speak: vi.fn().mockResolvedValue(true), prefetch: vi.fn(), playPrefetched: vi.fn(), stop: vi.fn() }),
}));
vi.mock("@/components/SignInButton", () => ({ SignInButton: () => <button>Đăng nhập với Google</button> }));

const WITH_KEY: UserSettings = {
  ...DEFAULT_SETTINGS,
  providers: { ...DEFAULT_SETTINGS.providers, gemini: { ...DEFAULT_SETTINGS.providers.gemini, apiKeyCiphertext: "c" } },
};

function setup(settings: UserSettings = WITH_KEY) {
  vi.mocked(useAuthUser).mockReturnValue({ user: { uid: "u1" }, loading: false } as never);
  vi.mocked(useSettingsContext).mockReturnValue({ settings, loading: false, error: null, save: vi.fn() });
  render(<InterviewSetupPage />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCvProfile).mockResolvedValue({ fileName: "cv.pdf", text: "t", summary: "CV SUMMARY", topics: [], updatedAt: "x" });
  vi.mocked(listRecentInterviewSessions).mockResolvedValue([]);
  vi.mocked(getMicPermission).mockResolvedValue("granted");
  vi.mocked(createInterviewSession).mockResolvedValue("new-id");
});

describe("InterviewSetupPage", () => {
  it("warms up speech services on mount", async () => {
    setup();
    await waitFor(() => expect(warmUpSpeech).toHaveBeenCalled());
  });

  it("disables Start until a role is entered", async () => {
    setup();
    const start = screen.getByRole("button", { name: "Bắt đầu phỏng vấn" });
    expect(start).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Vị trí ứng tuyển"), { target: { value: "Software Engineer" } });
    await waitFor(() => expect(start).toBeEnabled());
  });

  it("keeps Start disabled without an AI key", async () => {
    setup(DEFAULT_SETTINGS);
    fireEvent.change(screen.getByLabelText("Vị trí ứng tuyển"), { target: { value: "SE" } });
    expect(screen.getByRole("button", { name: "Bắt đầu phỏng vấn" })).toBeDisabled();
  });

  it("creates a session with the CV summary and navigates to it", async () => {
    setup();
    await screen.findByText("cv.pdf");
    fireEvent.change(screen.getByLabelText("Vị trí ứng tuyển"), { target: { value: "  Software Engineer " } });
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu phỏng vấn" }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/interview/new-id"));
    expect(createInterviewSession).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ role: "Software Engineer", cvSummary: "CV SUMMARY", questionCount: 5 })
    );
  });

  it("asks signed-out users to sign in", () => {
    vi.mocked(useAuthUser).mockReturnValue({ user: null, loading: false } as never);
    vi.mocked(useSettingsContext).mockReturnValue({ settings: null, loading: false, error: null, save: vi.fn() });
    render(<InterviewSetupPage />);
    expect(screen.getByText("Đăng nhập với Google")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd apps/web && npx vitest run src/components/interview/SetupForm.test.tsx "src/app/(app)/interview/page.test.tsx"`

- [ ] **Step 3: Implement `SetupForm.tsx`**

```tsx
import type { ReactNode } from "react";
import {
  INTERVIEW_LEVELS,
  INTERVIEW_TYPES,
  INTERVIEW_VOICES,
  QUESTION_COUNTS,
  type InterviewSetup,
  type InterviewVoice,
} from "@/lib/interviewTypes";

export type SetupDraft = Omit<InterviewSetup, "cvSummary">;

export const DEFAULT_SETUP_DRAFT: SetupDraft = {
  role: "",
  level: "junior",
  type: "behavioral",
  questionCount: 5,
  voice: "male2",
  jd: "",
  reviewTranscript: true,
};

export interface SetupFormProps {
  value: SetupDraft;
  onChange(next: SetupDraft): void;
  onPreviewVoice(voice: InterviewVoice): void;
  cvSlot: ReactNode;
}

export function SetupForm({ value, onChange, onPreviewVoice, cvSlot }: SetupFormProps) {
  const set = <K extends keyof SetupDraft>(key: K, v: SetupDraft[K]) => onChange({ ...value, [key]: v });
  const chip = (active: boolean) => (active ? "vb-chip active" : "vb-chip");

  return (
    <div className="iv-form">
      <div className="iv-form-row">
        <div className="iv-field iv-grow">
          <label htmlFor="iv-role" className="iv-label">Vị trí ứng tuyển</label>
          <input id="iv-role" className="iv-input" type="text" placeholder="VD: Software Engineer" value={value.role} onChange={(e) => set("role", e.target.value)} />
        </div>
        <div className="iv-field">
          <span className="iv-label">Cấp độ</span>
          <div className="iv-row">
            {INTERVIEW_LEVELS.map((l) => (
              <button key={l.id} type="button" className={chip(value.level === l.id)} aria-pressed={value.level === l.id} onClick={() => set("level", l.id)}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="iv-field">
        <span className="iv-label">Loại phỏng vấn</span>
        <div className="iv-type-grid">
          {INTERVIEW_TYPES.map((t) => (
            <button key={t.id} type="button" className={value.type === t.id ? "iv-type-card active" : "iv-type-card"} aria-pressed={value.type === t.id} onClick={() => set("type", t.id)}>
              <strong>{t.label}</strong>
              <span className="iv-muted">{t.sub}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="iv-field">
        <span className="iv-label">Số câu hỏi</span>
        <div className="iv-row">
          {QUESTION_COUNTS.map((n) => (
            <button key={n} type="button" className={chip(value.questionCount === n)} aria-pressed={value.questionCount === n} onClick={() => set("questionCount", n)}>
              {`${n} câu`}
            </button>
          ))}
        </div>
      </div>

      <div className="iv-field">
        <span className="iv-label">Giọng người phỏng vấn</span>
        <div className="iv-voice-grid">
          {INTERVIEW_VOICES.map((v) => (
            <div key={v.id} className={value.voice === v.id ? "iv-voice active" : "iv-voice"}>
              <button type="button" className="iv-voice-pick" aria-pressed={value.voice === v.id} onClick={() => set("voice", v.id)}>
                <strong>{v.label}</strong>
                <span className="iv-muted">{v.sub}</span>
              </button>
              <button type="button" className="iv-icon-btn" aria-label="Nghe thử giọng" onClick={() => onPreviewVoice(v.id)}>▶</button>
            </div>
          ))}
        </div>
      </div>

      <div className="iv-docs">
        <div className="iv-field">
          <span className="iv-label">CV của bạn <span className="iv-muted">(không bắt buộc)</span></span>
          {cvSlot}
        </div>
        <div className="iv-field">
          <label htmlFor="iv-jd" className="iv-label">Mô tả công việc <span className="iv-muted">(không bắt buộc)</span></label>
          <textarea id="iv-jd" className="iv-input iv-jd" placeholder="Dán JD tiếng Anh vào đây…" value={value.jd} onChange={(e) => set("jd", e.target.value)} />
        </div>
      </div>

      <label className="iv-row iv-checkbox">
        <input type="checkbox" checked={value.reviewTranscript} onChange={(e) => set("reviewTranscript", e.target.checked)} />
        Xem lại bản chép lời trước khi gửi
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Implement `app/(app)/interview/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { SignInButton } from "@/components/SignInButton";
import { hasAiKey } from "@/lib/interviewAi";
import { createInterviewSession, listRecentInterviewSessions } from "@/lib/interviewSessions";
import { getCvProfile } from "@/lib/cvProfile";
import { warmUpSpeech } from "@/lib/warmUpSpeechClient";
import { getMicPermission, requestMicPermission, type MicPermission } from "@/lib/micPermission";
import { useInterviewAudio } from "@/lib/useInterviewAudio";
import type { InterviewCvProfile, InterviewSession, InterviewVoice } from "@/lib/interviewTypes";
import { DEFAULT_SETUP_DRAFT, SetupForm, type SetupDraft } from "@/components/interview/SetupForm";
import { CvUpload } from "@/components/interview/CvUpload";
import { ReadinessCard } from "@/components/interview/ReadinessCard";
import { RecentSessions } from "@/components/interview/RecentSessions";

const VOICE_SAMPLE = "Hi, I'll be your interviewer today.";

export default function InterviewSetupPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();
  const { settings } = useSettingsContext();
  const [draft, setDraft] = useState<SetupDraft>(DEFAULT_SETUP_DRAFT);
  const [cv, setCv] = useState<InterviewCvProfile | null>(null);
  const [recent, setRecent] = useState<InterviewSession[]>([]);
  const [mic, setMic] = useState<MicPermission>("prompt");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const preview = useInterviewAudio(draft.voice);

  useEffect(() => {
    if (!user) return;
    void warmUpSpeech();
    getCvProfile(user.uid).then(setCv).catch(() => {});
    listRecentInterviewSessions(user.uid).then(setRecent).catch(() => {});
    void getMicPermission().then(setMic);
  }, [user]);

  // Runs after the render that applied the newly picked voice, so the
  // audio hook's voice ref is already current.
  useEffect(() => {
    if (previewNonce === 0) return;
    preview.stop();
    void preview.speak(VOICE_SAMPLE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewNonce]);

  if (authLoading) return <p>Đang tải…</p>;
  if (!user) {
    return (
      <div>
        <h2 className="scr-title">Phỏng vấn tiếng Anh</h2>
        <p className="scr-sub">Đăng nhập để luyện phỏng vấn.</p>
        <SignInButton />
      </div>
    );
  }

  const aiReady = hasAiKey(settings);
  const canStart = aiReady && draft.role.trim().length > 0 && mic !== "denied" && mic !== "unsupported" && !starting;

  function handlePreviewVoice(voice: InterviewVoice) {
    setDraft((d) => ({ ...d, voice }));
    setPreviewNonce((n) => n + 1);
  }

  async function handleRequestMic() {
    setMic((await requestMicPermission()) ? "granted" : "denied");
  }

  async function handleStart() {
    if (!user || !canStart) return;
    setStarting(true);
    setStartError(null);
    try {
      const id = await createInterviewSession(user.uid, {
        ...draft,
        role: draft.role.trim(),
        jd: draft.jd.trim(),
        cvSummary: cv?.summary ?? null,
      });
      router.push(`/interview/${id}`);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Không tạo được buổi phỏng vấn.");
      setStarting(false);
    }
  }

  return (
    <div className="iv-page">
      <h2 className="scr-title">Phỏng vấn tiếng Anh</h2>
      <p className="scr-sub">
        Luyện trả lời phỏng vấn bằng giọng nói với người phỏng vấn AI. Nói xong một câu, AI nghe, hỏi tiếp, và chấm chi tiết ở cuối buổi.
      </p>
      <div className="iv-setup-layout">
        <section className="iv-card iv-setup-main" aria-label="Thiết lập">
          <SetupForm
            value={draft}
            onChange={setDraft}
            onPreviewVoice={handlePreviewVoice}
            cvSlot={settings ? <CvUpload uid={user.uid} settings={settings} profile={cv} onChange={setCv} /> : null}
          />
          <div className="iv-row iv-start-row">
            <button type="button" className="btn-primary" disabled={!canStart} onClick={() => void handleStart()}>
              Bắt đầu phỏng vấn
            </button>
            {startError && <p className="iv-error" role="alert">{startError}</p>}
          </div>
        </section>
        <aside className="iv-setup-side">
          <ReadinessCard aiReady={aiReady} mic={mic} onRequestMic={() => void handleRequestMic()} />
          <RecentSessions sessions={recent} />
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add the sidebar entry**

In `apps/web/src/components/shell/Sidebar.tsx`, insert after the `"Nghe"` group:

```ts
  { label: "Phỏng vấn", items: [{ href: "/interview", label: "🎤 Phỏng vấn tiếng Anh" }] },
```

Run `cd apps/web && npx vitest run src/components/shell`; if `Sidebar.test.tsx` asserts the exact list of links/groups, add the new entry to its expectations.

- [ ] **Step 6: Append Setup layout CSS to `bloom.css`**

```css
.iv-setup-layout { display: flex; gap: 22px; align-items: flex-start; }
.iv-setup-main { flex: 1; min-width: 0; }
.iv-setup-side { width: 320px; flex-shrink: 0; display: flex; flex-direction: column; gap: 16px; }
.iv-form { display: flex; flex-direction: column; gap: 20px; }
.iv-form-row { display: flex; gap: 16px; flex-wrap: wrap; }
.iv-field { display: flex; flex-direction: column; gap: 8px; }
.iv-grow { flex: 1; min-width: 220px; }
.iv-input { font: inherit; font-size: 16px; border: 1.5px solid var(--border); border-radius: 14px; padding: 11px 14px; background: var(--surface); color: var(--ink); }
.iv-jd { min-height: 150px; resize: vertical; }
.iv-type-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.iv-type-card { font: inherit; text-align: left; display: flex; flex-direction: column; gap: 6px; padding: 14px; border-radius: 16px; border: 1.5px solid var(--border); background: var(--surface); color: var(--ink); cursor: pointer; }
.iv-type-card.active, .iv-voice.active { border-color: var(--accent); background: var(--surface-2); }
.iv-voice-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.iv-voice { display: flex; align-items: center; gap: 8px; padding: 8px 8px 8px 14px; border-radius: 16px; border: 1.5px solid var(--border); }
.iv-voice-pick { font: inherit; flex: 1; border: 0; background: transparent; color: inherit; text-align: left; display: flex; flex-direction: column; cursor: pointer; padding: 0; }
.iv-docs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.iv-checkbox { font-size: 15.5px; }
.iv-start-row { border-top: 1px solid var(--border); padding-top: 14px; margin-top: 6px; }
@media (max-width: 980px) {
  .iv-setup-layout { flex-direction: column; }
  .iv-setup-side { width: 100%; }
  .iv-type-grid, .iv-voice-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .iv-docs { grid-template-columns: minmax(0, 1fr); }
}
```

- [ ] **Step 7: Run — PASS**

Run: `cd apps/web && npx vitest run src/components/interview src/components/shell "src/app/(app)/interview/page.test.tsx" && npm run typecheck`

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/interview apps/web/src/components/shell apps/web/src/styles/bloom.css "apps/web/src/app/(app)/interview/page.tsx" "apps/web/src/app/(app)/interview/page.test.tsx"
git commit -m "feat(web): interview setup page and sidebar entry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 12: Session components — thread, dock, interviewer card, STAR tips

**Files:**
- Create: `apps/web/src/components/interview/SessionThread.tsx`, `SessionThread.test.tsx`
- Create: `apps/web/src/components/interview/SessionDock.tsx`, `SessionDock.test.tsx`
- Create: `apps/web/src/components/interview/InterviewerCard.tsx`, `apps/web/src/components/interview/StarTips.tsx`
- Modify: `apps/web/src/styles/bloom.css` (append)

**Interfaces:**
- Consumes: `InterviewState`, `initialInterviewState` (Task 8); `InterviewTurn`, `MAX_ANSWER_SECONDS` (Task 2).
- Produces:
  - `<SessionThread turns question kind showQuestion translation translating onReplay onTranslate replayDisabled />` — props `{ turns: InterviewTurn[]; question: string; kind: "main" | "follow_up"; showQuestion: boolean; translation: string | null; translating: boolean; onReplay(): void; onTranslate(): void; replayDisabled: boolean }`
  - `<SessionDock state elapsed micError onStart onStop onSend onEditDraft onRetryTranscribe onSkip onSkipSpeech onReplay onRetryPlan />` — `{ state: InterviewState; elapsed: number; micError: boolean; onStart(): void; onStop(): void; onSend(): void; onEditDraft(text: string): void; onRetryTranscribe(): void; onSkip(): void; onSkipSpeech(): void; onReplay(): void; onRetryPlan(): void }`
  - `formatClock(seconds: number): string` ("m:ss")
  - `type InterviewerTone = "neutral" | "speaking" | "listening" | "thinking"`; `<InterviewerCard statusText tone />`; `<StarTips />`
  - Exact accessible names used by Task 13's tests: mic button `"Bắt đầu trả lời"`, stop button `"Dừng ghi âm"`, `"Gửi câu trả lời"`, `"Thu lại"`, `"Thử lại"`, `"Bỏ qua câu này"`, `"Nghe lại câu hỏi"`, `"Bỏ qua, trả lời luôn"`, textarea label starting `"Bản chép lời"`.

- [ ] **Step 1: Write failing tests**

`apps/web/src/components/interview/SessionDock.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SessionDock, formatClock } from "./SessionDock";
import { initialInterviewState, type InterviewState } from "@/lib/interviewMachine";

function handlers() {
  return {
    onStart: vi.fn(),
    onStop: vi.fn(),
    onSend: vi.fn(),
    onEditDraft: vi.fn(),
    onRetryTranscribe: vi.fn(),
    onSkip: vi.fn(),
    onSkipSpeech: vi.fn(),
    onReplay: vi.fn(),
    onRetryPlan: vi.fn(),
  };
}

function renderDock(patch: Partial<InterviewState>, elapsed = 0, micError = false) {
  const h = handlers();
  render(<SessionDock state={{ ...initialInterviewState, question: "Q", ...patch }} elapsed={elapsed} micError={micError} {...h} />);
  return h;
}

describe("formatClock", () => {
  it("formats m:ss", () => {
    expect(formatClock(42)).toBe("0:42");
    expect(formatClock(180)).toBe("3:00");
  });
});

describe("SessionDock", () => {
  it("warming: shows the cold-start hint, or a retry after plan failure", () => {
    renderDock({ phase: "warming" });
    expect(screen.getByText(/10–20 giây/)).toBeInTheDocument();
  });

  it("warming + plan_failed: retry", () => {
    const h = renderDock({ phase: "warming", notice: "plan_failed" });
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(h.onRetryPlan).toHaveBeenCalled();
  });

  it("speaking: can skip straight to answering", () => {
    const h = renderDock({ phase: "speaking" });
    fireEvent.click(screen.getByRole("button", { name: "Bỏ qua, trả lời luôn" }));
    expect(h.onSkipSpeech).toHaveBeenCalled();
  });

  it("idle: mic, replay, skip, and notices", () => {
    const h = renderDock({ phase: "idle", notice: "empty_transcript" }, 0, true);
    expect(screen.getByText(/Không nghe thấy gì/)).toBeInTheDocument();
    expect(screen.getByText(/Không dùng được micro/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu trả lời" }));
    fireEvent.click(screen.getByRole("button", { name: "Nghe lại câu hỏi" }));
    fireEvent.click(screen.getByRole("button", { name: "Bỏ qua câu này" }));
    expect(h.onStart).toHaveBeenCalled();
    expect(h.onReplay).toHaveBeenCalled();
    expect(h.onSkip).toHaveBeenCalled();
  });

  it("recording: timer and stop", () => {
    const h = renderDock({ phase: "recording" }, 42);
    expect(screen.getByText("0:42")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dừng ghi âm" }));
    expect(h.onStop).toHaveBeenCalled();
  });

  it("review: edit, send, re-record", () => {
    const h = renderDock({ phase: "review", draft: "My answer" });
    const box = screen.getByLabelText(/Bản chép lời/);
    expect(box).toHaveValue("My answer");
    fireEvent.change(box, { target: { value: "Fixed" } });
    expect(h.onEditDraft).toHaveBeenCalledWith("Fixed");
    fireEvent.click(screen.getByRole("button", { name: "Gửi câu trả lời" }));
    fireEvent.click(screen.getByRole("button", { name: "Thu lại" }));
    expect(h.onSend).toHaveBeenCalled();
    expect(h.onStart).toHaveBeenCalled();
  });

  it("review: send disabled for an empty draft", () => {
    renderDock({ phase: "review", draft: "  " });
    expect(screen.getByRole("button", { name: "Gửi câu trả lời" })).toBeDisabled();
  });

  it("sttError: retry keeps the recording", () => {
    const h = renderDock({ phase: "sttError" });
    expect(screen.getByRole("alert")).toHaveTextContent("Chép lời thất bại");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(h.onRetryTranscribe).toHaveBeenCalled();
  });

  it("transcribing / processing / closing show status text", () => {
    const { unmount } = render(<SessionDock state={{ ...initialInterviewState, phase: "transcribing" }} elapsed={0} micError={false} {...handlers()} />);
    expect(screen.getByText("Đang chép lời…")).toBeInTheDocument();
    unmount();
    renderDock({ phase: "processing" });
    expect(screen.getByText("Người phỏng vấn đang suy nghĩ…")).toBeInTheDocument();
  });
});
```

`apps/web/src/components/interview/SessionThread.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SessionThread } from "./SessionThread";
import type { InterviewTurn } from "@/lib/interviewTypes";

const TURNS: InterviewTurn[] = [
  { mainIndex: 0, kind: "main", question: "Intro?", answer: "I am Tung.", skipped: false, answerSeconds: 5 },
  { mainIndex: 1, kind: "main", question: "Conflict?", answer: "", skipped: true, answerSeconds: 0 },
];

describe("SessionThread", () => {
  it("renders past turns, a skipped marker, and the current question", () => {
    const onReplay = vi.fn();
    const onTranslate = vi.fn();
    render(
      <SessionThread
        turns={TURNS}
        question="Project?"
        kind="main"
        showQuestion
        translation="Dự án?"
        translating={false}
        onReplay={onReplay}
        onTranslate={onTranslate}
        replayDisabled={false}
      />
    );
    expect(screen.getByText("I am Tung.")).toBeInTheDocument();
    expect(screen.getByText("(Đã bỏ qua)")).toBeInTheDocument();
    expect(screen.getByText("Câu hỏi hiện tại")).toBeInTheDocument();
    expect(screen.getByText("Project?")).toBeInTheDocument();
    expect(screen.getByText("Dự án?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nghe lại" }));
    fireEvent.click(screen.getByRole("button", { name: "Dịch sang tiếng Việt" }));
    expect(onReplay).toHaveBeenCalled();
    expect(onTranslate).toHaveBeenCalled();
  });

  it("labels a follow-up and hides the question card when showQuestion is false", () => {
    const props = { turns: [], question: "Why?", translation: null, translating: false, onReplay: vi.fn(), onTranslate: vi.fn(), replayDisabled: true };
    const { rerender } = render(<SessionThread {...props} kind="follow_up" showQuestion />);
    expect(screen.getByText("Câu hỏi thêm")).toBeInTheDocument();
    rerender(<SessionThread {...props} kind="follow_up" showQuestion={false} />);
    expect(screen.queryByText("Why?")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd apps/web && npx vitest run src/components/interview/SessionDock.test.tsx src/components/interview/SessionThread.test.tsx`

- [ ] **Step 3: Implement `SessionDock.tsx`**

```tsx
import type { InterviewState } from "@/lib/interviewMachine";
import { MAX_ANSWER_SECONDS } from "@/lib/interviewTypes";

export function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export interface SessionDockProps {
  state: InterviewState;
  elapsed: number;
  micError: boolean;
  onStart(): void;
  onStop(): void;
  onSend(): void;
  onEditDraft(text: string): void;
  onRetryTranscribe(): void;
  onSkip(): void;
  onSkipSpeech(): void;
  onReplay(): void;
  onRetryPlan(): void;
}

const NOTICE_TEXT = {
  empty_transcript: "Không nghe thấy gì — thử nói gần micro hơn.",
  tts_failed: "Không phát được âm thanh — đọc câu hỏi ở trên hoặc bấm Nghe lại.",
} as const;

export function SessionDock(props: SessionDockProps) {
  const { state, elapsed, micError } = props;
  return (
    <footer className="iv-dock">
      {state.phase === "warming" &&
        (state.notice === "plan_failed" ? (
          <div className="iv-dock-row">
            <p className="iv-error" role="alert">Không tạo được câu hỏi phỏng vấn.</p>
            <button type="button" className="btn-primary" onClick={props.onRetryPlan}>Thử lại</button>
          </div>
        ) : (
          <div className="iv-dock-status" role="status">
            <strong>Đang chuẩn bị người phỏng vấn…</strong>
            <span className="iv-muted">Lần đầu trong ngày có thể mất 10–20 giây.</span>
          </div>
        ))}

      {state.phase === "speaking" && (
        <div className="iv-dock-row">
          <div className="iv-dock-status" role="status">
            <strong>Người phỏng vấn đang hỏi…</strong>
            <span className="iv-muted">Nghe xong thì bấm micro để trả lời.</span>
          </div>
          <button type="button" className="btn-secondary" onClick={props.onSkipSpeech}>Bỏ qua, trả lời luôn</button>
        </div>
      )}

      {state.phase === "idle" && (
        <div className="iv-dock-col">
          {state.notice && state.notice !== "plan_failed" && <p className="iv-warn">{NOTICE_TEXT[state.notice]}</p>}
          {micError && <p className="iv-error" role="alert">Không dùng được micro — kiểm tra quyền micro của trình duyệt.</p>}
          <div className="iv-dock-row">
            <button type="button" className="btn-secondary" onClick={props.onReplay}>Nghe lại câu hỏi</button>
            <div className="iv-mic-wrap">
              <button type="button" className="iv-mic" aria-label="Bắt đầu trả lời" onClick={props.onStart}>🎤</button>
              <span className="iv-muted">Bấm để trả lời</span>
            </div>
            <button type="button" className="btn-secondary" onClick={props.onSkip}>Bỏ qua câu này</button>
          </div>
        </div>
      )}

      {state.phase === "recording" && (
        <div className="iv-dock-row">
          <div className="iv-clock">
            <strong>{formatClock(elapsed)}</strong>
            <span className="iv-muted">{`tối đa ${formatClock(MAX_ANSWER_SECONDS)}`}</span>
          </div>
          <div className="iv-mic-wrap">
            <button type="button" className="iv-mic iv-mic-rec" aria-label="Dừng ghi âm" onClick={props.onStop}>■</button>
            <span className="iv-rec-text">Đang nghe bạn nói… bấm để dừng</span>
          </div>
          <span className="iv-clock" aria-hidden="true" />
        </div>
      )}

      {state.phase === "transcribing" && <p className="iv-dock-status" role="status">Đang chép lời…</p>}

      {state.phase === "sttError" && (
        <div className="iv-dock-col">
          <p className="iv-error" role="alert">Chép lời thất bại. Bản ghi của bạn vẫn còn.</p>
          <div className="iv-dock-row">
            <button type="button" className="btn-primary" onClick={props.onRetryTranscribe}>Thử lại</button>
            <button type="button" className="btn-secondary" onClick={props.onStart}>Thu lại</button>
            <button type="button" className="btn-secondary" onClick={props.onSkip}>Bỏ qua câu này</button>
          </div>
        </div>
      )}

      {state.phase === "review" && (
        <div className="iv-dock-review">
          <div className="iv-field iv-grow">
            <label htmlFor="iv-draft" className="iv-label">
              Bản chép lời — sửa chỗ máy nghe nhầm, <span className="iv-warn-text">đừng sửa lỗi ngữ pháp của chính bạn</span>
            </label>
            <textarea id="iv-draft" className="iv-input" rows={3} value={state.draft} onChange={(e) => props.onEditDraft(e.target.value)} />
          </div>
          <div className="iv-dock-actions">
            <button type="button" className="btn-primary" disabled={!state.draft.trim()} onClick={props.onSend}>Gửi câu trả lời</button>
            <button type="button" className="btn-secondary" onClick={props.onStart}>Thu lại</button>
            <button type="button" className="btn-secondary" onClick={props.onSkip}>Bỏ qua câu này</button>
          </div>
        </div>
      )}

      {state.phase === "processing" && <p className="iv-dock-status" role="status">Người phỏng vấn đang suy nghĩ…</p>}
      {state.phase === "closing" && <p className="iv-dock-status" role="status">Người phỏng vấn đang kết thúc buổi…</p>}
      {state.phase === "grading" && <p className="iv-dock-status" role="status">Đang chấm bài…</p>}
    </footer>
  );
}
```

- [ ] **Step 4: Implement `SessionThread.tsx`, `InterviewerCard.tsx`, `StarTips.tsx`**

`SessionThread.tsx`:

```tsx
import type { InterviewTurn } from "@/lib/interviewTypes";

export interface SessionThreadProps {
  turns: InterviewTurn[];
  question: string;
  kind: "main" | "follow_up";
  showQuestion: boolean;
  translation: string | null;
  translating: boolean;
  onReplay(): void;
  onTranslate(): void;
  replayDisabled: boolean;
}

export function SessionThread(props: SessionThreadProps) {
  return (
    <section className="iv-thread" aria-label="Hội thoại">
      {props.turns.map((t, i) => (
        <div key={i} className="iv-exchange">
          <div className="iv-bubble iv-bubble-ai">
            <span className="iv-avatar" aria-hidden="true">AI</span>
            <p>{t.question}</p>
          </div>
          <p className="iv-bubble iv-bubble-me">{t.skipped ? "(Đã bỏ qua)" : t.answer}</p>
        </div>
      ))}
      {props.showQuestion && (
        <div className="iv-bubble iv-bubble-ai">
          <span className="iv-avatar" aria-hidden="true">AI</span>
          <div className="iv-current">
            <span className="iv-current-label">{props.kind === "main" ? "Câu hỏi hiện tại" : "Câu hỏi thêm"}</span>
            <p className="iv-current-text">{props.question}</p>
            {props.translation && <p className="iv-muted">{props.translation}</p>}
            <div className="iv-row">
              <button type="button" className="btn-secondary" disabled={props.replayDisabled} onClick={props.onReplay}>Nghe lại</button>
              <button type="button" className="btn-secondary" disabled={props.translating} onClick={props.onTranslate}>Dịch sang tiếng Việt</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
```

`InterviewerCard.tsx`:

```tsx
export type InterviewerTone = "neutral" | "speaking" | "listening" | "thinking";

export function InterviewerCard({ statusText, tone }: { statusText: string; tone: InterviewerTone }) {
  return (
    <section className="iv-card iv-interviewer" aria-label="Người phỏng vấn">
      <span className="iv-avatar iv-avatar-lg" aria-hidden="true">AI</span>
      <div>
        <strong>Người phỏng vấn</strong>
        <p className={`iv-status iv-status-${tone}`}>{statusText}</p>
      </div>
    </section>
  );
}
```

`StarTips.tsx`:

```tsx
const TIPS = [
  ["S", "Situation", "bối cảnh, ngắn gọn"],
  ["T", "Task", "bạn chịu trách nhiệm gì"],
  ["A", "Action", "việc chính bạn làm, dùng “I”"],
  ["R", "Result", "kết quả, có số liệu càng tốt"],
] as const;

export function StarTips() {
  return (
    <section className="iv-card" aria-label="Gợi ý STAR">
      <h3 className="iv-card-title">Gợi ý trả lời theo STAR</h3>
      {TIPS.map(([letter, word, hint]) => (
        <p key={letter} className="iv-star">
          <span className="iv-star-letter">{letter}</span>
          <span><b>{word}</b> — {hint}</span>
        </p>
      ))}
    </section>
  );
}
```

- [ ] **Step 5: Append Session CSS to `bloom.css`**

```css
.iv-session { display: flex; flex-direction: column; gap: 18px; min-height: calc(100vh - 64px); }
.iv-session-head { display: flex; align-items: center; gap: 20px; }
.iv-session-title { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.iv-progress { display: flex; gap: 6px; }
.iv-progress span { width: 8px; height: 8px; border-radius: 999px; background: var(--border); }
.iv-progress span.done { background: var(--sage); }
.iv-progress span.current { width: 22px; background: var(--accent); }
.iv-session-body { flex: 1; display: flex; gap: 22px; align-items: flex-start; }
.iv-session-side { width: 320px; flex-shrink: 0; display: flex; flex-direction: column; gap: 14px; }
.iv-note { margin: 0; padding: 12px 14px; border-radius: 14px; background: var(--amber-bg); font-size: 14.5px; }
.iv-thread { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
.iv-exchange { display: flex; flex-direction: column; gap: 10px; }
.iv-bubble { display: flex; gap: 10px; align-items: flex-start; margin: 0; }
.iv-bubble p { margin: 0; }
.iv-bubble-ai > p, .iv-current { background: var(--surface); border: 1px solid var(--border); border-radius: 4px 18px 18px 18px; padding: 12px 16px; }
.iv-bubble-me { align-self: flex-end; max-width: 80%; background: var(--surface-3); border-radius: 18px 4px 18px 18px; padding: 12px 16px; }
.iv-current { border: 2px solid var(--accent); display: flex; flex-direction: column; gap: 10px; }
.iv-current-label { font-size: 12.5px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent); }
.iv-current-text { font-size: 19px; font-weight: 600; }
.iv-avatar { width: 36px; height: 36px; flex-shrink: 0; border-radius: 999px; background: var(--sage-bg); color: var(--success); font-weight: 800; font-size: 13px; display: flex; align-items: center; justify-content: center; }
.iv-avatar-lg { width: 52px; height: 52px; font-size: 17px; }
.iv-interviewer { flex-direction: row; align-items: center; }
.iv-status { margin: 2px 0 0; font-size: 14px; font-weight: 600; color: var(--ink-soft); }
.iv-status-speaking { color: var(--success); }
.iv-status-listening { color: var(--danger); }
.iv-status-thinking { color: var(--accent); }
.iv-star { margin: 0; display: flex; gap: 10px; font-size: 14.5px; }
.iv-star-letter { width: 24px; height: 24px; flex-shrink: 0; border-radius: 8px; background: var(--surface-3); color: var(--accent); font-weight: 800; display: flex; align-items: center; justify-content: center; }
.iv-dock { position: sticky; bottom: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 24px; padding: 18px 24px; min-height: 120px; display: flex; align-items: center; justify-content: center; }
.iv-dock-row { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.iv-dock-col { width: 100%; display: flex; flex-direction: column; gap: 10px; }
.iv-dock-status { display: flex; flex-direction: column; align-items: center; gap: 4px; margin: 0; font-weight: 600; }
.iv-dock-review { width: 100%; display: flex; gap: 18px; align-items: flex-end; flex-wrap: wrap; }
.iv-dock-actions { display: flex; flex-direction: column; gap: 8px; }
.iv-mic-wrap { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.iv-mic { width: 80px; height: 80px; border-radius: 999px; border: 0; background: var(--accent); color: var(--accent-ink); font-size: 30px; cursor: pointer; }
.iv-mic-rec { background: var(--danger); animation: iv-pulse 1.4s ease-out infinite; }
@keyframes iv-pulse { 0% { box-shadow: 0 0 0 0 rgba(193, 91, 78, 0.45); } 100% { box-shadow: 0 0 0 20px rgba(193, 91, 78, 0); } }
.iv-rec-text { color: var(--danger); font-weight: 600; font-size: 14.5px; }
.iv-clock { width: 150px; display: flex; flex-direction: column; font-variant-numeric: tabular-nums; }
.iv-clock strong { font-size: 26px; color: var(--danger); }
.iv-warn { margin: 0; color: var(--amber); font-weight: 600; }
.iv-warn-text { color: var(--danger); }
.iv-grading { padding-top: 60px; text-align: center; }
@media (max-width: 980px) {
  .iv-session-body { flex-direction: column; }
  .iv-session-side { width: 100%; }
}
```

- [ ] **Step 6: Run — PASS**

Run: `cd apps/web && npx vitest run src/components/interview src/styles && npm run typecheck`

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/interview apps/web/src/styles/bloom.css
git commit -m "feat(web): interview session components

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Session page `/interview/[id]`

**Files:**
- Create: `apps/web/src/app/(app)/interview/[id]/page.tsx`, `page.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2–9 and 12 (names exactly as declared there).
- Produces: route `/interview/{id}`. On completion navigates to `/interview/{id}/report`; when nothing was answered it deletes the session and navigates to `/interview`.

Behavior summary (spec §4, §8):
- Loads the session; `completed` → `router.replace` to the report; missing → "Không tìm thấy".
- `warming`: if `plan` is empty, speak the greeting while generating + saving the plan, then `PLAN_READY`; if `plan` exists (reload), `PLAN_READY` with `startIndex = resumeIndex(turns)`.
- `speaking`: main questions via `playPrefetched("main-{i}")`, follow-ups via `speak`; then `SPEECH_ENDED` (with `ttsFailed`).
- `idle` on any question: prefetch main question *i+1*.
- `transcribing`: `transcribeAudio(blob)`; failure → `TRANSCRIBE_FAILED` (blob kept in a ref).
- `processing`: append + persist the turn; if a follow-up is still allowed, ask `nextTurn`; `follow_up` → `FOLLOW_UP`; `next` → speak ack then `NEXT_MAIN`; any error → `NEXT_MAIN`.
- `closing`: speak closing line → `CLOSING_ENDED`. `grading`: report → `completeInterviewSession` (null on failure) → navigate.
- Effects are driven by `state` identity; `handledRef` guarantees each state is handled once (also under React StrictMode's double effect run).
- "Kết thúc buổi" in `review` first saves the current draft as a turn so it is not lost.

- [ ] **Step 1: Write failing tests**

`apps/web/src/app/(app)/interview/[id]/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import InterviewSessionPage from "./page";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import {
  completeInterviewSession,
  deleteInterviewSession,
  getInterviewSession,
  saveInterviewPlan,
  saveInterviewTurns,
} from "@/lib/interviewSessions";
import { callInterviewAi } from "@/lib/interviewAi";
import { transcribeAudio } from "@/lib/transcribeAudioClient";
import { DEFAULT_SETTINGS, type UserSettings } from "@/lib/settings";
import type { InterviewSession } from "@/lib/interviewTypes";

const pushMock = vi.fn();
const replaceMock = vi.fn();
const ROUTER = { push: pushMock, replace: replaceMock };
vi.mock("next/navigation", () => ({ useRouter: () => ROUTER }));
vi.mock("@/lib/useAuthUser", () => ({ useAuthUser: vi.fn() }));
vi.mock("@/lib/SettingsContext", () => ({ useSettingsContext: vi.fn() }));
vi.mock("@/lib/interviewSessions", () => ({
  getInterviewSession: vi.fn(),
  saveInterviewPlan: vi.fn(),
  saveInterviewTurns: vi.fn(),
  completeInterviewSession: vi.fn(),
  deleteInterviewSession: vi.fn(),
}));
vi.mock("@/lib/interviewAi", () => ({ callInterviewAi: vi.fn(), hasAiKey: () => true }));
vi.mock("@/lib/transcribeAudioClient", () => ({ transcribeAudio: vi.fn() }));
vi.mock("@/lib/warmUpSpeechClient", () => ({ warmUpSpeech: vi.fn() }));
const AUDIO = {
  speak: vi.fn().mockResolvedValue(true),
  prefetch: vi.fn(),
  playPrefetched: vi.fn().mockResolvedValue(true),
  stop: vi.fn(),
};
vi.mock("@/lib/useInterviewAudio", () => ({ useInterviewAudio: () => AUDIO }));
const RECORDER = {
  recording: false,
  elapsed: 0,
  error: null,
  start: vi.fn().mockResolvedValue(true),
  stop: vi.fn().mockResolvedValue({ blob: new Blob(["a"]), seconds: 5 }),
  cancel: vi.fn(),
};
vi.mock("@/lib/useRecorder", () => ({ useRecorder: () => RECORDER }));
vi.mock("@/components/SignInButton", () => ({ SignInButton: () => <button>Đăng nhập với Google</button> }));

const SETTINGS: UserSettings = {
  ...DEFAULT_SETTINGS,
  providers: { ...DEFAULT_SETTINGS.providers, gemini: { ...DEFAULT_SETTINGS.providers.gemini, apiKeyCiphertext: "c" } },
};
const PLAN = ["Q1?", "Q2?", "Q3?", "Q4?", "Q5?"];

function makeSession(patch: Partial<InterviewSession> = {}): InterviewSession {
  return {
    id: "s1",
    createdAt: "2026-09-27T00:00:00.000Z",
    status: "in_progress",
    setup: { role: "SE", level: "junior", type: "behavioral", questionCount: 5, voice: "male2", jd: "", cvSummary: null, reviewTranscript: true },
    plan: [],
    turns: [],
    report: null,
    reportError: false,
    ...patch,
  };
}

const REPORT_JSON = JSON.stringify({
  overall: 7,
  criteria: { content: 7, structure: 7, grammar: 7, vocabulary: 7, fluency: 7 },
  criteriaNotes: {},
  improvements: [],
  questions: [{ mainIndex: 0, score: 7, corrected: "a", strengths: "", gaps: "", modelAnswer: "", phrases: [] }],
});

let nextTurnReply = '{"action":"next","ack":"Thanks."}';

function renderPage(session: InterviewSession) {
  vi.mocked(getInterviewSession).mockResolvedValue(session);
  render(<InterviewSessionPage params={Promise.resolve({ id: "s1" })} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  AUDIO.speak.mockResolvedValue(true);
  AUDIO.playPrefetched.mockResolvedValue(true);
  RECORDER.start.mockResolvedValue(true);
  RECORDER.stop.mockResolvedValue({ blob: new Blob(["a"]), seconds: 5 });
  nextTurnReply = '{"action":"next","ack":"Thanks."}';
  vi.mocked(useAuthUser).mockReturnValue({ user: { uid: "u1" }, loading: false } as never);
  vi.mocked(useSettingsContext).mockReturnValue({ settings: SETTINGS, loading: false, error: null, save: vi.fn() });
  vi.mocked(saveInterviewPlan).mockResolvedValue(undefined);
  vi.mocked(saveInterviewTurns).mockResolvedValue(undefined);
  vi.mocked(completeInterviewSession).mockResolvedValue(undefined);
  vi.mocked(deleteInterviewSession).mockResolvedValue(undefined);
  vi.mocked(transcribeAudio).mockResolvedValue("My answer");
  vi.mocked(callInterviewAi).mockImplementation(async (_s, prompt: string) => {
    if (prompt.includes("Write exactly")) return JSON.stringify({ questions: PLAN });
    if (prompt.includes("Decide ONE of")) return nextTurnReply;
    if (prompt.includes("expert English interview coach")) return REPORT_JSON;
    throw new Error("unexpected prompt");
  });
});

async function answerCurrentQuestion() {
  fireEvent.click(await screen.findByRole("button", { name: "Bắt đầu trả lời" }));
  fireEvent.click(await screen.findByRole("button", { name: "Dừng ghi âm" }));
  expect(await screen.findByLabelText(/Bản chép lời/)).toHaveValue("My answer");
  fireEvent.click(screen.getByRole("button", { name: "Gửi câu trả lời" }));
}

describe("InterviewSessionPage", () => {
  it("generates and saves the plan, greets, then asks Q1", async () => {
    renderPage(makeSession());
    expect(await screen.findByText("Q1?")).toBeInTheDocument();
    expect(saveInterviewPlan).toHaveBeenCalledWith("u1", "s1", PLAN);
    expect(AUDIO.speak).toHaveBeenCalledWith(expect.stringContaining("Let's get started"));
    expect(AUDIO.playPrefetched).toHaveBeenCalledWith("main-0", "Q1?");
  });

  it("prefetches the next main question while waiting for an answer", async () => {
    renderPage(makeSession({ plan: PLAN }));
    await screen.findByRole("button", { name: "Bắt đầu trả lời" });
    expect(AUDIO.prefetch).toHaveBeenCalledWith("main-1", "Q2?");
  });

  it("runs a full turn: record, review, send, acknowledge, next question", async () => {
    renderPage(makeSession({ plan: PLAN }));
    await answerCurrentQuestion();
    expect(await screen.findByText("Q2?")).toBeInTheDocument();
    expect(saveInterviewTurns).toHaveBeenCalledWith("u1", "s1", [
      expect.objectContaining({ mainIndex: 0, kind: "main", question: "Q1?", answer: "My answer", answerSeconds: 5 }),
    ]);
    expect(AUDIO.speak).toHaveBeenCalledWith("Thanks.");
  });

  it("asks a follow-up when the AI decides to", async () => {
    nextTurnReply = '{"action":"follow_up","say":"Why did you choose that?"}';
    renderPage(makeSession({ plan: PLAN }));
    await answerCurrentQuestion();
    expect(await screen.findByText("Why did you choose that?")).toBeInTheDocument();
    expect(screen.getByText("Câu hỏi thêm")).toBeInTheDocument();
  });

  it("moves on when nextTurn fails", async () => {
    nextTurnReply = "not json";
    renderPage(makeSession({ plan: PLAN }));
    await answerCurrentQuestion();
    expect(await screen.findByText("Q2?")).toBeInTheDocument();
  });

  it("keeps the recording and offers retry when STT fails", async () => {
    vi.mocked(transcribeAudio).mockRejectedValueOnce(new Error("503"));
    renderPage(makeSession({ plan: PLAN }));
    fireEvent.click(await screen.findByRole("button", { name: "Bắt đầu trả lời" }));
    fireEvent.click(await screen.findByRole("button", { name: "Dừng ghi âm" }));
    fireEvent.click(await screen.findByRole("button", { name: "Thử lại" }));
    expect(await screen.findByLabelText(/Bản chép lời/)).toHaveValue("My answer");
    expect(transcribeAudio).toHaveBeenCalledTimes(2);
  });

  it("resumes an interrupted session at the next main question", async () => {
    renderPage(makeSession({ plan: PLAN, turns: [{ mainIndex: 0, kind: "main", question: "Q1?", answer: "a", skipped: false, answerSeconds: 3 }] }));
    expect(await screen.findByText("Q2?")).toBeInTheDocument();
  });

  it("ending early grades answered turns and opens the report", async () => {
    renderPage(makeSession({ plan: PLAN, turns: [{ mainIndex: 0, kind: "main", question: "Q1?", answer: "a", skipped: false, answerSeconds: 3 }] }));
    await screen.findByText("Q2?");
    fireEvent.click(screen.getByRole("button", { name: "Kết thúc buổi" }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/interview/s1/report"));
    expect(completeInterviewSession).toHaveBeenCalledWith("u1", "s1", expect.objectContaining({ overall: 7 }));
  });

  it("ending with nothing answered deletes the session", async () => {
    renderPage(makeSession({ plan: PLAN }));
    await screen.findByText("Q1?");
    fireEvent.click(screen.getByRole("button", { name: "Kết thúc buổi" }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/interview"));
    expect(deleteInterviewSession).toHaveBeenCalledWith("u1", "s1");
  });

  it("saves a null report when grading fails", async () => {
    vi.mocked(callInterviewAi).mockImplementation(async (_s, prompt: string) => {
      if (prompt.includes("expert English interview coach")) throw new Error("quota");
      return JSON.stringify({ questions: PLAN });
    });
    renderPage(makeSession({ plan: PLAN, turns: [{ mainIndex: 0, kind: "main", question: "Q1?", answer: "a", skipped: false, answerSeconds: 3 }] }));
    await screen.findByText("Q2?");
    fireEvent.click(screen.getByRole("button", { name: "Kết thúc buổi" }));
    await waitFor(() => expect(completeInterviewSession).toHaveBeenCalledWith("u1", "s1", null));
  });

  it("redirects a completed session to its report", async () => {
    renderPage(makeSession({ status: "completed", plan: PLAN }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/interview/s1/report"));
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd apps/web && npx vitest run "src/app/(app)/interview/[id]/page.test.tsx"`

- [ ] **Step 3: Implement the page**

`apps/web/src/app/(app)/interview/[id]/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { useRouteParams } from "@/lib/useRouteParams";
import { SignInButton } from "@/components/SignInButton";
import { callInterviewAi } from "@/lib/interviewAi";
import {
  buildNextTurnPrompt,
  buildQuestionPlanPrompt,
  buildTranslatePrompt,
  parseNextTurn,
  parseQuestionPlan,
  parseTranslation,
} from "@/lib/interviewPrompts";
import { answeredMainIndexes, buildReportPrompt, parseReport } from "@/lib/interviewReportPrompt";
import {
  completeInterviewSession,
  deleteInterviewSession,
  getInterviewSession,
  saveInterviewPlan,
  saveInterviewTurns,
} from "@/lib/interviewSessions";
import {
  canFollowUp,
  initialInterviewState,
  interviewReducer,
  resumeIndex,
  type InterviewState,
} from "@/lib/interviewMachine";
import { useInterviewAudio } from "@/lib/useInterviewAudio";
import { useRecorder, type RecordedAudio } from "@/lib/useRecorder";
import { transcribeAudio } from "@/lib/transcribeAudioClient";
import { warmUpSpeech } from "@/lib/warmUpSpeechClient";
import {
  INTERVIEW_CLOSING,
  INTERVIEW_GREETING,
  INTERVIEW_LEVELS,
  INTERVIEW_TYPES,
  MAX_ANSWER_SECONDS,
  type InterviewReport,
  type InterviewSession,
  type InterviewTurn,
} from "@/lib/interviewTypes";
import { SessionThread } from "@/components/interview/SessionThread";
import { SessionDock } from "@/components/interview/SessionDock";
import { InterviewerCard, type InterviewerTone } from "@/components/interview/InterviewerCard";
import { StarTips } from "@/components/interview/StarTips";

const QUESTION_VISIBLE = new Set<InterviewState["phase"]>(["speaking", "idle", "recording", "transcribing", "sttError", "review"]);

function interviewerStatus(state: InterviewState): { text: string; tone: InterviewerTone } {
  switch (state.phase) {
    case "speaking":
    case "closing":
      return { text: "Đang nói", tone: "speaking" };
    case "recording":
      return { text: "Đang lắng nghe", tone: "listening" };
    case "warming":
      return { text: "Đang khởi động", tone: "thinking" };
    case "transcribing":
    case "processing":
    case "grading":
      return { text: "Đang suy nghĩ", tone: "thinking" };
    default:
      return { text: "Đang chờ bạn trả lời", tone: "neutral" };
  }
}

export default function InterviewSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const resolved = useRouteParams(params);
  const id = resolved?.id ?? null;
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();
  const { settings } = useSettingsContext();
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [missing, setMissing] = useState(false);
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [translation, setTranslation] = useState<{ question: string; vi: string } | null>(null);
  const [translating, setTranslating] = useState(false);
  const [state, dispatch] = useReducer(interviewReducer, initialInterviewState);
  const turnsRef = useRef<InterviewTurn[]>([]);
  const recordingRef = useRef<RecordedAudio | null>(null);
  const handledRef = useRef<InterviewState | null>(null);
  const audio = useInterviewAudio(session?.setup.voice ?? "male2");
  const { start: startRecorder, stop: stopRecorder, cancel: cancelRecorder, elapsed, error: micError } = useRecorder();

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    void warmUpSpeech();
    getInterviewSession(user.uid, id)
      .then((s) => {
        if (cancelled) return;
        if (!s) {
          setMissing(true);
        } else if (s.status === "completed") {
          router.replace(`/interview/${id}/report`);
        } else {
          turnsRef.current = s.turns;
          setTurns(s.turns);
          setSession(s);
        }
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, id, router]);

  const appendTurn = useCallback(
    (turn: InterviewTurn) => {
      const next = [...turnsRef.current, turn];
      turnsRef.current = next;
      setTurns(next);
      if (user && id) void saveInterviewTurns(user.uid, id, next).catch(() => {});
    },
    [user, id]
  );

  // One side effect per state transition. handledRef makes this idempotent
  // under StrictMode's double effect run and when unrelated deps change.
  useEffect(() => {
    if (!session || !settings || !user || !id) return;
    if (handledRef.current === state) return;
    handledRef.current = state;
    const uid = user.uid;

    switch (state.phase) {
      case "warming": {
        if (state.notice) return;
        if (session.plan.length > 0) {
          dispatch({ type: "PLAN_READY", plan: session.plan, startIndex: resumeIndex(turnsRef.current) });
          return;
        }
        void (async () => {
          const greeting = audio.speak(INTERVIEW_GREETING);
          try {
            const raw = await callInterviewAi(settings, buildQuestionPlanPrompt(session.setup));
            const plan = parseQuestionPlan(raw, session.setup.questionCount);
            await saveInterviewPlan(uid, id, plan);
            setSession((s) => (s ? { ...s, plan } : s));
            await greeting;
            dispatch({ type: "PLAN_READY", plan });
          } catch {
            dispatch({ type: "PLAN_FAILED" });
          }
        })();
        return;
      }
      case "speaking": {
        void (async () => {
          const ok =
            state.kind === "main"
              ? await audio.playPrefetched(`main-${state.mainIndex}`, state.question)
              : await audio.speak(state.question);
          dispatch({ type: "SPEECH_ENDED", ttsFailed: !ok });
        })();
        return;
      }
      case "idle": {
        const next = state.plan[state.mainIndex + 1];
        if (next) audio.prefetch(`main-${state.mainIndex + 1}`, next);
        return;
      }
      case "transcribing": {
        const review = session.setup.reviewTranscript;
        void (async () => {
          const rec = recordingRef.current;
          if (!rec) {
            dispatch({ type: "TRANSCRIBED", text: "", review });
            return;
          }
          try {
            dispatch({ type: "TRANSCRIBED", text: await transcribeAudio(rec.blob), review });
          } catch {
            dispatch({ type: "TRANSCRIBE_FAILED" });
          }
        })();
        return;
      }
      case "processing": {
        appendTurn({
          mainIndex: state.mainIndex,
          kind: state.kind,
          question: state.question,
          answer: state.draft.trim(),
          skipped: false,
          answerSeconds: recordingRef.current?.seconds ?? 0,
        });
        recordingRef.current = null;
        if (!canFollowUp(state)) {
          dispatch({ type: "NEXT_MAIN" });
          return;
        }
        void (async () => {
          try {
            const exchanges = turnsRef.current
              .filter((t) => t.mainIndex === state.mainIndex && !t.skipped)
              .map((t) => ({ question: t.question, answer: t.answer }));
            const raw = await callInterviewAi(
              settings,
              buildNextTurnPrompt({
                setup: session.setup,
                mainQuestion: state.plan[state.mainIndex],
                exchanges,
                nextMainQuestion: state.plan[state.mainIndex + 1] ?? null,
              })
            );
            const decision = parseNextTurn(raw);
            if (decision.action === "follow_up") {
              dispatch({ type: "FOLLOW_UP", question: decision.say });
              return;
            }
            if (decision.ack) await audio.speak(decision.ack);
          } catch {
            // Spec §8: a failed next-turn decision never blocks the interview.
          }
          dispatch({ type: "NEXT_MAIN" });
        })();
        return;
      }
      case "closing": {
        void audio.speak(INTERVIEW_CLOSING).then(() => dispatch({ type: "CLOSING_ENDED" }));
        return;
      }
      case "grading": {
        void (async () => {
          const finalTurns = turnsRef.current;
          const answered = answeredMainIndexes(finalTurns);
          if (answered.length === 0) {
            await deleteInterviewSession(uid, id).catch(() => {});
            router.push("/interview");
            return;
          }
          let report: InterviewReport | null = null;
          try {
            report = parseReport(
              await callInterviewAi(settings, buildReportPrompt(session.setup, state.plan, finalTurns)),
              answered
            );
          } catch {
            report = null;
          }
          await saveInterviewTurns(uid, id, finalTurns).catch(() => {});
          await completeInterviewSession(uid, id, report).catch(() => {});
          router.push(`/interview/${id}/report`);
        })();
        return;
      }
      default:
        return;
    }
  }, [state, session, settings, user, id, audio, appendTurn, router]);

  const handleStop = useCallback(async () => {
    const rec = await stopRecorder();
    if (!rec) return;
    recordingRef.current = rec;
    dispatch({ type: "STOP_RECORDING" });
  }, [stopRecorder]);

  useEffect(() => {
    if (state.phase === "recording" && elapsed >= MAX_ANSWER_SECONDS) void handleStop();
  }, [state.phase, elapsed, handleStop]);

  if (authLoading || (user && !resolved)) return <p>Đang tải…</p>;
  if (!user) {
    return (
      <div>
        <h2 className="scr-title">Phỏng vấn tiếng Anh</h2>
        <p className="scr-sub">Đăng nhập để tiếp tục.</p>
        <SignInButton />
      </div>
    );
  }
  if (missing) {
    return (
      <div>
        <h2 className="scr-title">Không tìm thấy buổi phỏng vấn</h2>
        <button type="button" className="btn-secondary" onClick={() => router.push("/interview")}>Về trang Phỏng vấn</button>
      </div>
    );
  }
  if (!session) return <p>Đang tải…</p>;
  if (state.phase === "grading") {
    return (
      <div className="iv-grading" role="status">
        <h2 className="scr-title">Đang chấm bài…</h2>
        <p className="scr-sub">AI đang đọc lại các câu trả lời của bạn. Thường mất 10–30 giây.</p>
      </div>
    );
  }

  async function handleStart() {
    audio.stop();
    if (await startRecorder()) dispatch({ type: "START_RECORDING" });
  }

  function handleSkipSpeech() {
    dispatch({ type: "SPEECH_ENDED" });
    audio.stop();
  }

  function handleSkip() {
    audio.stop();
    cancelRecorder();
    recordingRef.current = null;
    appendTurn({ mainIndex: state.mainIndex, kind: state.kind, question: state.question, answer: "", skipped: true, answerSeconds: 0 });
    dispatch({ type: "SKIP" });
  }

  function handleEnd() {
    audio.stop();
    cancelRecorder();
    if (state.phase === "review" && state.draft.trim()) {
      appendTurn({
        mainIndex: state.mainIndex,
        kind: state.kind,
        question: state.question,
        answer: state.draft.trim(),
        skipped: false,
        answerSeconds: recordingRef.current?.seconds ?? 0,
      });
    }
    dispatch({ type: "END_EARLY" });
  }

  async function handleTranslate() {
    if (!settings) return;
    const question = state.question;
    setTranslating(true);
    try {
      setTranslation({ question, vi: parseTranslation(await callInterviewAi(settings, buildTranslatePrompt(question))) });
    } catch {
      setTranslation({ question, vi: "Không dịch được — thử lại sau." });
    }
    setTranslating(false);
  }

  const typeLabel = INTERVIEW_TYPES.find((t) => t.id === session.setup.type)?.label ?? session.setup.type;
  const levelLabel = INTERVIEW_LEVELS.find((l) => l.id === session.setup.level)?.label ?? session.setup.level;
  const total = state.plan.length || session.setup.questionCount;
  const status = interviewerStatus(state);

  return (
    <div className="iv-session">
      <header className="iv-session-head">
        <button type="button" className="btn-secondary" onClick={handleEnd}>Kết thúc buổi</button>
        <div className="iv-session-title">
          <strong>{`${session.setup.role} · ${typeLabel} · ${levelLabel}`}</strong>
          <span className="iv-muted">{`Câu ${Math.min(state.mainIndex + 1, total)} / ${total}`}</span>
          <div className="iv-progress" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={i < state.mainIndex ? "done" : i === state.mainIndex ? "current" : undefined} />
            ))}
          </div>
        </div>
      </header>

      <div className="iv-session-body">
        <SessionThread
          turns={turns}
          question={state.question}
          kind={state.kind}
          showQuestion={QUESTION_VISIBLE.has(state.phase) && state.question.length > 0}
          translation={translation && translation.question === state.question ? translation.vi : null}
          translating={translating}
          onReplay={() => dispatch({ type: "REPLAY" })}
          onTranslate={() => void handleTranslate()}
          replayDisabled={state.phase !== "idle"}
        />
        <aside className="iv-session-side">
          <InterviewerCard statusText={status.text} tone={status.tone} />
          {(session.setup.type === "behavioral" || session.setup.type === "mixed") && <StarTips />}
          <p className="iv-note">Nhận xét chi tiết từng câu (ngữ pháp, từ vựng, cấu trúc) sẽ có ở cuối buổi.</p>
        </aside>
      </div>

      <SessionDock
        state={state}
        elapsed={elapsed}
        micError={micError === "denied"}
        onStart={() => void handleStart()}
        onStop={() => void handleStop()}
        onSend={() => dispatch({ type: "SEND" })}
        onEditDraft={(text) => dispatch({ type: "EDIT_DRAFT", text })}
        onRetryTranscribe={() => dispatch({ type: "RETRY_TRANSCRIBE" })}
        onSkip={handleSkip}
        onSkipSpeech={handleSkipSpeech}
        onReplay={() => dispatch({ type: "REPLAY" })}
        onRetryPlan={() => dispatch({ type: "RETRY_PLAN" })}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run — PASS**

Run: `cd apps/web && npx vitest run "src/app/(app)/interview/[id]/page.test.tsx"`
If a test hangs on `findBy*`, the usual cause is an effect keyed on an unstable object (e.g. a router or audio object recreated each render) — keep the mocks' returned objects module-level constants as written above, and keep `handledRef` guarding by `state` identity.

- [ ] **Step 5: Full web test run + typecheck**

Run: `cd apps/web && npx vitest run && npm run typecheck`
Expected: everything passes.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(app)/interview/[id]"
git commit -m "feat(web): interview session page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Report — components and `/interview/[id]/report` page

**Files:**
- Create: `apps/web/src/components/interview/WordDiff.tsx`, `ScoreSummary.tsx`, `ImprovementList.tsx`, `QuestionReview.tsx`, `QuestionReview.test.tsx`
- Create: `apps/web/src/app/(app)/interview/[id]/report/page.tsx`, `page.test.tsx`
- Modify: `apps/web/src/styles/bloom.css` (append)

**Interfaces:**
- Consumes: `wordDiff` (Task 2); report prompt/parse (Task 4); sessions (Task 5); `useInterviewAudio` (Task 9); `callInterviewAi`, `hasAiKey` (Task 3); `getVocabRecordByHeadword`, `saveVocabRecord` (`@/lib/vocabRecords`); `capitalizeHeadword` (`@/lib/vocabDisplay`); types/`CRITERIA`/`combinedAnswer` (Task 2).
- Produces:
  - `<WordDiff before after />`
  - `<ScoreSummary report delta />` (`delta: number | null`)
  - `<ImprovementList items />`
  - `sentenceContaining(text: string, phrase: string): string`
  - `<QuestionReview number question answer skipped item expanded onToggle onPlayModel savedPhrases onSavePhrase />` — `{ number: number; question: string; answer: string; skipped: boolean; item: InterviewReportQuestion | undefined; expanded: boolean; onToggle(): void; onPlayModel(text: string): void; savedPhrases: Set<string>; onSavePhrase(phrase: InterviewPhrase, example: string): void }`
  - route `/interview/{id}/report`

- [ ] **Step 1: Write failing tests**

`apps/web/src/components/interview/QuestionReview.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QuestionReview, sentenceContaining } from "./QuestionReview";
import type { InterviewReportQuestion } from "@/lib/interviewTypes";

const ITEM: InterviewReportQuestion = {
  mainIndex: 1,
  score: 6,
  corrected: "We disagreed about Redux.",
  strengths: "Có ví dụ cụ thể",
  gaps: "Thiếu kết quả",
  modelAnswer: "We disagreed about Redux. Rather than debate it, I proposed a prototype.",
  phrases: [{ text: "rather than debate it", meaning: "thay vì tranh cãi" }],
};

function renderReview(patch: Partial<Parameters<typeof QuestionReview>[0]> = {}) {
  const props = {
    number: 2,
    question: "Conflict?",
    answer: "We disagree about Redux.",
    skipped: false,
    item: ITEM,
    expanded: true,
    onToggle: vi.fn(),
    onPlayModel: vi.fn(),
    savedPhrases: new Set<string>(),
    onSavePhrase: vi.fn(),
    ...patch,
  };
  render(<QuestionReview {...props} />);
  return props;
}

describe("sentenceContaining", () => {
  it("finds the sentence case-insensitively", () => {
    expect(sentenceContaining(ITEM.modelAnswer, "Rather Than debate")).toBe("Rather than debate it, I proposed a prototype.");
    expect(sentenceContaining(ITEM.modelAnswer, "missing")).toBe("");
  });
});

describe("QuestionReview", () => {
  it("shows the word diff, feedback and model answer", () => {
    const props = renderReview();
    expect(screen.getByText("disagree").tagName).toBe("DEL");
    expect(screen.getByText("disagreed").tagName).toBe("INS");
    expect(screen.getByText("Có ví dụ cụ thể")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nghe câu gợi ý" }));
    expect(props.onPlayModel).toHaveBeenCalledWith(ITEM.modelAnswer);
  });

  it("saves a phrase with its example sentence, and shows saved state", () => {
    const props = renderReview();
    fireEvent.click(screen.getByRole("button", { name: /rather than debate it/ }));
    expect(props.onSavePhrase).toHaveBeenCalledWith(ITEM.phrases[0], "Rather than debate it, I proposed a prototype.");
  });

  it("marks already-saved phrases", () => {
    renderReview({ savedPhrases: new Set(["rather than debate it"]) });
    expect(screen.getByRole("button", { name: /đã lưu/ })).toBeDisabled();
  });

  it("collapsed: only the header, toggles on click", () => {
    const props = renderReview({ expanded: false });
    expect(screen.queryByText("Có ví dụ cụ thể")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Conflict\?/ }));
    expect(props.onToggle).toHaveBeenCalled();
  });

  it("skipped and ungraded questions", () => {
    renderReview({ skipped: true, answer: "", item: undefined });
    expect(screen.getByText("(Đã bỏ qua)")).toBeInTheDocument();
  });
});
```

`apps/web/src/app/(app)/interview/[id]/report/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import InterviewReportPage from "./page";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { completeInterviewSession, getInterviewSession, listRecentInterviewSessions } from "@/lib/interviewSessions";
import { callInterviewAi } from "@/lib/interviewAi";
import { getVocabRecordByHeadword, saveVocabRecord } from "@/lib/vocabRecords";
import { DEFAULT_SETTINGS, type UserSettings } from "@/lib/settings";
import type { InterviewReport, InterviewSession } from "@/lib/interviewTypes";

const replaceMock = vi.fn();
const ROUTER = { push: vi.fn(), replace: replaceMock };
vi.mock("next/navigation", () => ({ useRouter: () => ROUTER }));
vi.mock("@/lib/useAuthUser", () => ({ useAuthUser: vi.fn() }));
vi.mock("@/lib/SettingsContext", () => ({ useSettingsContext: vi.fn() }));
vi.mock("@/lib/interviewSessions", () => ({
  getInterviewSession: vi.fn(),
  listRecentInterviewSessions: vi.fn(),
  completeInterviewSession: vi.fn(),
}));
vi.mock("@/lib/interviewAi", () => ({ callInterviewAi: vi.fn(), hasAiKey: () => true }));
vi.mock("@/lib/vocabRecords", () => ({ getVocabRecordByHeadword: vi.fn(), saveVocabRecord: vi.fn() }));
const AUDIO = { speak: vi.fn().mockResolvedValue(true), prefetch: vi.fn(), playPrefetched: vi.fn(), stop: vi.fn() };
vi.mock("@/lib/useInterviewAudio", () => ({ useInterviewAudio: () => AUDIO }));
vi.mock("@/components/SignInButton", () => ({ SignInButton: () => <button>Đăng nhập với Google</button> }));

const SETTINGS: UserSettings = {
  ...DEFAULT_SETTINGS,
  providers: { ...DEFAULT_SETTINGS.providers, gemini: { ...DEFAULT_SETTINGS.providers.gemini, apiKeyCiphertext: "c" } },
};

const REPORT: InterviewReport = {
  overall: 7.2,
  criteria: { content: 8, structure: 6.5, grammar: 6, vocabulary: 7.5, fluency: 7 },
  criteriaNotes: { content: "Có ví dụ thật", structure: "Thiếu Result", grammar: "Sai thì quá khứ", vocabulary: "Ổn", fluency: "Ổn" },
  improvements: [{ title: "Thì quá khứ khi kể chuyện", detail: "disagree → disagreed" }],
  questions: [
    {
      mainIndex: 0,
      score: 6,
      corrected: "We disagreed about Redux.",
      strengths: "Cụ thể",
      gaps: "Thiếu kết quả",
      modelAnswer: "We disagreed about Redux. Rather than debate it, I proposed a prototype.",
      phrases: [{ text: "rather than debate it", meaning: "thay vì tranh cãi" }],
    },
  ],
};

function makeSession(patch: Partial<InterviewSession> = {}): InterviewSession {
  return {
    id: "s1",
    createdAt: "2026-09-27T00:00:00.000Z",
    status: "completed",
    setup: { role: "SE", level: "junior", type: "behavioral", questionCount: 5, voice: "male2", jd: "", cvSummary: null, reviewTranscript: true },
    plan: ["Conflict?", "Q2", "Q3", "Q4", "Q5"],
    turns: [{ mainIndex: 0, kind: "main", question: "Conflict?", answer: "We disagree about Redux.", skipped: false, answerSeconds: 9 }],
    report: REPORT,
    reportError: false,
    ...patch,
  };
}

function renderPage(session: InterviewSession) {
  vi.mocked(getInterviewSession).mockResolvedValue(session);
  render(<InterviewReportPage params={Promise.resolve({ id: "s1" })} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuthUser).mockReturnValue({ user: { uid: "u1" }, loading: false } as never);
  vi.mocked(useSettingsContext).mockReturnValue({ settings: SETTINGS, loading: false, error: null, save: vi.fn() });
  vi.mocked(listRecentInterviewSessions).mockResolvedValue([]);
  vi.mocked(completeInterviewSession).mockResolvedValue(undefined);
  vi.mocked(getVocabRecordByHeadword).mockResolvedValue(null);
  vi.mocked(saveVocabRecord).mockResolvedValue("v1");
});

describe("InterviewReportPage", () => {
  it("shows scores, improvements, and the first answered question expanded", async () => {
    renderPage(makeSession());
    expect(await screen.findByText("7.2")).toBeInTheDocument();
    expect(screen.getByText("Thì quá khứ khi kể chuyện")).toBeInTheDocument();
    expect(screen.getByText(/Phát âm chưa được chấm/)).toBeInTheDocument();
    expect(screen.getByText("disagree").tagName).toBe("DEL");
  });

  it("shows the delta against the previous graded session", async () => {
    vi.mocked(listRecentInterviewSessions).mockResolvedValue([
      makeSession(),
      makeSession({ id: "old", createdAt: "2026-09-20T00:00:00.000Z", report: { ...REPORT, overall: 6.1 } }),
    ]);
    renderPage(makeSession());
    expect(await screen.findByText("+1.1 so với buổi trước")).toBeInTheDocument();
  });

  it("saves a phrase to the English vocab bank with its meaning", async () => {
    renderPage(makeSession());
    fireEvent.click(await screen.findByRole("button", { name: /rather than debate it/ }));
    await waitFor(() => expect(saveVocabRecord).toHaveBeenCalled());
    expect(vi.mocked(saveVocabRecord).mock.calls[0][1]).toMatchObject({
      headword: "Rather than debate it",
      inputType: "phrase",
      meaning: "thay vì tranh cãi",
      examples: ["Rather than debate it, I proposed a prototype."],
      targetLanguage: "english",
    });
    expect(await screen.findByRole("button", { name: /đã lưu/ })).toBeDisabled();
  });

  it("does not duplicate an existing phrase", async () => {
    vi.mocked(getVocabRecordByHeadword).mockResolvedValue({ id: "x" } as never);
    renderPage(makeSession());
    fireEvent.click(await screen.findByRole("button", { name: /rather than debate it/ }));
    expect(await screen.findByRole("button", { name: /đã lưu/ })).toBeInTheDocument();
    expect(saveVocabRecord).not.toHaveBeenCalled();
  });

  it("re-grades a session whose grading failed", async () => {
    vi.mocked(callInterviewAi).mockResolvedValue(JSON.stringify(REPORT));
    renderPage(makeSession({ report: null, reportError: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Chấm lại" }));
    await waitFor(() => expect(completeInterviewSession).toHaveBeenCalledWith("u1", "s1", expect.objectContaining({ overall: 7.2 })));
    expect(await screen.findByText("7.2")).toBeInTheDocument();
  });

  it("sends an in-progress session back to the session page", async () => {
    renderPage(makeSession({ status: "in_progress", report: null }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/interview/s1"));
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd apps/web && npx vitest run src/components/interview/QuestionReview.test.tsx "src/app/(app)/interview/[id]/report/page.test.tsx"`

- [ ] **Step 3: Implement the components**

`WordDiff.tsx`:

```tsx
import { Fragment } from "react";
import { wordDiff } from "@/lib/wordDiff";

export function WordDiff({ before, after }: { before: string; after: string }) {
  const segments = wordDiff(before, after);
  return (
    <p className="iv-diff">
      {segments.map((s, i) => (
        <Fragment key={i}>
          {s.kind === "equal" && <span>{s.text}</span>}
          {s.kind === "removed" && <del>{s.text}</del>}
          {s.kind === "added" && <ins>{s.text}</ins>}
          {i < segments.length - 1 && " "}
        </Fragment>
      ))}
    </p>
  );
}
```

`ScoreSummary.tsx`:

```tsx
import { CRITERIA, type InterviewReport } from "@/lib/interviewTypes";

function tone(score: number): string {
  return score >= 7 ? "good" : score >= 6 ? "mid" : "low";
}

export function ScoreSummary({ report, delta }: { report: InterviewReport; delta: number | null }) {
  return (
    <section className="iv-score" aria-label="Tổng quan điểm">
      <div className="iv-card iv-score-total">
        <span className="iv-label">Điểm tổng</span>
        <span className={`iv-score-big iv-tone-${tone(report.overall)}`}>{report.overall.toFixed(1)}</span>
        <span className="iv-muted">/ 10</span>
        {delta !== null && (
          <span className="iv-delta">{`${delta >= 0 ? "+" : ""}${delta.toFixed(1)} so với buổi trước`}</span>
        )}
      </div>
      <div className="iv-card iv-score-criteria">
        <span className="iv-label">Theo tiêu chí</span>
        <div className="iv-criteria-grid">
          {CRITERIA.map(({ key, label }) => (
            <div key={key} className="iv-criterion">
              <div className="iv-row iv-criterion-head">
                <span>{label}</span>
                <strong>{report.criteria[key].toFixed(1)}</strong>
              </div>
              <div className="iv-bar"><div className={`iv-bar-fill iv-tone-bg-${tone(report.criteria[key])}`} style={{ width: `${report.criteria[key] * 10}%` }} /></div>
              <span className="iv-muted">{report.criteriaNotes[key]}</span>
            </div>
          ))}
        </div>
        <p className="iv-muted iv-pron-note">Phát âm chưa được chấm — hệ thống hiện chỉ chấm dựa trên bản chép lời.</p>
      </div>
    </section>
  );
}
```

`ImprovementList.tsx`:

```tsx
import type { InterviewReport } from "@/lib/interviewTypes";

export function ImprovementList({ items }: { items: InterviewReport["improvements"] }) {
  if (items.length === 0) return null;
  return (
    <section className="iv-card" aria-label="Cần cải thiện">
      <h3 className="iv-card-title">{`${items.length} điều nên sửa trước buổi sau`}</h3>
      <div className="iv-improve-grid">
        {items.map((it) => (
          <div key={it.title} className="iv-improve">
            <strong>{it.title}</strong>
            <span className="iv-muted">{it.detail}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

`QuestionReview.tsx`:

```tsx
import type { InterviewPhrase, InterviewReportQuestion } from "@/lib/interviewTypes";
import { WordDiff } from "./WordDiff";

export function sentenceContaining(text: string, phrase: string): string {
  const needle = phrase.toLowerCase();
  return text.split(/(?<=[.!?])\s+/).find((s) => s.toLowerCase().includes(needle))?.trim() ?? "";
}

export interface QuestionReviewProps {
  number: number;
  question: string;
  answer: string;
  skipped: boolean;
  item: InterviewReportQuestion | undefined;
  expanded: boolean;
  onToggle(): void;
  onPlayModel(text: string): void;
  savedPhrases: Set<string>;
  onSavePhrase(phrase: InterviewPhrase, example: string): void;
}

export function QuestionReview(props: QuestionReviewProps) {
  const { item } = props;
  return (
    <div className={props.expanded ? "iv-qr iv-qr-open" : "iv-qr"}>
      <button type="button" className="iv-qr-head" aria-expanded={props.expanded} onClick={props.onToggle}>
        <span className="iv-qr-num">{props.number}</span>
        <span className="iv-qr-question">{props.question}</span>
        <span className="iv-qr-score">{item ? item.score.toFixed(1) : "—"}</span>
      </button>
      {props.expanded && (
        <div className="iv-qr-body">
          {props.skipped ? (
            <p className="iv-muted">(Đã bỏ qua)</p>
          ) : (
            <div className="iv-field">
              <span className="iv-caps">Câu trả lời của bạn · đã sửa</span>
              {item ? <WordDiff before={props.answer} after={item.corrected} /> : <p>{props.answer}</p>}
            </div>
          )}
          {!item && !props.skipped && <p className="iv-muted">Chưa có nhận xét cho câu này.</p>}
          {item && (
            <>
              <div className="iv-feedback-grid">
                <p className="iv-good"><b>Làm tốt:</b> {item.strengths}</p>
                <p className="iv-gap"><b>Thiếu:</b> {item.gaps}</p>
              </div>
              <div className="iv-model">
                <div className="iv-row iv-model-head">
                  <span className="iv-caps">Câu trả lời gợi ý</span>
                  <button type="button" className="btn-secondary" onClick={() => props.onPlayModel(item.modelAnswer)}>Nghe câu gợi ý</button>
                </div>
                <p>{item.modelAnswer}</p>
              </div>
              {item.phrases.length > 0 && (
                <div className="iv-row">
                  <span className="iv-label">Từ nên dùng:</span>
                  {item.phrases.map((p) => {
                    const saved = props.savedPhrases.has(p.text);
                    return (
                      <button
                        key={p.text}
                        type="button"
                        className={saved ? "iv-phrase iv-phrase-saved" : "iv-phrase"}
                        disabled={saved}
                        title={p.meaning}
                        onClick={() => props.onSavePhrase(p, sentenceContaining(item.modelAnswer, p.text))}
                      >
                        {saved ? `${p.text} ✓ đã lưu` : `${p.text} ＋`}
                      </button>
                    );
                  })}
                  <span className="iv-muted">→ lưu vào Ngân hàng từ vựng</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement the report page**

`apps/web/src/app/(app)/interview/[id]/report/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { useRouteParams } from "@/lib/useRouteParams";
import { SignInButton } from "@/components/SignInButton";
import { callInterviewAi, hasAiKey } from "@/lib/interviewAi";
import { answeredMainIndexes, buildReportPrompt, parseReport } from "@/lib/interviewReportPrompt";
import { completeInterviewSession, getInterviewSession, listRecentInterviewSessions } from "@/lib/interviewSessions";
import { getVocabRecordByHeadword, saveVocabRecord } from "@/lib/vocabRecords";
import { capitalizeHeadword } from "@/lib/vocabDisplay";
import { useInterviewAudio } from "@/lib/useInterviewAudio";
import {
  INTERVIEW_LEVELS,
  INTERVIEW_TYPES,
  combinedAnswer,
  type InterviewPhrase,
  type InterviewSession,
} from "@/lib/interviewTypes";
import { ScoreSummary } from "@/components/interview/ScoreSummary";
import { ImprovementList } from "@/components/interview/ImprovementList";
import { QuestionReview } from "@/components/interview/QuestionReview";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export default function InterviewReportPage({ params }: { params: Promise<{ id: string }> }) {
  const resolved = useRouteParams(params);
  const id = resolved?.id ?? null;
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();
  const { settings } = useSettingsContext();
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [previous, setPrevious] = useState<InterviewSession | null>(null);
  const [missing, setMissing] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [regrading, setRegrading] = useState(false);
  const [regradeError, setRegradeError] = useState<string | null>(null);
  const audio = useInterviewAudio(session?.setup.voice ?? "male2");

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    getInterviewSession(user.uid, id)
      .then(async (s) => {
        if (cancelled) return;
        if (!s) {
          setMissing(true);
          return;
        }
        if (s.status === "in_progress") {
          router.replace(`/interview/${id}`);
          return;
        }
        setSession(s);
        setExpanded(answeredMainIndexes(s.turns)[0] ?? null);
        const recent = await listRecentInterviewSessions(user.uid, 10).catch(() => []);
        if (!cancelled) setPrevious(recent.find((r) => r.id !== s.id && r.createdAt < s.createdAt && r.report) ?? null);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, id, router]);

  if (authLoading || (user && !resolved)) return <p>Đang tải…</p>;
  if (!user) {
    return (
      <div>
        <h2 className="scr-title">Kết quả phỏng vấn</h2>
        <p className="scr-sub">Đăng nhập để xem kết quả.</p>
        <SignInButton />
      </div>
    );
  }
  if (missing) {
    return (
      <div>
        <h2 className="scr-title">Không tìm thấy buổi phỏng vấn</h2>
        <Link href="/interview">Về trang Phỏng vấn</Link>
      </div>
    );
  }
  if (!session) return <p>Đang tải…</p>;

  const report = session.report;
  const delta =
    report && previous?.report ? Math.round((report.overall - previous.report.overall) * 10) / 10 : null;
  const typeLabel = INTERVIEW_TYPES.find((t) => t.id === session.setup.type)?.label ?? session.setup.type;
  const levelLabel = INTERVIEW_LEVELS.find((l) => l.id === session.setup.level)?.label ?? session.setup.level;
  const answered = answeredMainIndexes(session.turns);
  const touched = [...new Set(session.turns.map((t) => t.mainIndex))].sort((a, b) => a - b);

  async function handleRegrade() {
    if (!user || !settings || !session) return;
    setRegrading(true);
    setRegradeError(null);
    try {
      const next = parseReport(
        await callInterviewAi(settings, buildReportPrompt(session.setup, session.plan, session.turns)),
        answeredMainIndexes(session.turns)
      );
      await completeInterviewSession(user.uid, session.id, next);
      setSession({ ...session, report: next, reportError: false });
    } catch (err) {
      setRegradeError(err instanceof Error ? err.message : "Chấm lại thất bại.");
    }
    setRegrading(false);
  }

  async function handleSavePhrase(phrase: InterviewPhrase, example: string) {
    if (!user) return;
    const headword = capitalizeHeadword(phrase.text.trim());
    try {
      const existing = await getVocabRecordByHeadword(user.uid, headword, "english");
      if (!existing) {
        const now = new Date().toISOString();
        await saveVocabRecord(user.uid, {
          headword,
          inputType: "phrase",
          ipa: "",
          meaning: phrase.meaning,
          examples: example ? [example] : [],
          personalNotes: "Từ luyện Phỏng vấn tiếng Anh",
          topicIds: [],
          targetLanguage: "english",
          cefrLevel: "b1",
          activeContext: "business",
          createdAt: now,
          updatedAt: now,
          nextReviewAt: null,
          sm2Repetitions: 0,
          sm2EaseFactor: 2.5,
          sm2Interval: 1,
          definition: "",
          synonyms: [],
        });
      }
      setSaved((prev) => new Set(prev).add(phrase.text));
    } catch {
      // Leave it unsaved; the user can click again.
    }
  }

  return (
    <div className="iv-page iv-report">
      <header className="iv-report-head">
        <div>
          <Link href="/interview">← Phỏng vấn</Link>
          <h2 className="scr-title">Kết quả buổi phỏng vấn</h2>
          <p className="iv-muted">
            {`${session.setup.role} · ${typeLabel} · ${levelLabel} · ${answered.length}/${session.plan.length} câu · ${formatDate(session.createdAt)}`}
          </p>
        </div>
        <Link href="/interview" className="btn-primary">Buổi mới</Link>
      </header>

      {report ? (
        <>
          <ScoreSummary report={report} delta={delta} />
          <ImprovementList items={report.improvements} />
        </>
      ) : (
        <section className="iv-card">
          <p>Chưa chấm được buổi này.</p>
          <div className="iv-row">
            <button type="button" className="btn-primary" disabled={regrading || !hasAiKey(settings)} onClick={() => void handleRegrade()}>
              Chấm lại
            </button>
            {regrading && <span className="iv-muted">Đang chấm…</span>}
          </div>
          {regradeError && <p className="iv-error" role="alert">{regradeError}</p>}
        </section>
      )}

      <section className="iv-qr-list" aria-label="Từng câu hỏi">
        <h3 className="iv-card-title">Từng câu hỏi</h3>
        {touched.map((i) => (
          <QuestionReview
            key={i}
            number={i + 1}
            question={session.plan[i] ?? ""}
            answer={combinedAnswer(session.turns, i)}
            skipped={!answered.includes(i)}
            item={report?.questions.find((q) => q.mainIndex === i)}
            expanded={expanded === i}
            onToggle={() => setExpanded(expanded === i ? null : i)}
            onPlayModel={(text) => {
              audio.stop();
              void audio.speak(text);
            }}
            savedPhrases={saved}
            onSavePhrase={(p, ex) => void handleSavePhrase(p, ex)}
          />
        ))}
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Append Report CSS to `bloom.css`**

```css
.iv-report { display: flex; flex-direction: column; gap: 20px; }
.iv-report-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; flex-wrap: wrap; }
.iv-report-head p { margin: 0; }
.iv-score { display: flex; gap: 18px; flex-wrap: wrap; }
.iv-score-total { width: 240px; align-items: flex-start; }
.iv-score-big { font-size: 54px; font-weight: 800; line-height: 1; }
.iv-delta { font-size: 13.5px; font-weight: 600; padding: 4px 10px; border-radius: 999px; background: var(--sage-bg); color: var(--success); }
.iv-score-criteria { flex: 1; min-width: 300px; }
.iv-criteria-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 28px; }
.iv-criterion { display: flex; flex-direction: column; gap: 6px; }
.iv-criterion-head { justify-content: space-between; }
.iv-bar { height: 8px; border-radius: 999px; background: var(--surface-3); overflow: hidden; }
.iv-bar-fill { height: 100%; border-radius: 999px; }
.iv-tone-good { color: var(--success); }
.iv-tone-mid { color: var(--amber); }
.iv-tone-low { color: var(--danger); }
.iv-tone-bg-good { background: var(--sage); }
.iv-tone-bg-mid { background: var(--amber); }
.iv-tone-bg-low { background: var(--danger); }
.iv-pron-note { border-top: 1px solid var(--surface-3); padding-top: 10px; margin: 0; }
.iv-improve-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.iv-improve { background: var(--surface-2); border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 6px; }
.iv-qr-list { display: flex; flex-direction: column; gap: 10px; }
.iv-qr { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; overflow: hidden; }
.iv-qr-open { border: 1.5px solid var(--accent); }
.iv-qr-head { font: inherit; width: 100%; border: 0; background: transparent; color: var(--ink); padding: 14px 20px; display: flex; align-items: center; gap: 14px; text-align: left; cursor: pointer; }
.iv-qr-num { width: 30px; height: 30px; flex-shrink: 0; border-radius: 999px; background: var(--surface-3); font-weight: 800; display: flex; align-items: center; justify-content: center; }
.iv-qr-question { flex: 1; font-weight: 600; }
.iv-qr-score { font-weight: 800; }
.iv-qr-body { padding: 0 20px 20px 64px; display: flex; flex-direction: column; gap: 14px; }
.iv-caps { font-size: 12.5px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-soft); }
.iv-diff { margin: 0; font-size: 16px; line-height: 1.8; }
.iv-diff del { color: var(--danger); background: var(--danger-bg); text-decoration-thickness: 2px; border-radius: 4px; padding: 0 2px; }
.iv-diff ins { color: var(--success); background: var(--success-bg); text-decoration: none; font-weight: 600; border-radius: 4px; padding: 0 3px; }
.iv-feedback-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.iv-good, .iv-gap { margin: 0; border-radius: 14px; padding: 12px 14px; font-size: 14.5px; }
.iv-good { background: var(--sage-bg); }
.iv-gap { background: var(--amber-bg); }
.iv-model { background: var(--surface-2); border-radius: 16px; padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
.iv-model p { margin: 0; }
.iv-model-head { justify-content: space-between; }
.iv-phrase { font: inherit; font-size: 14px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); cursor: pointer; }
.iv-phrase-saved { background: var(--sage-bg); border-color: var(--sage-bg); color: var(--success); cursor: default; }
@media (max-width: 980px) {
  .iv-criteria-grid, .iv-improve-grid, .iv-feedback-grid { grid-template-columns: minmax(0, 1fr); }
  .iv-qr-body { padding-left: 20px; }
}
```

- [ ] **Step 6: Run — PASS**

Run: `cd apps/web && npx vitest run src/components/interview "src/app/(app)/interview" && npx vitest run && npm run typecheck`

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/interview "apps/web/src/app/(app)/interview/[id]/report" apps/web/src/styles/bloom.css
git commit -m "feat(web): interview report page with word diff and phrase saving

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Docs, build check, and deploy/verification checklist

**Files:**
- Modify: `README.md` (feature list)
- Modify: `CLAUDE.md` (Deploy gotchas)

- [ ] **Step 1: README**

Add a bullet to the web feature list in `README.md` (find the existing Nghe/Listening bullets and add next to them, matching their style):

> **Phỏng vấn tiếng Anh (web):** luyện phỏng vấn bằng giọng nói — AI hỏi theo kế hoạch (dựa trên vị trí, cấp độ, CV PDF/DOCX và JD), hỏi xoáy tối đa 1 lần mỗi câu, chấm cuối buổi (5 tiêu chí, sửa lỗi theo từ, câu trả lời gợi ý, lưu cụm từ vào Ngân hàng từ vựng). STT dùng service Cloud Run riêng `stt`.

- [ ] **Step 2: CLAUDE.md**

Add to the "Deploy gotchas" list in the root `CLAUDE.md`:

> - **Whisper STT runs on its own Cloud Run service `stt`** (same image as `tts-stt`, deployed with `--concurrency=1 --cpu=2 --memory=2Gi --min-instances=0 --max-instances=5`). `transcribeAudio` reads `STT_SERVICE_URL` (falls back to `TTS_STT_SERVICE_URL`); `warmUpSpeech` pings both. Rebuilding the image means redeploying **both** services. The Cloud Functions runtime service account needs `roles/run.invoker` on `stt` too.

- [ ] **Step 3: Full verification**

Run: `cd functions && npx vitest run && npm run typecheck && cd ../apps/web && npx vitest run && npm run typecheck && npm run build`
Expected: all green; `next build` succeeds (confirms the pdfjs worker bundling from Task 6).

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: English interview practice feature and stt service

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Manual deploy + verification (performed by the user, not the implementer)**

Report this checklist to the user; do not run deploy commands:

1. `gcloud run deploy stt --image=asia-southeast1-docker.pkg.dev/lexi-core/tts-stt/tts-stt:latest --region=asia-southeast1 --project=lexi-core --no-allow-unauthenticated --concurrency=1 --cpu=2 --memory=2Gi --min-instances=0 --max-instances=5 --timeout=60s`
2. `gcloud run services add-iam-policy-binding stt --region=asia-southeast1 --project=lexi-core --member=serviceAccount:<functions runtime SA> --role=roles/run.invoker`
3. Add `STT_SERVICE_URL=<stt service URL>` to `functions/.env`; `firebase deploy --only functions`.
4. Firebase Console → Firestore → Rules: confirm `users/{uid}/{document=**}` allows read/write only when `request.auth.uid == uid`.
5. Push → App Hosting deploys the web app.
6. In the deployed app: run a 5-question session. Confirm the first recorded answer transcribes (proves webm/opus decoding). **If `/transcribe` returns 500 on webm**, change `services/tts-stt/app/stt.py` to write the temp file with suffix `.webm` (`tempfile.NamedTemporaryFile(suffix=".webm", delete=False)`) — PyAV then probes by content — rebuild the image and redeploy both services.
7. Measure the wait between "Gửi câu trả lời" and hearing the next question (warm target 3–6 s) and the first-question wait after a long idle (cold).
8. Upload a text PDF CV, a scanned PDF (expect the DOCX/paste fallback), and a DOCX.
