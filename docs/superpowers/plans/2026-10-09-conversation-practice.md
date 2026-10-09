# English Conversation Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a web-only chat-style English speaking/writing practice feature (free topic + goal-driven role-play) with on-demand hints and an end-of-session report.

**Architecture:** A parallel `conversation*` feature module in `apps/web/` that reuses the English Interview building blocks (recorder, STT/TTS clients, `callInterviewAi`, `WordDiff`, vocab-save flow) without changing them. All AI work is prompt-level over the existing `generateContent` callable; state lives in a pure reducer plus one Firestore doc per session. No Cloud Function, Cloud Run, or dependency changes.

**Tech Stack:** Next.js 16 (App Router, `"use client"` pages), React 19, TypeScript, Firebase JS SDK (Firestore), Vitest + Testing Library.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-09-conversation-practice-design.md` (as amended by Task 12). UI mockups: https://claude.ai/artifact/9D6N3cv1cULLYjP3PyvFKU.
- Web only, under `apps/web/`. No Flutter, `functions/`, or `services/` changes. No new npm dependencies.
- English-only practice regardless of `settings.targetLanguage`; saved phrases go to `vocab_records_english` (`targetLanguage: "english"`).
- Reuse, do not modify: `useRecorder`, `transcribeAudioClient`, `warmUpSpeechClient`, `useInterviewAudio`, `interviewAi` (`callInterviewAi`, `hasAiKey`), `interviewPrompts` helpers (`parseJson`, `str`, `strList`, `InterviewAiError`), `WordDiff` (`@/components/interview/WordDiff`), `micPermission`, `ReadinessCard`, `vocabRecords`, `vocabDisplay`.
- Strict alternation: one user message always gets exactly one AI reply. "+ Nói thêm" merges segments into one user message.
- Caps: 30 user turns hard cap; topic mode offers wrap-up at user turn 12; AI context = rolling `summary` + unsummarized tail; condense when the unsummarized tail reaches 16 messages (keeps the last 8).
- Firestore writes must never contain `undefined` fields (omit optional keys instead of setting them to `undefined`).
- A message the user said or typed is never discarded by a failure (persist the user message before calling the AI).
- UI copy is Vietnamese; AI-facing prompts are English; feedback text from the AI is Vietnamese except quoted English.
- CSS: append new rules to the end of `apps/web/src/styles/bloom.css` with the `cv-` prefix; reuse existing `iv-*`, `vb-chip`, `btn-primary`, `btn-secondary`, `scr-title`, `scr-sub` classes where they fit. Use only existing CSS variables (`--surface`, `--surface-2`, `--surface-3`, `--ink`, `--ink-soft`, `--ink-faint`, `--accent`, `--border`, `--success`, `--success-bg`, `--danger`).
- Next.js in this repo is v16 with breaking changes: mirror the structure of the existing `apps/web/src/app/(app)/interview/**` pages (`useRouteParams`, `"use client"`) rather than relying on memory of older Next.js.
- Commands run from `apps/web/`: tests `npx vitest run <path>`, types `npm run typecheck`, full suite `npm test`.
- Commit messages end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## File Structure

`apps/web/src/lib/`
- `conversationTypes.ts` (new) — types, constants, `userTurnCount`.
- `conversationScenarios.ts` (new) — static topic cards and role-play presets.
- `conversationPrompts.ts` (new) — scenario/opening/reply/hint/suggest/condense/translate prompts + parsers.
- `conversationReportPrompt.ts` (new) — report prompt + parser.
- `conversationHistory.ts` (new) — pure context-window / condense helpers.
- `conversationSessions.ts` (new) — Firestore CRUD.
- `conversationMachine.ts` (new) — reducer, `joinSegments`, `replyFlags`, `isScenarioComplete`.

`apps/web/src/components/conversation/` (new): `ModeTabs`, `ScenarioCards`, `ScenarioPreview`, `ConversationSetupForm`, `RecentConversations`, `ChatThread`, `HintBubble`, `SuggestPanel`, `GoalChecklist`, `Composer`, `ConversationReportSummary`, `RecurringMistakes`, `CorrectionList`, `PhraseSaveList` (each with a `.test.tsx` where noted).

`apps/web/src/app/(app)/conversation/`: `page.tsx` (Setup), `[id]/page.tsx` (Chat), `[id]/report/page.tsx` (Report).

Modified: `apps/web/src/components/shell/Sidebar.tsx` + `Sidebar.test.tsx`, `apps/web/src/styles/bloom.css`, the spec, `README.md`.

---

### Task 1: Types and scenario catalogue

**Files:**
- Create: `apps/web/src/lib/conversationTypes.ts`
- Create: `apps/web/src/lib/conversationScenarios.ts`
- Test: `apps/web/src/lib/conversationScenarios.test.ts`

**Interfaces:**
- Produces: all types in `conversationTypes.ts` (below), constants `RECENT_WINDOW=8`, `CONDENSE_THRESHOLD=16`, `WRAP_UP_TURN=12`, `MAX_USER_TURNS=30`, `CONVERSATION_LEVELS`, `CONVERSATION_CRITERIA`, `userTurnCount(messages)`; and from `conversationScenarios.ts`: `TopicCard`, `RoleplayPreset`, `TOPIC_CARDS`, `ROLEPLAY_PRESETS`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/conversationScenarios.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ROLEPLAY_PRESETS, TOPIC_CARDS } from "./conversationScenarios";
import { userTurnCount, type ConversationMessage } from "./conversationTypes";

describe("conversationScenarios", () => {
  it("has uniquely identified topic cards with a non-empty topic", () => {
    const ids = TOPIC_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(TOPIC_CARDS.length).toBeGreaterThanOrEqual(6);
    for (const c of TOPIC_CARDS) {
      expect(c.title.trim()).not.toBe("");
      expect(c.topic.trim()).not.toBe("");
    }
  });

  it("gives every role-play preset a persona and 3-4 goals", () => {
    const ids = ROLEPLAY_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ROLEPLAY_PRESETS.length).toBeGreaterThanOrEqual(5);
    for (const p of ROLEPLAY_PRESETS) {
      expect(p.persona.trim()).not.toBe("");
      expect(p.goals.length).toBeGreaterThanOrEqual(3);
      expect(p.goals.length).toBeLessThanOrEqual(4);
    }
  });
});

describe("userTurnCount", () => {
  it("counts only user messages", () => {
    const messages: ConversationMessage[] = [
      { role: "ai", text: "Hi" },
      { role: "user", text: "Hello" },
      { role: "ai", text: "How are you?" },
      { role: "user", text: "Fine" },
    ];
    expect(userTurnCount(messages)).toBe(2);
    expect(userTurnCount([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/conversationScenarios.test.ts`
Expected: FAIL (cannot resolve `./conversationScenarios`).

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/conversationTypes.ts`:

```ts
import type { InterviewVoice } from "./interviewTypes";

export type ConversationMode = "topic" | "roleplay";
export type ConversationLevel = "A2" | "B1" | "B2" | "C1";

export const CONVERSATION_LEVELS: ConversationLevel[] = ["A2", "B1", "B2", "C1"];

/** Messages kept verbatim after a condense. */
export const RECENT_WINDOW = 8;
/** Condense when this many messages are not yet folded into `summary`. */
export const CONDENSE_THRESHOLD = 16;
/** Topic mode offers to wrap up when the learner reaches this user turn. */
export const WRAP_UP_TURN = 12;
/** Hard cap on user turns, both modes. */
export const MAX_USER_TURNS = 30;

export interface ConversationSetup {
  mode: ConversationMode;
  /** Topic text, or the scenario title/description in role-play. */
  topic: string;
  level: ConversationLevel;
  voice: InterviewVoice;
  speakAloud: boolean;
  reviewTranscript: boolean;
  /** Role-play only: who the AI plays (English). null in topic mode. */
  persona: string | null;
  /** Role-play only: 3-4 goals (Vietnamese). [] in topic mode. */
  goals: string[];
}

export interface ConversationHint {
  corrected: string;
  note: string;
  alternatives: string[];
}

export interface ConversationMessage {
  role: "ai" | "user";
  text: string;
  /** Cached "Gợi ý sửa" result; user messages only. Omit the key when absent. */
  hint?: ConversationHint;
}

export type ConversationCriterionKey = "grammar" | "vocabulary" | "fluency" | "coherence";

export const CONVERSATION_CRITERIA: { key: ConversationCriterionKey; label: string }[] = [
  { key: "grammar", label: "Ngữ pháp" },
  { key: "vocabulary", label: "Từ vựng" },
  { key: "fluency", label: "Độ trôi chảy" },
  { key: "coherence", label: "Mạch lạc" },
];

export interface ConversationPhrase {
  text: string;     // English phrase
  meaning: string;  // short Vietnamese meaning
  example: string;  // short English sentence using the phrase
}

export interface ConversationCorrection {
  messageIndex: number; // index into session.messages (a user message)
  said: string;
  corrected: string;
  note: string;         // Vietnamese
}

export interface ConversationMistake {
  pattern: string; // Vietnamese description
  examples: { said: string; better: string }[];
}

export interface ConversationReport {
  overall: number;
  criteria: Record<ConversationCriterionKey, number>;
  criteriaNotes: Record<ConversationCriterionKey, string>;
  recurringMistakes: ConversationMistake[];
  corrections: ConversationCorrection[];
  phrases: ConversationPhrase[];
  /** Role-play only; the key is omitted in topic mode. */
  goalResult?: { achieved: boolean; comment: string };
}

export interface ConversationSession {
  id: string;
  createdAt: string;
  status: "in_progress" | "completed";
  setup: ConversationSetup;
  summary: string;
  summarizedCount: number;
  messages: ConversationMessage[];
  goalsDone: number[];
  report: ConversationReport | null;
  reportError: boolean;
}

export function userTurnCount(messages: ConversationMessage[]): number {
  return messages.filter((m) => m.role === "user").length;
}
```

Create `apps/web/src/lib/conversationScenarios.ts`:

```ts
export interface TopicCard {
  id: string;
  title: string;
  sub: string;
  topic: string;
}

export interface RoleplayPreset {
  id: string;
  title: string;
  sub: string;
  /** English: who the AI plays. */
  persona: string;
  /** Vietnamese: 3-4 goals shown to the learner. */
  goals: string[];
}

export const TOPIC_CARDS: TopicCard[] = [
  { id: "travel", title: "Du lịch", sub: "Chuyến đi đáng nhớ", topic: "Travel and memorable trips" },
  { id: "work", title: "Công việc", sub: "Một ngày ở văn phòng", topic: "Work and daily life at the office" },
  { id: "food", title: "Ẩm thực", sub: "Món yêu thích", topic: "Food and favourite meals" },
  { id: "media", title: "Phim & sách", sub: "Gần đây bạn xem gì", topic: "Movies, TV shows and books" },
  { id: "tech", title: "Công nghệ", sub: "AI và đời sống", topic: "Technology and AI in everyday life" },
  { id: "health", title: "Sức khỏe", sub: "Thói quen hằng ngày", topic: "Health and daily habits" },
];

export const ROLEPLAY_PRESETS: RoleplayPreset[] = [
  {
    id: "restaurant",
    title: "Gọi món ở nhà hàng",
    sub: "AI là phục vụ",
    persona: "A friendly waiter at an Italian restaurant who speaks clearly and patiently",
    goals: ["Gọi đồ uống", "Gọi món khai vị và món chính", "Hỏi món nào không có hải sản", "Xin thanh toán"],
  },
  {
    id: "hotel",
    title: "Check-in khách sạn",
    sub: "AI là lễ tân",
    persona: "A polite hotel receptionist at the front desk",
    goals: ["Nhận phòng với tên đặt phòng", "Hỏi giờ ăn sáng", "Xin hóa đơn khi trả phòng"],
  },
  {
    id: "bargain",
    title: "Thương lượng giá",
    sub: "AI là người bán",
    persona: "A market stall seller who is friendly but likes to bargain",
    goals: ["Hỏi giá món đồ", "Đề nghị giảm giá lịch sự", "Chốt giá và thanh toán"],
  },
  {
    id: "directions",
    title: "Hỏi đường",
    sub: "AI là người qua đường",
    persona: "A helpful local who knows the neighbourhood well",
    goals: ["Hỏi ga tàu gần nhất ở đâu", "Hỏi mất bao lâu để đi bộ", "Nhắc lại chỉ dẫn để chắc chắn"],
  },
  {
    id: "doctor",
    title: "Đặt lịch khám",
    sub: "AI là lễ tân phòng khám",
    persona: "A calm receptionist at a medical clinic",
    goals: ["Nói lý do muốn đặt lịch", "Mô tả triệu chứng", "Chọn ngày giờ phù hợp"],
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/conversationScenarios.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/conversationTypes.ts apps/web/src/lib/conversationScenarios.ts apps/web/src/lib/conversationScenarios.test.ts
git commit -m "feat(web/conversation): types, constants and scenario catalogue" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Chat prompts and parsers

**Files:**
- Create: `apps/web/src/lib/conversationPrompts.ts`
- Test: `apps/web/src/lib/conversationPrompts.test.ts`

**Interfaces:**
- Consumes: `InterviewAiError`, `parseJson`, `str`, `strList` from `./interviewPrompts`; types from `./conversationTypes`.
- Produces (exact signatures):
  - `formatTranscript(messages: ConversationMessage[]): string`
  - `buildScenarioPrompt(description: string, level: ConversationLevel): string`; `parseScenario(raw: string): { persona: string; goals: string[] }`
  - `buildOpeningPrompt(setup: ConversationSetup): string`; `parseOpening(raw: string): string`
  - `interface ReplyInput { setup: ConversationSetup; summary: string; window: ConversationMessage[]; goalsDone: number[]; offerEnd: boolean; mustClose: boolean }`
  - `buildReplyPrompt(input: ReplyInput): string`; `parseReply(raw: string, goalCount: number): { say: string; goalsDone: number[]; suggestEnd: boolean }`
  - `interface HintInput { setup: ConversationSetup; userText: string; previousAi: string }`; `buildHintPrompt(input: HintInput): string`; `parseHint(raw: string): ConversationHint`
  - `interface SuggestInput { setup: ConversationSetup; currentGoal: string | null; summary: string; window: ConversationMessage[] }`; `buildSuggestPrompt(input: SuggestInput): string`; `parseSuggest(raw: string): string[]`
  - `interface CondenseInput { previousSummary: string; messages: ConversationMessage[] }`; `buildCondensePrompt(input: CondenseInput): string`; `parseCondense(raw: string): string`
  - `buildConversationTranslatePrompt(text: string): string`; `parseConversationTranslation(raw: string): string`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/conversationPrompts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildCondensePrompt,
  buildHintPrompt,
  buildOpeningPrompt,
  buildReplyPrompt,
  buildScenarioPrompt,
  buildSuggestPrompt,
  formatTranscript,
  parseCondense,
  parseConversationTranslation,
  parseHint,
  parseOpening,
  parseReply,
  parseScenario,
  parseSuggest,
} from "./conversationPrompts";
import type { ConversationSetup } from "./conversationTypes";

const TOPIC: ConversationSetup = {
  mode: "topic", topic: "Travel", level: "B1", voice: "female1",
  speakAloud: true, reviewTranscript: true, persona: null, goals: [],
};
const ROLE: ConversationSetup = {
  mode: "roleplay", topic: "Ordering at a restaurant", level: "B1", voice: "female1",
  speakAloud: true, reviewTranscript: true, persona: "A friendly waiter", goals: ["Gọi đồ uống", "Xin thanh toán"],
};

describe("formatTranscript", () => {
  it("labels AI and Learner lines", () => {
    expect(formatTranscript([{ role: "ai", text: "Hi" }, { role: "user", text: "Hello" }])).toBe("AI: Hi\nLearner: Hello");
  });
});

describe("scenario", () => {
  it("builds a prompt containing the description and level", () => {
    const p = buildScenarioPrompt("Negotiating rent", "B2");
    expect(p).toContain("Negotiating rent");
    expect(p).toContain("B2");
  });
  it("parses persona and 3-4 goals", () => {
    const out = parseScenario('{"persona":"A landlord","goals":["a","b","c","d","e"]}');
    expect(out.persona).toBe("A landlord");
    expect(out.goals).toEqual(["a", "b", "c", "d"]);
  });
  it("rejects fewer than 3 goals or a missing persona", () => {
    expect(() => parseScenario('{"persona":"x","goals":["a","b"]}')).toThrow();
    expect(() => parseScenario('{"persona":"","goals":["a","b","c"]}')).toThrow();
    expect(() => parseScenario("not json")).toThrow();
  });
});

describe("opening", () => {
  it("mentions the topic (topic) or persona (role-play)", () => {
    expect(buildOpeningPrompt(TOPIC)).toContain("Travel");
    expect(buildOpeningPrompt(ROLE)).toContain("A friendly waiter");
  });
  it("parses say, rejects empty", () => {
    expect(parseOpening('{"say":" Hi there! "}')).toBe("Hi there!");
    expect(() => parseOpening('{"say":""}')).toThrow();
  });
});

describe("reply", () => {
  const base = { summary: "", window: [{ role: "user" as const, text: "I like Da Nang" }], goalsDone: [], offerEnd: false, mustClose: false };
  it("includes summary only when present and numbers the goals", () => {
    expect(buildReplyPrompt({ ...base, setup: ROLE })).toContain("0. Gọi đồ uống");
    expect(buildReplyPrompt({ ...base, setup: TOPIC })).not.toContain("Summary of the earlier");
    expect(buildReplyPrompt({ ...base, setup: TOPIC, summary: "They talked about Hue." })).toContain("Summary of the earlier conversation");
  });
  it("adds closing / wrap-up instructions from the flags", () => {
    expect(buildReplyPrompt({ ...base, setup: TOPIC, mustClose: true })).toContain("closing");
    expect(buildReplyPrompt({ ...base, setup: TOPIC, offerEnd: true })).toContain("wrap up");
  });
  it("parses say, keeps only valid unique goal indexes, defaults suggestEnd to false", () => {
    const out = parseReply('{"say":"Nice!","goalsDone":[1,1,5,-1,"0",0],"suggestEnd":true}', 2);
    expect(out).toEqual({ say: "Nice!", goalsDone: [1, 0], suggestEnd: true });
    expect(parseReply('{"say":"Ok"}', 0)).toEqual({ say: "Ok", goalsDone: [], suggestEnd: false });
  });
  it("rejects a reply without say", () => {
    expect(() => parseReply('{"goalsDone":[0]}', 2)).toThrow();
  });
});

describe("hint", () => {
  it("includes the learner text and previous AI line", () => {
    const p = buildHintPrompt({ setup: TOPIC, userText: "I go to Da Nang", previousAi: "Where did you go?" });
    expect(p).toContain("I go to Da Nang");
    expect(p).toContain("Where did you go?");
  });
  it("parses corrected, note and up to 2 alternatives", () => {
    const out = parseHint('{"corrected":"I went to Da Nang","note":"Dùng quá khứ.","alternatives":["a","b","c"]}');
    expect(out).toEqual({ corrected: "I went to Da Nang", note: "Dùng quá khứ.", alternatives: ["a", "b"] });
  });
  it("rejects missing corrected or note", () => {
    expect(() => parseHint('{"corrected":"x"}')).toThrow();
    expect(() => parseHint('{"note":"x"}')).toThrow();
  });
});

describe("suggest", () => {
  it("mentions the current goal when given", () => {
    const p = buildSuggestPrompt({ setup: ROLE, currentGoal: "Xin thanh toán", summary: "", window: [{ role: "ai", text: "Anything else?" }] });
    expect(p).toContain("Xin thanh toán");
    expect(p).toContain("Anything else?");
  });
  it("parses 2-3 options, rejects fewer than 2", () => {
    expect(parseSuggest('{"options":["a","b","c","d"]}')).toEqual(["a", "b", "c"]);
    expect(() => parseSuggest('{"options":["a"]}')).toThrow();
  });
});

describe("condense", () => {
  it("includes the previous summary and the messages", () => {
    const p = buildCondensePrompt({ previousSummary: "Old.", messages: [{ role: "user", text: "Hello" }] });
    expect(p).toContain("Old.");
    expect(p).toContain("Learner: Hello");
  });
  it("parses the summary, rejects empty", () => {
    expect(parseCondense('{"summary":"Short."}')).toBe("Short.");
    expect(() => parseCondense('{"summary":""}')).toThrow();
  });
});

describe("translate", () => {
  it("parses vi, rejects empty", () => {
    expect(parseConversationTranslation('{"vi":"Xin chào"}')).toBe("Xin chào");
    expect(() => parseConversationTranslation('{"vi":""}')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/conversationPrompts.test.ts`
Expected: FAIL (cannot resolve `./conversationPrompts`).

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/conversationPrompts.ts`:

```ts
import { InterviewAiError, parseJson, str, strList } from "./interviewPrompts";
import type {
  ConversationHint,
  ConversationLevel,
  ConversationMessage,
  ConversationSetup,
} from "./conversationTypes";

const LEVEL_GUIDE: Record<ConversationLevel, string> = {
  A2: "CEFR A2 — very simple sentences, the most common words, present and simple past only",
  B1: "CEFR B1 — everyday vocabulary, simple connected sentences, common tenses",
  B2: "CEFR B2 — fairly natural speech, idioms are fine, varied grammar",
  C1: "CEFR C1 — fluent, nuanced, idiomatic speech",
};

export function formatTranscript(messages: ConversationMessage[]): string {
  return messages.map((m) => `${m.role === "ai" ? "AI" : "Learner"}: ${m.text}`).join("\n");
}

function describeSetup(setup: ConversationSetup): string {
  const lines = [`Learner level: ${LEVEL_GUIDE[setup.level]}`];
  if (setup.mode === "roleplay") {
    lines.push(`Mode: role-play. Scenario: ${setup.topic}`);
    lines.push(`You play: ${setup.persona ?? "a friendly conversation partner"}`);
    lines.push(`Learner goals (numbered from 0):\n${setup.goals.map((g, i) => `${i}. ${g}`).join("\n")}`);
  } else {
    lines.push(`Mode: free conversation. Topic: ${setup.topic}`);
  }
  return lines.join("\n");
}

export function buildScenarioPrompt(description: string, level: ConversationLevel): string {
  return `You design English speaking role-plays for a Vietnamese learner.

Learner level: ${LEVEL_GUIDE[level]}
Situation the learner wants to practise: ${description.trim().slice(0, 600)}

Return ONLY a JSON object, no prose:
{"persona": "...", "goals": ["...", "...", "..."]}

- "persona": in English, one sentence: who the AI plays and how they behave (e.g. "A friendly waiter at an Italian restaurant who speaks clearly").
- "goals": 3 or 4 short goals IN VIETNAMESE (max 12 words each) the learner should accomplish, in the order they would naturally happen. Concrete and checkable.`;
}

export function parseScenario(raw: string): { persona: string; goals: string[] } {
  const json = parseJson(raw);
  const persona = str(json.persona);
  const goals = strList(json.goals).slice(0, 4);
  if (!persona || goals.length < 3) throw new InterviewAiError("AI không dựng được tình huống.");
  return { persona, goals };
}

export function buildOpeningPrompt(setup: ConversationSetup): string {
  const how =
    setup.mode === "roleplay"
      ? "Stay fully in character and start the scene naturally (a greeting plus a first question or prompt)."
      : "Give a short friendly greeting plus ONE open question about the topic.";
  return `You are a friendly English conversation partner.

${describeSetup(setup)}

Write the FIRST thing you say to start the conversation. ${how} 1–2 short sentences, at the learner's level.

Return ONLY a JSON object: {"say": "..."}`;
}

export function parseOpening(raw: string): string {
  const say = str(parseJson(raw).say);
  if (!say) throw new InterviewAiError("AI không mở đầu được cuộc trò chuyện.");
  return say;
}

export interface ReplyInput {
  setup: ConversationSetup;
  summary: string;
  window: ConversationMessage[];
  goalsDone: number[];
  offerEnd: boolean;
  mustClose: boolean;
}

export function buildReplyPrompt(input: ReplyInput): string {
  const { setup } = input;
  const parts = [
    "You are a friendly English conversation partner helping a Vietnamese learner practise speaking.",
    describeSetup(setup),
  ];
  if (input.summary.trim()) parts.push(`Summary of the earlier conversation:\n${input.summary.trim()}`);
  parts.push(`Recent messages:\n${formatTranscript(input.window)}`);

  const rules = [
    "Reply in 1–3 short sentences, with vocabulary and grammar at the learner's level.",
    "End with a question or an opening that invites the learner to keep talking, unless you are closing.",
    "NEVER correct the learner's mistakes during the chat; just respond naturally to what they meant.",
  ];
  if (setup.mode === "roleplay") {
    rules.push("Stay in character the whole time; never mention that this is practice.");
    rules.push(
      `Goals already completed: [${input.goalsDone.join(", ")}]. In "goalsDone", list the indexes of goals the learner completed in THEIR LATEST message and that are not already completed.`
    );
    rules.push("If all goals are now complete, end the scene with a natural closing line (no question).");
  }
  if (input.mustClose) {
    rules.push("The conversation must end now: say a warm closing line (no question).");
  } else if (input.offerEnd) {
    rules.push('We have chatted for a while: after replying, add a short offer such as "Shall we wrap up here?" and set "suggestEnd" to true.');
  }
  parts.push(`Rules:\n- ${rules.join("\n- ")}`);
  parts.push(
    setup.mode === "roleplay"
      ? 'Return ONLY a JSON object: {"say": "...", "goalsDone": [0]}'
      : 'Return ONLY a JSON object: {"say": "...", "suggestEnd": false}'
  );
  return parts.join("\n\n");
}

export function parseReply(raw: string, goalCount: number): { say: string; goalsDone: number[]; suggestEnd: boolean } {
  const json = parseJson(raw);
  const say = str(json.say);
  if (!say) throw new InterviewAiError("AI chưa trả lời được.");
  const done = Array.isArray(json.goalsDone)
    ? json.goalsDone.filter((n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < goalCount)
    : [];
  return { say, goalsDone: [...new Set(done)], suggestEnd: json.suggestEnd === true };
}

export interface HintInput {
  setup: ConversationSetup;
  userText: string;
  previousAi: string;
}

export function buildHintPrompt(input: HintInput): string {
  return `You are an English teacher giving brief feedback to a Vietnamese learner.

${describeSetup(input.setup)}

The AI said: "${input.previousAi}"
The learner replied: "${input.userText}"

Return ONLY a JSON object, no prose:
{"corrected": "...", "note": "...", "alternatives": ["..."]}

- "corrected": the learner's sentence(s) with the MINIMUM edits needed for correct, natural English. Keep their meaning and as many of their words as possible. If it is already correct, repeat it unchanged.
- "note": in VIETNAMESE, 1–2 short sentences explaining the main fixes (or praise if nothing to fix).
- "alternatives": 0–2 more natural ways to say the same thing, in English.`;
}

export function parseHint(raw: string): ConversationHint {
  const json = parseJson(raw);
  const corrected = str(json.corrected);
  const note = str(json.note);
  if (!corrected || !note) throw new InterviewAiError("AI không đưa ra được gợi ý sửa.");
  return { corrected, note, alternatives: strList(json.alternatives).slice(0, 2) };
}

export interface SuggestInput {
  setup: ConversationSetup;
  currentGoal: string | null;
  summary: string;
  window: ConversationMessage[];
}

export function buildSuggestPrompt(input: SuggestInput): string {
  const goal = input.currentGoal ? `The learner is currently working on this goal: ${input.currentGoal}\n` : "";
  const summary = input.summary.trim() ? `Summary of the earlier conversation:\n${input.summary.trim()}\n\n` : "";
  return `You help a Vietnamese learner who is stuck and does not know what to say next.

${describeSetup(input.setup)}
${goal}
${summary}Recent messages:
${formatTranscript(input.window)}

Suggest 2 or 3 different things the learner could say next, as natural English replies at their level (1–2 sentences each). Do not repeat what they already said.

Return ONLY a JSON object: {"options": ["...", "..."]}`;
}

export function parseSuggest(raw: string): string[] {
  const options = strList(parseJson(raw).options).slice(0, 3);
  if (options.length < 2) throw new InterviewAiError("AI không gợi ý được câu trả lời.");
  return options;
}

export interface CondenseInput {
  previousSummary: string;
  messages: ConversationMessage[];
}

export function buildCondensePrompt(input: CondenseInput): string {
  return `Summarise the older part of an English practice conversation so the chat can continue with less context.

${input.previousSummary.trim() ? `Existing summary:\n${input.previousSummary.trim()}\n\n` : ""}New messages to fold in:
${formatTranscript(input.messages)}

Write ONE updated summary in English, max 600 characters: the topics covered, key facts the learner shared about themselves, and (for role-plays) what has been agreed or done so far.

Return ONLY a JSON object: {"summary": "..."}`;
}

export function parseCondense(raw: string): string {
  const summary = str(parseJson(raw).summary);
  if (!summary) throw new InterviewAiError("AI không tóm tắt được hội thoại.");
  return summary;
}

export function buildConversationTranslatePrompt(text: string): string {
  return `Translate this English message into natural Vietnamese.

"${text}"

Return ONLY a JSON object: {"vi": "..."}`;
}

export function parseConversationTranslation(raw: string): string {
  const vi = str(parseJson(raw).vi);
  if (!vi) throw new InterviewAiError("AI không dịch được tin nhắn.");
  return vi;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/conversationPrompts.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`  (Expected: no errors)

```bash
git add apps/web/src/lib/conversationPrompts.ts apps/web/src/lib/conversationPrompts.test.ts
git commit -m "feat(web/conversation): chat prompts and parsers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: History window helpers (and spec amendment for the window)

**Files:**
- Create: `apps/web/src/lib/conversationHistory.ts`
- Test: `apps/web/src/lib/conversationHistory.test.ts`
- Modify: `docs/superpowers/specs/2026-10-09-conversation-practice-design.md` (§4.3, §5, §9)

**Interfaces:**
- Consumes: `ConversationMessage`, `RECENT_WINDOW`, `CONDENSE_THRESHOLD` from `./conversationTypes`.
- Produces:
  - `unsummarizedWindow(messages: ConversationMessage[], summarizedCount: number): ConversationMessage[]` — everything not yet folded into the summary (this is what `reply` receives, so there is never a gap between summary and window).
  - `shouldCondense(messageCount: number, summarizedCount: number): boolean`
  - `planCondense(messages: ConversationMessage[], summarizedCount: number): { toFold: ConversationMessage[]; newCount: number } | null` — `newCount` is an absolute index into `messages`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/conversationHistory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { planCondense, shouldCondense, unsummarizedWindow } from "./conversationHistory";
import type { ConversationMessage } from "./conversationTypes";

function msgs(n: number): ConversationMessage[] {
  return Array.from({ length: n }, (_, i) => ({ role: i % 2 === 0 ? "ai" : "user", text: `m${i}` }));
}

describe("unsummarizedWindow", () => {
  it("returns everything when nothing is summarized", () => {
    expect(unsummarizedWindow(msgs(5), 0)).toHaveLength(5);
  });
  it("skips messages already folded into the summary", () => {
    const out = unsummarizedWindow(msgs(20), 12);
    expect(out).toHaveLength(8);
    expect(out[0].text).toBe("m12");
  });
});

describe("shouldCondense / planCondense", () => {
  it("does not condense below 16 unsummarized messages", () => {
    expect(shouldCondense(15, 0)).toBe(false);
    expect(planCondense(msgs(15), 0)).toBeNull();
  });
  it("condenses at 16, folding all but the last 8", () => {
    expect(shouldCondense(16, 0)).toBe(true);
    const plan = planCondense(msgs(16), 0);
    expect(plan?.newCount).toBe(8);
    expect(plan?.toFold).toHaveLength(8);
    expect(plan?.toFold[7].text).toBe("m7");
  });
  it("counts only messages after the previous fold", () => {
    expect(shouldCondense(23, 8)).toBe(false);
    expect(shouldCondense(24, 8)).toBe(true);
    const plan = planCondense(msgs(24), 8);
    expect(plan?.newCount).toBe(16);
    expect(plan?.toFold.map((m) => m.text)).toEqual(msgs(24).slice(8, 16).map((m) => m.text));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/conversationHistory.test.ts`
Expected: FAIL (cannot resolve module).

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/conversationHistory.ts`:

```ts
import { CONDENSE_THRESHOLD, RECENT_WINDOW, type ConversationMessage } from "./conversationTypes";

/** Messages not yet folded into `summary`. The summary covers
 * messages[0..summarizedCount), so summary + this window is the whole chat. */
export function unsummarizedWindow(messages: ConversationMessage[], summarizedCount: number): ConversationMessage[] {
  return messages.slice(summarizedCount);
}

export function shouldCondense(messageCount: number, summarizedCount: number): boolean {
  return messageCount - summarizedCount >= CONDENSE_THRESHOLD;
}

/** Folds everything except the last RECENT_WINDOW messages. `newCount` is an
 * absolute index, so it stays valid even if more messages arrive while the
 * condense call is in flight. */
export function planCondense(
  messages: ConversationMessage[],
  summarizedCount: number
): { toFold: ConversationMessage[]; newCount: number } | null {
  if (!shouldCondense(messages.length, summarizedCount)) return null;
  const newCount = messages.length - RECENT_WINDOW;
  return { toFold: messages.slice(summarizedCount, newCount), newCount };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/conversationHistory.test.ts`
Expected: PASS (3 tests in 2 describes).

- [ ] **Step 5: Amend the spec for the window rule**

In `docs/superpowers/specs/2026-10-09-conversation-practice-design.md`:

1. In §4.3 step 2, replace `with: setup (mode, topic, level, persona, goals), \`summary\`, and the last **8** messages.` with `with: setup (mode, topic, level, persona, goals), \`summary\`, and every message not yet folded into the summary (\`messages.slice(summarizedCount)\`, 8–15 messages in steady state).`
2. In §4.3 step 4, replace `fires a background \`condense\` call that folds the messages older than the last 8 into \`summary\` (updating \`summarizedCount\`).` with `fires a background \`condense\` call that folds \`messages[summarizedCount .. length-8)\` into \`summary\` and sets \`summarizedCount = length - 8\` (an absolute index, safe if messages arrive meanwhile).`
3. In §5 table, `reply` row input: replace `last 8 messages` with `unsummarized messages`.
4. In §9 Vitest line, replace `window of last 8, condense trigger at ≥ 16 unsummarized` with `unsummarized window, condense trigger at ≥ 16 unsummarized, folds all but the last 8`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/conversationHistory.ts apps/web/src/lib/conversationHistory.test.ts docs/superpowers/specs/2026-10-09-conversation-practice-design.md
git commit -m "feat(web/conversation): context window and condense helpers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Firestore session persistence

**Files:**
- Create: `apps/web/src/lib/conversationSessions.ts`
- Test: `apps/web/src/lib/conversationSessions.test.ts`

**Interfaces:**
- Consumes: `getFirebaseDb` from `./firebase`; types from `./conversationTypes`.
- Produces:
  - `type ConversationProgress = Partial<Pick<ConversationSession, "messages" | "goalsDone" | "summary" | "summarizedCount">>`
  - `createConversationSession(uid: string, setup: ConversationSetup): Promise<string>`
  - `getConversationSession(uid: string, id: string): Promise<ConversationSession | null>`
  - `saveConversationProgress(uid: string, id: string, patch: ConversationProgress): Promise<void>`
  - `completeConversationSession(uid: string, id: string, report: ConversationReport | null): Promise<void>`
  - `deleteConversationSession(uid: string, id: string): Promise<void>`
  - `listRecentConversationSessions(uid: string, max?: number): Promise<ConversationSession[]>` (completed only, newest first)

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/conversationSessions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import {
  completeConversationSession,
  createConversationSession,
  deleteConversationSession,
  getConversationSession,
  listRecentConversationSessions,
  saveConversationProgress,
} from "./conversationSessions";
import type { ConversationSetup } from "./conversationTypes";

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

const SETUP: ConversationSetup = {
  mode: "topic", topic: "Travel", level: "B1", voice: "female1",
  speakAloud: true, reviewTranscript: true, persona: null, goals: [],
};

beforeEach(() => vi.clearAllMocks());

describe("conversationSessions", () => {
  it("creates an in_progress session with empty chat state and returns its id", async () => {
    vi.mocked(doc).mockReturnValue({ id: "new-id" } as never);
    const id = await createConversationSession("u1", SETUP);
    expect(id).toBe("new-id");
    expect(setDoc).toHaveBeenCalledWith(
      { id: "new-id" },
      expect.objectContaining({
        id: "new-id", status: "in_progress", setup: SETUP,
        summary: "", summarizedCount: 0, messages: [], goalsDone: [],
        report: null, reportError: false, createdAt: expect.any(String),
      })
    );
  });

  it("returns null for a missing session and the session with its id otherwise", async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false } as never);
    await expect(getConversationSession("u1", "x")).resolves.toBeNull();
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => true, id: "s1", data: () => ({ summary: "S" }) } as never);
    await expect(getConversationSession("u1", "s1")).resolves.toMatchObject({ id: "s1", summary: "S" });
  });

  it("saves a progress patch as-is", async () => {
    await saveConversationProgress("u1", "s1", { messages: [{ role: "ai", text: "Hi" }], goalsDone: [0] });
    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), { messages: [{ role: "ai", text: "Hi" }], goalsDone: [0] });
  });

  it("completes with a report, or flags reportError when the report is null", async () => {
    const report = { overall: 7 } as never;
    await completeConversationSession("u1", "s1", report);
    expect(updateDoc).toHaveBeenLastCalledWith(expect.anything(), { status: "completed", report, reportError: false });
    await completeConversationSession("u1", "s1", null);
    expect(updateDoc).toHaveBeenLastCalledWith(expect.anything(), { status: "completed", report: null, reportError: true });
  });

  it("deletes a session", async () => {
    await deleteConversationSession("u1", "s1");
    expect(deleteDoc).toHaveBeenCalled();
  });

  it("lists only completed sessions, capped at max", async () => {
    vi.mocked(getDocs).mockResolvedValue({
      docs: [
        { id: "a", data: () => ({ status: "completed" }) },
        { id: "b", data: () => ({ status: "in_progress" }) },
        { id: "c", data: () => ({ status: "completed" }) },
        { id: "d", data: () => ({ status: "completed" }) },
      ],
    } as never);
    const out = await listRecentConversationSessions("u1", 2);
    expect(out.map((s) => s.id)).toEqual(["a", "c"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/conversationSessions.test.ts`
Expected: FAIL (cannot resolve module).

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/conversationSessions.ts`:

```ts
import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc } from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import type { ConversationReport, ConversationSession, ConversationSetup } from "./conversationTypes";

export type ConversationProgress = Partial<
  Pick<ConversationSession, "messages" | "goalsDone" | "summary" | "summarizedCount">
>;

function sessionsCol(uid: string) {
  return collection(getFirebaseDb(), "users", uid, "conversation_sessions");
}

function sessionRef(uid: string, id: string) {
  return doc(getFirebaseDb(), "users", uid, "conversation_sessions", id);
}

export async function createConversationSession(uid: string, setup: ConversationSetup): Promise<string> {
  const ref = doc(sessionsCol(uid));
  const session: ConversationSession = {
    id: ref.id,
    createdAt: new Date().toISOString(),
    status: "in_progress",
    setup,
    summary: "",
    summarizedCount: 0,
    messages: [],
    goalsDone: [],
    report: null,
    reportError: false,
  };
  await setDoc(ref, session);
  return ref.id;
}

export async function getConversationSession(uid: string, id: string): Promise<ConversationSession | null> {
  const snap = await getDoc(sessionRef(uid, id));
  if (!snap.exists()) return null;
  return { ...(snap.data() as ConversationSession), id: snap.id };
}

// Called after every message with the full arrays — a closed tab still leaves
// every completed message gradable.
export async function saveConversationProgress(uid: string, id: string, patch: ConversationProgress): Promise<void> {
  await updateDoc(sessionRef(uid, id), patch);
}

export async function completeConversationSession(
  uid: string,
  id: string,
  report: ConversationReport | null
): Promise<void> {
  await updateDoc(sessionRef(uid, id), { status: "completed", report, reportError: report === null });
}

export async function deleteConversationSession(uid: string, id: string): Promise<void> {
  await deleteDoc(sessionRef(uid, id));
}

// Over-fetch then filter client-side: a single-field orderBy needs no
// composite index, and abandoned in_progress sessions are rare.
export async function listRecentConversationSessions(uid: string, max = 5): Promise<ConversationSession[]> {
  const snap = await getDocs(query(sessionsCol(uid), orderBy("createdAt", "desc"), limit(20)));
  return snap.docs
    .map((d) => ({ ...(d.data() as ConversationSession), id: d.id }))
    .filter((s) => s.status === "completed")
    .slice(0, max);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/conversationSessions.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/conversationSessions.ts apps/web/src/lib/conversationSessions.test.ts
git commit -m "feat(web/conversation): Firestore session persistence" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Conversation state machine

**Files:**
- Create: `apps/web/src/lib/conversationMachine.ts`
- Test: `apps/web/src/lib/conversationMachine.test.ts`

**Interfaces:**
- Consumes: `MAX_USER_TURNS`, `WRAP_UP_TURN`, `ConversationMode` from `./conversationTypes`.
- Produces (exact):
  - `type ConversationPhase = "warming" | "aiSpeaking" | "idle" | "recording" | "transcribing" | "sttError" | "review" | "aiThinking" | "replyError" | "grading"`
  - `type ConversationNotice = null | "opening_failed" | "empty_transcript" | "tts_failed"`
  - `interface ConversationState { phase; userTurns: number; segments: string[]; draft: string; notice; wrapUpOffered: boolean; final: boolean }`
  - `ConversationEvent` (all listed in the code below), `initialConversationState`, `conversationReducer(state, event)`
  - `joinSegments(segments: string[], draft: string): string` (trimmed, non-empty parts joined by a space)
  - `replyFlags(mode: ConversationMode, userTurns: number): { offerEnd: boolean; mustClose: boolean }`
  - `isScenarioComplete(goals: string[], goalsDone: number[]): boolean`

Behavior contract (the page in Task 10 relies on this): the page appends the user message **before** dispatching `SEND` or a non-review `TRANSCRIBED`; those events then move to `aiThinking` and increment `userTurns`. `REPLY_RECEIVED` carries `final` (close the session after the AI's last line is spoken) and `suggestEnd`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/conversationMachine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  conversationReducer as reduce,
  initialConversationState as init,
  isScenarioComplete,
  joinSegments,
  replyFlags,
  type ConversationState,
} from "./conversationMachine";

const at = (patch: Partial<ConversationState>): ConversationState => ({ ...init, ...patch });

describe("joinSegments", () => {
  it("trims and joins non-empty parts", () => {
    expect(joinSegments([" a ", "", "b"], " c ")).toBe("a b c");
    expect(joinSegments([], "  ")).toBe("");
  });
});

describe("replyFlags", () => {
  it("offers wrap-up only in topic mode exactly at turn 12", () => {
    expect(replyFlags("topic", 11).offerEnd).toBe(false);
    expect(replyFlags("topic", 12).offerEnd).toBe(true);
    expect(replyFlags("topic", 13).offerEnd).toBe(false);
    expect(replyFlags("roleplay", 12).offerEnd).toBe(false);
  });
  it("must close from turn 30 in both modes", () => {
    expect(replyFlags("topic", 29).mustClose).toBe(false);
    expect(replyFlags("topic", 30).mustClose).toBe(true);
    expect(replyFlags("roleplay", 30).mustClose).toBe(true);
  });
});

describe("isScenarioComplete", () => {
  it("is true only when every goal index is done", () => {
    expect(isScenarioComplete(["a", "b"], [0])).toBe(false);
    expect(isScenarioComplete(["a", "b"], [0, 1])).toBe(true);
    expect(isScenarioComplete([], [])).toBe(false);
  });
});

describe("opening", () => {
  it("warming -> aiSpeaking on OPENING_READY; failure sets a notice and retry clears it", () => {
    expect(reduce(init, { type: "OPENING_READY" }).phase).toBe("aiSpeaking");
    const failed = reduce(init, { type: "OPENING_FAILED" });
    expect(failed.phase).toBe("warming");
    expect(failed.notice).toBe("opening_failed");
    expect(reduce(failed, { type: "RETRY_OPENING" }).notice).toBeNull();
  });
  it("resumes to idle, or straight to aiThinking when the last message was the user's", () => {
    expect(reduce(init, { type: "RESUME", userTurns: 3, needsReply: false })).toMatchObject({ phase: "idle", userTurns: 3 });
    expect(reduce(init, { type: "RESUME", userTurns: 3, needsReply: true })).toMatchObject({ phase: "aiThinking", userTurns: 3 });
  });
});

describe("speech", () => {
  it("aiSpeaking -> idle, noting a TTS failure", () => {
    expect(reduce(at({ phase: "aiSpeaking" }), { type: "SPEECH_ENDED" })).toMatchObject({ phase: "idle", notice: null });
    expect(reduce(at({ phase: "aiSpeaking" }), { type: "SPEECH_ENDED", ttsFailed: true }).notice).toBe("tts_failed");
  });
  it("goes to grading after the final AI line", () => {
    expect(reduce(at({ phase: "aiSpeaking", final: true }), { type: "SPEECH_ENDED" }).phase).toBe("grading");
  });
});

describe("typing and sending", () => {
  it("edits the draft in idle and review only", () => {
    expect(reduce(at({ phase: "idle" }), { type: "EDIT_DRAFT", text: "hi" }).draft).toBe("hi");
    expect(reduce(at({ phase: "review" }), { type: "EDIT_DRAFT", text: "hi" }).draft).toBe("hi");
    expect(reduce(at({ phase: "aiThinking" }), { type: "EDIT_DRAFT", text: "hi" }).draft).toBe("");
  });
  it("SEND moves to aiThinking, counts the turn and clears the composer", () => {
    const next = reduce(at({ phase: "idle", segments: ["a"], draft: "b", userTurns: 2 }), { type: "SEND" });
    expect(next).toMatchObject({ phase: "aiThinking", userTurns: 3, segments: [], draft: "" });
  });
  it("SEND is ignored when there is nothing to send or the phase is wrong", () => {
    expect(reduce(at({ phase: "idle", draft: "  " }), { type: "SEND" }).phase).toBe("idle");
    expect(reduce(at({ phase: "aiThinking", draft: "x" }), { type: "SEND" }).phase).toBe("aiThinking");
  });
});

describe("+ Nói thêm (ADD_SEGMENT)", () => {
  it("moves the draft into segments and returns to idle", () => {
    const next = reduce(at({ phase: "review", draft: " one ", segments: [] }), { type: "ADD_SEGMENT" });
    expect(next).toMatchObject({ phase: "idle", segments: ["one"], draft: "" });
  });
  it("ignores an empty draft", () => {
    expect(reduce(at({ phase: "idle", draft: " " }), { type: "ADD_SEGMENT" }).segments).toEqual([]);
  });
});

describe("recording and transcription", () => {
  it("START_RECORDING from idle keeps a typed draft as a segment", () => {
    const next = reduce(at({ phase: "idle", draft: "typed" }), { type: "START_RECORDING" });
    expect(next).toMatchObject({ phase: "recording", segments: ["typed"], draft: "" });
  });
  it("START_RECORDING from review discards the draft (re-record) but keeps segments", () => {
    const next = reduce(at({ phase: "review", draft: "bad", segments: ["kept"] }), { type: "START_RECORDING" });
    expect(next).toMatchObject({ phase: "recording", segments: ["kept"], draft: "" });
  });
  it("recording -> transcribing -> review with a draft when review is on", () => {
    const t = reduce(at({ phase: "recording" }), { type: "STOP_RECORDING" });
    expect(t.phase).toBe("transcribing");
    expect(reduce(t, { type: "TRANSCRIBED", text: " hello ", review: true })).toMatchObject({ phase: "review", draft: "hello" });
  });
  it("sends straight to the AI when review is off", () => {
    const next = reduce(at({ phase: "transcribing", userTurns: 1, segments: ["a"] }), { type: "TRANSCRIBED", text: "b", review: false });
    expect(next).toMatchObject({ phase: "aiThinking", userTurns: 2, segments: [], draft: "" });
  });
  it("an empty transcript returns to idle with a notice", () => {
    expect(reduce(at({ phase: "transcribing" }), { type: "TRANSCRIBED", text: " ", review: true })).toMatchObject({
      phase: "idle", notice: "empty_transcript",
    });
  });
  it("STT failure can be retried", () => {
    const failed = reduce(at({ phase: "transcribing" }), { type: "TRANSCRIBE_FAILED" });
    expect(failed.phase).toBe("sttError");
    expect(reduce(failed, { type: "RETRY_TRANSCRIBE" }).phase).toBe("transcribing");
  });
});

describe("AI reply", () => {
  it("aiThinking -> aiSpeaking, recording final and the wrap-up offer", () => {
    const next = reduce(at({ phase: "aiThinking" }), { type: "REPLY_RECEIVED", final: false, suggestEnd: true });
    expect(next).toMatchObject({ phase: "aiSpeaking", final: false, wrapUpOffered: true });
    expect(reduce(at({ phase: "aiThinking" }), { type: "REPLY_RECEIVED", final: true, suggestEnd: false }).final).toBe(true);
  });
  it("a failed reply can be retried; the wrap-up chip can be dismissed", () => {
    const failed = reduce(at({ phase: "aiThinking" }), { type: "REPLY_FAILED" });
    expect(failed.phase).toBe("replyError");
    expect(reduce(failed, { type: "RETRY_REPLY" }).phase).toBe("aiThinking");
    expect(reduce(at({ wrapUpOffered: true }), { type: "DISMISS_WRAP_UP" }).wrapUpOffered).toBe(false);
  });
});

describe("END", () => {
  it("goes to grading from any phase and is idempotent", () => {
    for (const phase of ["warming", "idle", "recording", "review", "aiThinking", "replyError", "aiSpeaking"] as const) {
      expect(reduce(at({ phase }), { type: "END" }).phase).toBe("grading");
    }
    const grading = at({ phase: "grading" });
    expect(reduce(grading, { type: "END" })).toBe(grading);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/conversationMachine.test.ts`
Expected: FAIL (cannot resolve module).

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/conversationMachine.ts`:

```ts
import { MAX_USER_TURNS, WRAP_UP_TURN, type ConversationMode } from "./conversationTypes";

export type ConversationPhase =
  | "warming"
  | "aiSpeaking"
  | "idle"
  | "recording"
  | "transcribing"
  | "sttError"
  | "review"
  | "aiThinking"
  | "replyError"
  | "grading";

export type ConversationNotice = null | "opening_failed" | "empty_transcript" | "tts_failed";

export interface ConversationState {
  phase: ConversationPhase;
  /** User messages sent so far. */
  userTurns: number;
  /** Earlier "+ Nói thêm" segments of the turn being composed. */
  segments: string[];
  /** Text currently in the composer (typed, or a voice transcript). */
  draft: string;
  notice: ConversationNotice;
  wrapUpOffered: boolean;
  /** The AI's current line is the last one: grade after it is spoken. */
  final: boolean;
}

export type ConversationEvent =
  | { type: "OPENING_READY" }
  | { type: "OPENING_FAILED" }
  | { type: "RETRY_OPENING" }
  | { type: "RESUME"; userTurns: number; needsReply: boolean }
  | { type: "SPEECH_ENDED"; ttsFailed?: boolean }
  | { type: "START_RECORDING" }
  | { type: "STOP_RECORDING" }
  | { type: "TRANSCRIBED"; text: string; review: boolean }
  | { type: "TRANSCRIBE_FAILED" }
  | { type: "RETRY_TRANSCRIBE" }
  | { type: "EDIT_DRAFT"; text: string }
  | { type: "ADD_SEGMENT" }
  | { type: "SEND" }
  | { type: "REPLY_RECEIVED"; final: boolean; suggestEnd: boolean }
  | { type: "REPLY_FAILED" }
  | { type: "RETRY_REPLY" }
  | { type: "DISMISS_WRAP_UP" }
  | { type: "END" };

export const initialConversationState: ConversationState = {
  phase: "warming",
  userTurns: 0,
  segments: [],
  draft: "",
  notice: null,
  wrapUpOffered: false,
  final: false,
};

export function joinSegments(segments: string[], draft: string): string {
  return [...segments, draft]
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(" ");
}

export function replyFlags(mode: ConversationMode, userTurns: number): { offerEnd: boolean; mustClose: boolean } {
  return { offerEnd: mode === "topic" && userTurns === WRAP_UP_TURN, mustClose: userTurns >= MAX_USER_TURNS };
}

export function isScenarioComplete(goals: string[], goalsDone: number[]): boolean {
  return goals.length > 0 && goals.every((_, i) => goalsDone.includes(i));
}

function sent(state: ConversationState): ConversationState {
  return { ...state, phase: "aiThinking", userTurns: state.userTurns + 1, segments: [], draft: "", notice: null };
}

export function conversationReducer(state: ConversationState, event: ConversationEvent): ConversationState {
  const { phase } = state;
  switch (event.type) {
    case "OPENING_READY":
      return phase === "warming" ? { ...state, phase: "aiSpeaking", notice: null } : state;
    case "OPENING_FAILED":
      return phase === "warming" ? { ...state, notice: "opening_failed" } : state;
    case "RETRY_OPENING":
      return phase === "warming" ? { ...state, notice: null } : state;
    case "RESUME":
      return phase === "warming"
        ? { ...state, phase: event.needsReply ? "aiThinking" : "idle", userTurns: event.userTurns }
        : state;
    case "SPEECH_ENDED":
      if (phase !== "aiSpeaking") return state;
      return state.final
        ? { ...state, phase: "grading", notice: null }
        : { ...state, phase: "idle", notice: event.ttsFailed ? "tts_failed" : null };
    case "START_RECORDING": {
      if (phase === "idle") {
        const typed = state.draft.trim();
        return { ...state, phase: "recording", segments: typed ? [...state.segments, typed] : state.segments, draft: "", notice: null };
      }
      return phase === "sttError" || phase === "review" ? { ...state, phase: "recording", draft: "", notice: null } : state;
    }
    case "STOP_RECORDING":
      return phase === "recording" ? { ...state, phase: "transcribing" } : state;
    case "TRANSCRIBED": {
      if (phase !== "transcribing") return state;
      const text = event.text.trim();
      if (!text) return { ...state, phase: "idle", notice: "empty_transcript" };
      return event.review ? { ...state, phase: "review", draft: text, notice: null } : sent(state);
    }
    case "TRANSCRIBE_FAILED":
      return phase === "transcribing" ? { ...state, phase: "sttError" } : state;
    case "RETRY_TRANSCRIBE":
      return phase === "sttError" ? { ...state, phase: "transcribing" } : state;
    case "EDIT_DRAFT":
      return phase === "idle" || phase === "review" ? { ...state, draft: event.text, notice: null } : state;
    case "ADD_SEGMENT": {
      const text = state.draft.trim();
      if ((phase !== "idle" && phase !== "review") || !text) return state;
      return { ...state, phase: "idle", segments: [...state.segments, text], draft: "", notice: null };
    }
    case "SEND":
      return (phase === "idle" || phase === "review") && joinSegments(state.segments, state.draft) ? sent(state) : state;
    case "REPLY_RECEIVED":
      return phase === "aiThinking"
        ? { ...state, phase: "aiSpeaking", final: event.final, wrapUpOffered: state.wrapUpOffered || event.suggestEnd }
        : state;
    case "REPLY_FAILED":
      return phase === "aiThinking" ? { ...state, phase: "replyError" } : state;
    case "RETRY_REPLY":
      return phase === "replyError" ? { ...state, phase: "aiThinking" } : state;
    case "DISMISS_WRAP_UP":
      return { ...state, wrapUpOffered: false };
    case "END":
      return phase === "grading" ? state : { ...state, phase: "grading" };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/conversationMachine.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`  (Expected: no errors)

```bash
git add apps/web/src/lib/conversationMachine.ts apps/web/src/lib/conversationMachine.test.ts
git commit -m "feat(web/conversation): turn state machine" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Report prompt and parser

**Files:**
- Create: `apps/web/src/lib/conversationReportPrompt.ts`
- Test: `apps/web/src/lib/conversationReportPrompt.test.ts`

**Interfaces:**
- Consumes: `InterviewAiError`, `parseJson`, `str` from `./interviewPrompts`; `formatTranscript` is NOT used (indexes needed); types from `./conversationTypes`.
- Produces:
  - `userMessageIndexes(messages: ConversationMessage[]): number[]` — absolute indexes of user messages with non-empty text.
  - `buildConversationReportPrompt(setup: ConversationSetup, summary: string, messages: ConversationMessage[], goalsDone: number[]): string`
  - `parseConversationReport(raw: string, userIndexes: number[], hasGoals: boolean): ConversationReport` (throws `InterviewAiError` on invalid shape; `goalResult` key present only when `hasGoals`).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/conversationReportPrompt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildConversationReportPrompt, parseConversationReport, userMessageIndexes } from "./conversationReportPrompt";
import type { ConversationMessage, ConversationSetup } from "./conversationTypes";

const SETUP: ConversationSetup = {
  mode: "roleplay", topic: "Restaurant", level: "B1", voice: "female1",
  speakAloud: true, reviewTranscript: true, persona: "A waiter", goals: ["Gọi đồ uống", "Xin thanh toán"],
};
const MESSAGES: ConversationMessage[] = [
  { role: "ai", text: "Welcome!" },
  { role: "user", text: "I want water" },
  { role: "ai", text: "Sure." },
  { role: "user", text: "", },
  { role: "user", text: "The bill please", hint: { corrected: "The bill, please.", note: "n", alternatives: [] } },
];

describe("userMessageIndexes", () => {
  it("returns indexes of non-empty user messages", () => {
    expect(userMessageIndexes(MESSAGES)).toEqual([1, 4]);
  });
});

describe("buildConversationReportPrompt", () => {
  it("numbers messages by absolute index and includes goals and cached hints", () => {
    const p = buildConversationReportPrompt(SETUP, "Earlier they ordered.", MESSAGES, [0]);
    expect(p).toContain("[1] Learner: I want water");
    expect(p).toContain("[4] Learner: The bill please");
    expect(p).toContain('earlier hint: "The bill, please."');
    expect(p).toContain("0. Gọi đồ uống (done)");
    expect(p).toContain("1. Xin thanh toán (not done)");
    expect(p).toContain("Earlier they ordered.");
  });
  it("omits the goals block in topic mode", () => {
    const p = buildConversationReportPrompt({ ...SETUP, mode: "topic", persona: null, goals: [] }, "", MESSAGES, []);
    expect(p).not.toContain("not done");
  });
});

const VALID = {
  overall: 7.24,
  criteria: { grammar: 6.5, vocabulary: 7.5, fluency: 7, coherence: 8 },
  criteriaNotes: { grammar: "g", vocabulary: "v", fluency: "f", coherence: "c" },
  recurringMistakes: [{ pattern: "Quên quá khứ", examples: [{ said: "I go", better: "I went" }, { said: "", better: "x" }] }],
  corrections: [
    { messageIndex: 1, said: "I want water", corrected: "I would like water", note: "Lịch sự hơn" },
    { messageIndex: 2, said: "AI line", corrected: "x", note: "n" },
  ],
  phrases: [{ text: "I would like", meaning: "tôi muốn", example: "I would like some water." }, { text: "", meaning: "m", example: "e" }],
  goalResult: { achieved: true, comment: "Đạt cả hai mục tiêu." },
};

describe("parseConversationReport", () => {
  it("parses a valid report, rounding scores and filtering bad rows", () => {
    const r = parseConversationReport(JSON.stringify(VALID), [1, 4], true);
    expect(r.overall).toBe(7.2);
    expect(r.criteria.coherence).toBe(8);
    expect(r.recurringMistakes[0].examples).toEqual([{ said: "I go", better: "I went" }]);
    expect(r.corrections).toHaveLength(1);
    expect(r.corrections[0].messageIndex).toBe(1);
    expect(r.phrases).toEqual([{ text: "I would like", meaning: "tôi muốn", example: "I would like some water." }]);
    expect(r.goalResult).toEqual({ achieved: true, comment: "Đạt cả hai mục tiêu." });
  });
  it("omits goalResult entirely when there are no goals", () => {
    const r = parseConversationReport(JSON.stringify(VALID), [1, 4], false);
    expect("goalResult" in r).toBe(false);
  });
  it("clamps scores to 0-10 and caps list sizes", () => {
    const big = {
      ...VALID, overall: 14,
      recurringMistakes: Array.from({ length: 5 }, (_, i) => ({ pattern: `p${i}`, examples: [] })),
      phrases: Array.from({ length: 12 }, (_, i) => ({ text: `t${i}`, meaning: "m", example: "e" })),
    };
    const r = parseConversationReport(JSON.stringify(big), [1], false);
    expect(r.overall).toBe(10);
    expect(r.recurringMistakes).toHaveLength(3);
    expect(r.phrases).toHaveLength(8);
  });
  it("throws on invalid JSON or non-numeric scores", () => {
    expect(() => parseConversationReport("nope", [1], false)).toThrow();
    expect(() => parseConversationReport(JSON.stringify({ ...VALID, overall: "high" }), [1], false)).toThrow();
    expect(() => parseConversationReport(JSON.stringify({ ...VALID, criteria: { grammar: 5 } }), [1], false)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/conversationReportPrompt.test.ts`
Expected: FAIL (cannot resolve module).

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/conversationReportPrompt.ts`:

```ts
import { InterviewAiError, parseJson, str } from "./interviewPrompts";
import {
  CONVERSATION_CRITERIA,
  type ConversationCorrection,
  type ConversationCriterionKey,
  type ConversationMessage,
  type ConversationMistake,
  type ConversationPhrase,
  type ConversationReport,
  type ConversationSetup,
} from "./conversationTypes";

export function userMessageIndexes(messages: ConversationMessage[]): number[] {
  return messages.flatMap((m, i) => (m.role === "user" && m.text.trim() ? [i] : []));
}

export function buildConversationReportPrompt(
  setup: ConversationSetup,
  summary: string,
  messages: ConversationMessage[],
  goalsDone: number[]
): string {
  const lines = messages
    .map((m, i) => {
      if (m.role === "ai") return `[${i}] AI: ${m.text}`;
      const hint = m.hint ? `\n    (earlier hint given to the learner: "${m.hint.corrected}")` : "";
      return `[${i}] Learner: ${m.text}${hint}`;
    })
    .join("\n");
  const goals =
    setup.mode === "roleplay"
      ? `\nRole-play goals:\n${setup.goals.map((g, i) => `${i}. ${g} (${goalsDone.includes(i) ? "done" : "not done"})`).join("\n")}\n`
      : "";
  const goalJson = setup.mode === "roleplay" ? ',\n  "goalResult": {"achieved": true, "comment": "..."}' : "";
  return `You are an English speaking coach reviewing a practice conversation by a Vietnamese learner (level ${setup.level}).

Mode: ${setup.mode === "roleplay" ? `role-play — ${setup.topic}` : `free conversation — ${setup.topic}`}
${goals}${summary.trim() ? `\nSummary of the earlier part of the conversation:\n${summary.trim()}\n` : ""}
Conversation (message numbers in brackets). The learner's messages may come from speech transcription, so ignore punctuation and capitalisation:
${lines}

Assess ONLY the learner's own messages. Return ONLY a JSON object, no prose:
{
  "overall": 7.0,
  "criteria": {"grammar": 7, "vocabulary": 7, "fluency": 7, "coherence": 7},
  "criteriaNotes": {"grammar": "...", "vocabulary": "...", "fluency": "...", "coherence": "..."},
  "recurringMistakes": [{"pattern": "...", "examples": [{"said": "...", "better": "..."}]}],
  "corrections": [{"messageIndex": 1, "said": "...", "corrected": "...", "note": "..."}],
  "phrases": [{"text": "...", "meaning": "...", "example": "..."}]${goalJson}
}

- Scores are 0–10 (one decimal for "overall"). Pronunciation cannot be judged; do not mention it.
- "criteriaNotes", recurringMistakes "pattern", corrections "note" and "goalResult.comment" are in VIETNAMESE, one short sentence each.
- "recurringMistakes": at most 3 patterns that repeat; "said"/"better" are exact English quotes.
- "corrections": at most 8 of the most worthwhile fixes. "messageIndex" is the bracketed number of a Learner message; "said" is that message (or the relevant part) verbatim; "corrected" changes as little as possible. If a hint was already given for a message, stay consistent with it.
- "phrases": 4 to 8 useful English phrases for THIS learner to remember (natural alternatives to what they said, or good phrases from the AI). "meaning" is a short Vietnamese meaning; "example" is a short English sentence using the phrase.`;
}

function score(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new InterviewAiError("AI trả về điểm không hợp lệ.");
  return Math.round(Math.min(10, Math.max(0, n)) * 10) / 10;
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function parseConversationReport(raw: string, userIndexes: number[], hasGoals: boolean): ConversationReport {
  const json = parseJson(raw);
  const criteriaIn = objectOf(json.criteria);
  const notesIn = objectOf(json.criteriaNotes);
  const criteria = {} as Record<ConversationCriterionKey, number>;
  const criteriaNotes = {} as Record<ConversationCriterionKey, string>;
  for (const { key } of CONVERSATION_CRITERIA) {
    criteria[key] = score(criteriaIn[key]);
    criteriaNotes[key] = str(notesIn[key]);
  }

  const recurringMistakes: ConversationMistake[] = listOf(json.recurringMistakes)
    .map((item) => {
      const o = objectOf(item);
      const examples = listOf(o.examples)
        .map((e) => ({ said: str(objectOf(e).said), better: str(objectOf(e).better) }))
        .filter((e) => e.said && e.better);
      return { pattern: str(o.pattern), examples };
    })
    .filter((m) => m.pattern)
    .slice(0, 3);

  const corrections: ConversationCorrection[] = listOf(json.corrections)
    .map((item) => {
      const o = objectOf(item);
      return { messageIndex: o.messageIndex, said: str(o.said), corrected: str(o.corrected), note: str(o.note) };
    })
    .filter(
      (c): c is ConversationCorrection =>
        typeof c.messageIndex === "number" && userIndexes.includes(c.messageIndex) && !!c.said && !!c.corrected
    )
    .slice(0, 8);

  const phrases: ConversationPhrase[] = listOf(json.phrases)
    .map((item) => {
      const o = objectOf(item);
      return { text: str(o.text), meaning: str(o.meaning), example: str(o.example) };
    })
    .filter((p) => p.text)
    .slice(0, 8);

  const report: ConversationReport = {
    overall: score(json.overall),
    criteria,
    criteriaNotes,
    recurringMistakes,
    corrections,
    phrases,
  };
  if (hasGoals) {
    const g = objectOf(json.goalResult);
    report.goalResult = { achieved: g.achieved === true, comment: str(g.comment) };
  }
  return report;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/conversationReportPrompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`  (Expected: no errors)

```bash
git add apps/web/src/lib/conversationReportPrompt.ts apps/web/src/lib/conversationReportPrompt.test.ts
git commit -m "feat(web/conversation): report prompt and parser" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Sidebar entry

**Files:**
- Modify: `apps/web/src/components/shell/Sidebar.tsx:30`
- Modify: `apps/web/src/components/shell/Sidebar.test.tsx` (the "10 nav links" test and a new link test)

- [ ] **Step 1: Update the tests first**

In `apps/web/src/components/shell/Sidebar.test.tsx`:

1. Change the first test title and the count test: replace `renders all 10 nav items with the 6 group labels` with `renders all 11 nav items with the 7 group labels`, and in the test `renders exactly 10 nav links (not the mockup's 12 demo entries)` change the title to `renders exactly 11 nav links (not the mockup's 12 demo entries)` and `toHaveLength(10)` to `toHaveLength(11)`.
2. Append inside the `describe`, before the closing `});`:

```tsx
  it("renders the Hội thoại tiếng Anh link and marks it active on /conversation/abc", () => {
    vi.mocked(usePathname).mockReturnValue("/conversation/abc");
    render(<Sidebar />);
    const link = screen.getByRole("link", { name: /Hội thoại tiếng Anh/ });
    expect(link).toHaveAttribute("href", "/conversation");
    expect(link).toHaveClass("active");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/shell/Sidebar.test.tsx`
Expected: FAIL (11 links expected, 10 found; link missing).

- [ ] **Step 3: Add the nav item**

In `apps/web/src/components/shell/Sidebar.tsx`, after the `Phỏng vấn` group line, add:

```tsx
  { label: "Hội thoại", items: [{ href: "/conversation", label: "💬 Hội thoại tiếng Anh" }] },
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/shell/Sidebar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/shell/Sidebar.tsx apps/web/src/components/shell/Sidebar.test.tsx
git commit -m "feat(web/conversation): sidebar entry" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Setup screen (components + page + CSS)

**Files:**
- Create: `apps/web/src/components/conversation/ModeTabs.tsx`
- Create: `apps/web/src/components/conversation/ScenarioCards.tsx`
- Create: `apps/web/src/components/conversation/ScenarioPreview.tsx`
- Create: `apps/web/src/components/conversation/ConversationSetupForm.tsx`
- Create: `apps/web/src/components/conversation/RecentConversations.tsx`
- Create: `apps/web/src/app/(app)/conversation/page.tsx`
- Modify: `apps/web/src/styles/bloom.css` (append)
- Test: `apps/web/src/components/conversation/ConversationSetupForm.test.tsx`

**Interfaces:**
- Consumes: Task 1 types/scenarios; `INTERVIEW_VOICES`, `InterviewVoice` from `@/lib/interviewTypes`; `ReadinessCard`; `callInterviewAi`, `hasAiKey`; Task 2 `buildScenarioPrompt`/`parseScenario`; Task 4 `createConversationSession`, `listRecentConversationSessions`.
- Produces: `ConversationDraft`, `DEFAULT_CONVERSATION_DRAFT`, `draftToSetup(draft): ConversationSetup`, `isDraftReady(draft): boolean`, `CUSTOM_PRESET_ID = "custom"`, component `ConversationSetupForm` with props `{ value: ConversationDraft; onChange(next: ConversationDraft): void; onPreviewVoice(voice: InterviewVoice): void; onBuildScenario(): void; building: boolean; buildError: string | null }`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/conversation/ConversationSetupForm.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  ConversationSetupForm,
  DEFAULT_CONVERSATION_DRAFT,
  draftToSetup,
  isDraftReady,
  type ConversationDraft,
} from "./ConversationSetupForm";

function setup(value: ConversationDraft = DEFAULT_CONVERSATION_DRAFT) {
  const onChange = vi.fn();
  const onBuildScenario = vi.fn();
  render(
    <ConversationSetupForm
      value={value}
      onChange={onChange}
      onPreviewVoice={vi.fn()}
      onBuildScenario={onBuildScenario}
      building={false}
      buildError={null}
    />
  );
  return { onChange, onBuildScenario };
}

describe("draft helpers", () => {
  it("topic mode is ready with a topic; role-play also needs persona and a goal", () => {
    expect(isDraftReady(DEFAULT_CONVERSATION_DRAFT)).toBe(false);
    expect(isDraftReady({ ...DEFAULT_CONVERSATION_DRAFT, topic: "Travel" })).toBe(true);
    const rp = { ...DEFAULT_CONVERSATION_DRAFT, mode: "roleplay" as const, topic: "Cafe" };
    expect(isDraftReady(rp)).toBe(false);
    expect(isDraftReady({ ...rp, persona: "A barista", goals: ["Gọi cà phê"] })).toBe(true);
  });
  it("draftToSetup trims, and clears persona/goals in topic mode", () => {
    const s = draftToSetup({ ...DEFAULT_CONVERSATION_DRAFT, topic: " Travel ", persona: "x", goals: ["a"] });
    expect(s).toMatchObject({ mode: "topic", topic: "Travel", persona: null, goals: [] });
    const r = draftToSetup({ ...DEFAULT_CONVERSATION_DRAFT, mode: "roleplay", topic: "Cafe", persona: " Barista ", goals: [" a ", " "] });
    expect(r).toMatchObject({ persona: "Barista", goals: ["a"] });
  });
});

describe("ConversationSetupForm", () => {
  it("switches mode", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Tình huống nhập vai" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ mode: "roleplay", topic: "", presetId: null }));
  });

  it("picking a topic card fills the topic", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Du lịch/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ presetId: "travel", topic: "Travel and memorable trips" }));
  });

  it("typing a custom topic clears the selected card", () => {
    const { onChange } = setup({ ...DEFAULT_CONVERSATION_DRAFT, presetId: "travel", topic: "Travel and memorable trips" });
    fireEvent.change(screen.getByLabelText("Hoặc tự nhập chủ đề của bạn"), { target: { value: "Football" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ presetId: null, topic: "Football" }));
  });

  it("picking a role-play preset fills persona and goals, and shows the editable preview", () => {
    const { onChange } = setup({ ...DEFAULT_CONVERSATION_DRAFT, mode: "roleplay" });
    fireEvent.click(screen.getByRole("button", { name: /Gọi món ở nhà hàng/ }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ presetId: "restaurant", persona: expect.stringContaining("waiter"), goals: expect.arrayContaining(["Gọi đồ uống"]) })
    );
  });

  it("custom role-play: describe, then build the scenario", () => {
    const { onBuildScenario } = setup({ ...DEFAULT_CONVERSATION_DRAFT, mode: "roleplay", presetId: "custom", topic: "Renting a flat" });
    fireEvent.click(screen.getByRole("button", { name: "Dựng tình huống" }));
    expect(onBuildScenario).toHaveBeenCalled();
  });

  it("edits a goal in the preview", () => {
    const { onChange } = setup({
      ...DEFAULT_CONVERSATION_DRAFT, mode: "roleplay", presetId: "restaurant", topic: "Gọi món ở nhà hàng",
      persona: "A waiter", goals: ["Gọi đồ uống", "Xin thanh toán"],
    });
    fireEvent.change(screen.getByLabelText("Mục tiêu 2"), { target: { value: "Trả tiền" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ goals: ["Gọi đồ uống", "Trả tiền"] }));
  });

  it("toggles level and the two switches", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "B2" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ level: "B2" }));
    fireEvent.click(screen.getByLabelText("AI đọc to câu trả lời"));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ speakAloud: false }));
    fireEvent.click(screen.getByLabelText("Xem lại bản chép lời trước khi gửi"));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ reviewTranscript: false }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/conversation/ConversationSetupForm.test.tsx`
Expected: FAIL (cannot resolve module).

- [ ] **Step 3: Write the small components**

Create `apps/web/src/components/conversation/ModeTabs.tsx`:

```tsx
import type { ConversationMode } from "@/lib/conversationTypes";

const TABS: { id: ConversationMode; label: string }[] = [
  { id: "topic", label: "Chủ đề tự do" },
  { id: "roleplay", label: "Tình huống nhập vai" },
];

export function ModeTabs({ mode, onChange }: { mode: ConversationMode; onChange(mode: ConversationMode): void }) {
  return (
    <div className="cv-tabs" role="group" aria-label="Chế độ">
      {TABS.map((t) => (
        <button key={t.id} type="button" className={mode === t.id ? "cv-tab active" : "cv-tab"} aria-pressed={mode === t.id} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
```

Create `apps/web/src/components/conversation/ScenarioCards.tsx`:

```tsx
import { ROLEPLAY_PRESETS, TOPIC_CARDS, type RoleplayPreset, type TopicCard } from "@/lib/conversationScenarios";
import type { ConversationMode } from "@/lib/conversationTypes";

export const CUSTOM_PRESET_ID = "custom";

export interface ScenarioCardsProps {
  mode: ConversationMode;
  selectedId: string | null;
  onPickTopic(card: TopicCard): void;
  onPickPreset(preset: RoleplayPreset): void;
  onPickCustom(): void;
}

export function ScenarioCards({ mode, selectedId, onPickTopic, onPickPreset, onPickCustom }: ScenarioCardsProps) {
  const cls = (id: string) => (selectedId === id ? "cv-pick active" : "cv-pick");
  return (
    <div className="cv-picks">
      {mode === "topic" &&
        TOPIC_CARDS.map((c) => (
          <button key={c.id} type="button" className={cls(c.id)} aria-pressed={selectedId === c.id} onClick={() => onPickTopic(c)}>
            <strong>{c.title}</strong>
            <span className="iv-muted">{c.sub}</span>
          </button>
        ))}
      {mode === "roleplay" && (
        <>
          {ROLEPLAY_PRESETS.map((p) => (
            <button key={p.id} type="button" className={cls(p.id)} aria-pressed={selectedId === p.id} onClick={() => onPickPreset(p)}>
              <strong>{p.title}</strong>
              <span className="iv-muted">{p.sub}</span>
            </button>
          ))}
          <button type="button" className={`${cls(CUSTOM_PRESET_ID)} cv-pick-custom`} aria-pressed={selectedId === CUSTOM_PRESET_ID} onClick={onPickCustom}>
            <strong>＋ Tự mô tả tình huống</strong>
            <span className="iv-muted">AI dựng vai và mục tiêu</span>
          </button>
        </>
      )}
    </div>
  );
}
```

Create `apps/web/src/components/conversation/ScenarioPreview.tsx`:

```tsx
export interface ScenarioPreviewProps {
  persona: string;
  goals: string[];
  onPersonaChange(persona: string): void;
  onGoalChange(index: number, goal: string): void;
}

export function ScenarioPreview({ persona, goals, onPersonaChange, onGoalChange }: ScenarioPreviewProps) {
  return (
    <section className="iv-card cv-preview" aria-label="Vai và mục tiêu">
      <h3 className="iv-card-title">AI dựng sẵn cho tình huống này (sửa được)</h3>
      <div className="iv-field">
        <label htmlFor="cv-persona" className="iv-label">AI đóng vai</label>
        <input id="cv-persona" className="iv-input" type="text" value={persona} onChange={(e) => onPersonaChange(e.target.value)} />
      </div>
      <div className="iv-field">
        <span className="iv-label">Mục tiêu của bạn</span>
        {goals.map((g, i) => (
          <input key={i} className="iv-input" type="text" aria-label={`Mục tiêu ${i + 1}`} value={g} onChange={(e) => onGoalChange(i, e.target.value)} />
        ))}
      </div>
    </section>
  );
}
```

Create `apps/web/src/components/conversation/RecentConversations.tsx`:

```tsx
import Link from "next/link";
import type { ConversationSession } from "@/lib/conversationTypes";

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function RecentConversations({ sessions }: { sessions: ConversationSession[] }) {
  return (
    <section className="iv-card" aria-label="Gần đây">
      <h3 className="iv-card-title">Gần đây</h3>
      {sessions.length === 0 && <p className="iv-muted">Chưa có buổi nào.</p>}
      {sessions.map((s) => (
        <Link key={s.id} href={`/conversation/${s.id}/report`} className="iv-recent-row">
          <span className="iv-recent-main">
            <span className="iv-recent-title">{`${s.setup.topic} · ${s.setup.level}`}</span>
            <span className="iv-muted">{`${shortDate(s.createdAt)} · ${s.setup.mode === "roleplay" ? "Nhập vai" : "Chủ đề tự do"}`}</span>
          </span>
          <span className="iv-recent-score">{s.report ? s.report.overall.toFixed(1) : "—"}</span>
        </Link>
      ))}
    </section>
  );
}
```

- [ ] **Step 4: Write the form container**

Create `apps/web/src/components/conversation/ConversationSetupForm.tsx`:

```tsx
import { CONVERSATION_LEVELS, type ConversationMode, type ConversationSetup } from "@/lib/conversationTypes";
import type { RoleplayPreset, TopicCard } from "@/lib/conversationScenarios";
import { INTERVIEW_VOICES, type InterviewVoice } from "@/lib/interviewTypes";
import { ModeTabs } from "./ModeTabs";
import { CUSTOM_PRESET_ID, ScenarioCards } from "./ScenarioCards";
import { ScenarioPreview } from "./ScenarioPreview";

export interface ConversationDraft {
  mode: ConversationMode;
  /** Topic text, or the role-play scenario title / custom description. */
  topic: string;
  /** Selected card/preset id, CUSTOM_PRESET_ID for a custom role-play, or null. */
  presetId: string | null;
  persona: string;
  goals: string[];
  level: ConversationSetup["level"];
  voice: InterviewVoice;
  speakAloud: boolean;
  reviewTranscript: boolean;
}

export const DEFAULT_CONVERSATION_DRAFT: ConversationDraft = {
  mode: "topic",
  topic: "",
  presetId: null,
  persona: "",
  goals: [],
  level: "B1",
  voice: "female1",
  speakAloud: true,
  reviewTranscript: true,
};

export function isDraftReady(d: ConversationDraft): boolean {
  if (!d.topic.trim()) return false;
  return d.mode === "topic" || (d.persona.trim().length > 0 && d.goals.some((g) => g.trim().length > 0));
}

export function draftToSetup(d: ConversationDraft): ConversationSetup {
  const roleplay = d.mode === "roleplay";
  return {
    mode: d.mode,
    topic: d.topic.trim(),
    level: d.level,
    voice: d.voice,
    speakAloud: d.speakAloud,
    reviewTranscript: d.reviewTranscript,
    persona: roleplay ? d.persona.trim() : null,
    goals: roleplay ? d.goals.map((g) => g.trim()).filter((g) => g.length > 0) : [],
  };
}

export interface ConversationSetupFormProps {
  value: ConversationDraft;
  onChange(next: ConversationDraft): void;
  onPreviewVoice(voice: InterviewVoice): void;
  onBuildScenario(): void;
  building: boolean;
  buildError: string | null;
}

export function ConversationSetupForm(props: ConversationSetupFormProps) {
  const { value, onChange } = props;
  const set = <K extends keyof ConversationDraft>(key: K, v: ConversationDraft[K]) => onChange({ ...value, [key]: v });
  const chip = (active: boolean) => (active ? "vb-chip active" : "vb-chip");
  const isCustom = value.mode === "roleplay" && value.presetId === CUSTOM_PRESET_ID;
  const showPreview = value.mode === "roleplay" && (value.persona.length > 0 || value.goals.length > 0);

  const pickTopic = (c: TopicCard) => onChange({ ...value, presetId: c.id, topic: c.topic });
  const pickPreset = (p: RoleplayPreset) =>
    onChange({ ...value, presetId: p.id, topic: p.title, persona: p.persona, goals: [...p.goals] });
  const pickCustom = () => onChange({ ...value, presetId: CUSTOM_PRESET_ID, topic: "", persona: "", goals: [] });

  return (
    <div className="iv-form">
      <ModeTabs
        mode={value.mode}
        onChange={(mode) => onChange({ ...value, mode, presetId: null, topic: "", persona: "", goals: [] })}
      />

      <div className="iv-field">
        <span className="iv-label">{value.mode === "topic" ? "Gợi ý chủ đề" : "Chọn một tình huống"}</span>
        <ScenarioCards
          mode={value.mode}
          selectedId={value.presetId}
          onPickTopic={pickTopic}
          onPickPreset={pickPreset}
          onPickCustom={pickCustom}
        />
      </div>

      {value.mode === "topic" && (
        <div className="iv-field">
          <label htmlFor="cv-topic" className="iv-label">Hoặc tự nhập chủ đề của bạn</label>
          <input
            id="cv-topic"
            className="iv-input"
            type="text"
            placeholder="Ví dụ: chuẩn bị họp với đối tác Nhật…"
            value={value.presetId ? "" : value.topic}
            onChange={(e) => onChange({ ...value, presetId: null, topic: e.target.value })}
          />
        </div>
      )}

      {isCustom && (
        <div className="iv-field">
          <label htmlFor="cv-describe" className="iv-label">Mô tả tình huống bạn muốn luyện</label>
          <textarea
            id="cv-describe"
            className="iv-input"
            rows={3}
            placeholder="Ví dụ: thuê căn hộ và thương lượng tiền cọc với chủ nhà"
            value={value.topic}
            onChange={(e) => set("topic", e.target.value)}
          />
          <div className="iv-row">
            <button type="button" className="btn-secondary" disabled={props.building || !value.topic.trim()} onClick={props.onBuildScenario}>
              Dựng tình huống
            </button>
            {props.building && <span className="iv-muted">Đang dựng…</span>}
          </div>
          {props.buildError && <p className="iv-error" role="alert">{props.buildError}</p>}
        </div>
      )}

      {showPreview && (
        <ScenarioPreview
          persona={value.persona}
          goals={value.goals}
          onPersonaChange={(persona) => set("persona", persona)}
          onGoalChange={(i, g) => set("goals", value.goals.map((x, idx) => (idx === i ? g : x)))}
        />
      )}

      <div className="iv-field">
        <span className="iv-label">Trình độ</span>
        <div className="iv-row">
          {CONVERSATION_LEVELS.map((l) => (
            <button key={l} type="button" className={chip(value.level === l)} aria-pressed={value.level === l} onClick={() => set("level", l)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="iv-field">
        <span className="iv-label">Giọng AI</span>
        <div className="iv-voice-grid">
          {INTERVIEW_VOICES.map((v) => (
            <div key={v.id} className={value.voice === v.id ? "iv-voice active" : "iv-voice"}>
              <button type="button" className="iv-voice-pick" aria-pressed={value.voice === v.id} onClick={() => set("voice", v.id)}>
                <strong>{v.label}</strong>
                <span className="iv-muted">{v.sub}</span>
              </button>
              <button type="button" className="iv-icon-btn" aria-label="Nghe thử giọng" onClick={() => props.onPreviewVoice(v.id)}>▶</button>
            </div>
          ))}
        </div>
      </div>

      <label className="iv-row iv-checkbox">
        <input type="checkbox" checked={value.speakAloud} onChange={(e) => set("speakAloud", e.target.checked)} />
        AI đọc to câu trả lời
      </label>
      <label className="iv-row iv-checkbox">
        <input type="checkbox" checked={value.reviewTranscript} onChange={(e) => set("reviewTranscript", e.target.checked)} />
        Xem lại bản chép lời trước khi gửi
      </label>
    </div>
  );
}
```

Note: the test queries checkboxes with `getByLabelText("AI đọc to câu trả lời")` — the `<label>` wraps the input, so the accessible name matches its text.

- [ ] **Step 5: Write the Setup page**

Create `apps/web/src/app/(app)/conversation/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { SignInButton } from "@/components/SignInButton";
import { callInterviewAi, hasAiKey } from "@/lib/interviewAi";
import { createConversationSession, listRecentConversationSessions } from "@/lib/conversationSessions";
import { buildScenarioPrompt, parseScenario } from "@/lib/conversationPrompts";
import { warmUpSpeech } from "@/lib/warmUpSpeechClient";
import { getMicPermission, requestMicPermission, type MicPermission } from "@/lib/micPermission";
import { useInterviewAudio } from "@/lib/useInterviewAudio";
import type { InterviewVoice } from "@/lib/interviewTypes";
import type { ConversationSession } from "@/lib/conversationTypes";
import {
  ConversationSetupForm,
  DEFAULT_CONVERSATION_DRAFT,
  draftToSetup,
  isDraftReady,
  type ConversationDraft,
} from "@/components/conversation/ConversationSetupForm";
import { RecentConversations } from "@/components/conversation/RecentConversations";
import { ReadinessCard } from "@/components/interview/ReadinessCard";

const VOICE_SAMPLE = "Hi! Let's have a chat.";

export default function ConversationSetupPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();
  const { settings } = useSettingsContext();
  const [draft, setDraft] = useState<ConversationDraft>(DEFAULT_CONVERSATION_DRAFT);
  const [recent, setRecent] = useState<ConversationSession[]>([]);
  const [mic, setMic] = useState<MicPermission>("prompt");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const preview = useInterviewAudio(draft.voice);

  useEffect(() => {
    if (!user) return;
    void warmUpSpeech();
    listRecentConversationSessions(user.uid).then(setRecent).catch(() => {});
    void getMicPermission().then(setMic);
  }, [user]);

  // Runs after the render that applied the newly picked voice, so the audio
  // hook's voice ref is already current.
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
        <h2 className="scr-title">Hội thoại tiếng Anh</h2>
        <p className="scr-sub">Đăng nhập để luyện hội thoại.</p>
        <SignInButton />
      </div>
    );
  }

  const aiReady = hasAiKey(settings);
  // Typing works without a microphone, so only AI readiness and a complete
  // draft gate Start.
  const canStart = aiReady && isDraftReady(draft) && !starting;

  function handlePreviewVoice(voice: InterviewVoice) {
    setDraft((d) => ({ ...d, voice }));
    setPreviewNonce((n) => n + 1);
  }

  async function handleBuildScenario() {
    if (!settings) return;
    setBuilding(true);
    setBuildError(null);
    try {
      const { persona, goals } = parseScenario(await callInterviewAi(settings, buildScenarioPrompt(draft.topic, draft.level)));
      setDraft((d) => ({ ...d, persona, goals }));
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : "Không dựng được tình huống.");
    }
    setBuilding(false);
  }

  async function handleStart() {
    if (!user || !canStart) return;
    setStarting(true);
    setStartError(null);
    try {
      const id = await createConversationSession(user.uid, draftToSetup(draft));
      router.push(`/conversation/${id}`);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Không tạo được buổi trò chuyện.");
      setStarting(false);
    }
  }

  return (
    <div className="iv-page">
      <h2 className="scr-title">Hội thoại tiếng Anh</h2>
      <p className="scr-sub">
        Trò chuyện với AI về một chủ đề hoặc nhập vai một tình huống. Nói hoặc gõ đều được; lỗi sẽ được nhận xét ở cuối buổi.
      </p>
      <div className="iv-setup-layout">
        <section className="iv-card iv-setup-main" aria-label="Thiết lập">
          <ConversationSetupForm
            value={draft}
            onChange={setDraft}
            onPreviewVoice={handlePreviewVoice}
            onBuildScenario={() => void handleBuildScenario()}
            building={building}
            buildError={buildError}
          />
          <div className="iv-row iv-start-row">
            <button type="button" className="btn-primary" disabled={!canStart} onClick={() => void handleStart()}>
              {draft.mode === "roleplay" ? "Bắt đầu nhập vai" : "Bắt đầu trò chuyện"}
            </button>
            {startError && <p className="iv-error" role="alert">{startError}</p>}
          </div>
        </section>
        <aside className="iv-setup-side">
          <ReadinessCard aiReady={aiReady} mic={mic} onRequestMic={() => void requestMicPermission().then((ok) => setMic(ok ? "granted" : "denied"))} />
          <RecentConversations sessions={recent} />
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Append CSS**

Append to the end of `apps/web/src/styles/bloom.css`:

```css

/* ── Conversation (Hội thoại) ─────────────────────────── */
.cv-tabs { display: inline-flex; gap: 6px; padding: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 999px; align-self: flex-start; }
.cv-tab { font: inherit; font-weight: 600; font-size: 15px; border: 0; background: transparent; color: var(--ink-soft); border-radius: 999px; padding: 10px 20px; min-height: 44px; cursor: pointer; }
.cv-tab.active { background: var(--accent); color: var(--accent-ink); }
.cv-picks { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
.cv-pick { font: inherit; text-align: left; display: flex; flex-direction: column; gap: 4px; padding: 16px; min-height: 88px; background: var(--surface); color: var(--ink); border: 1px solid var(--border); border-radius: 16px; cursor: pointer; }
.cv-pick.active { border: 2px solid var(--accent); padding: 15px; }
.cv-pick-custom { border-style: dashed; color: var(--accent); }
.cv-preview { gap: 14px; }
```

- [ ] **Step 7: Run tests and typecheck**

Run: `npx vitest run src/components/conversation/ConversationSetupForm.test.tsx` — Expected: PASS.
Run: `npm run typecheck` — Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/conversation apps/web/src/app/\(app\)/conversation/page.tsx apps/web/src/styles/bloom.css
git commit -m "feat(web/conversation): setup screen" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Chat components (thread, hint, suggestions, goals, composer) + CSS

**Files:**
- Create: `apps/web/src/components/conversation/HintBubble.tsx`
- Create: `apps/web/src/components/conversation/ChatThread.tsx`
- Create: `apps/web/src/components/conversation/SuggestPanel.tsx`
- Create: `apps/web/src/components/conversation/GoalChecklist.tsx`
- Create: `apps/web/src/components/conversation/Composer.tsx`
- Modify: `apps/web/src/styles/bloom.css` (append)
- Test: `apps/web/src/components/conversation/ChatThread.test.tsx`, `Composer.test.tsx`, `GoalChecklist.test.tsx`

**Interfaces:**
- Consumes: `ConversationState` from `@/lib/conversationMachine`; `joinSegments`; types from Task 1; `WordDiff` from `@/components/interview/WordDiff`; `formatClock` from `@/components/interview/SessionDock`; `MAX_ANSWER_SECONDS` from `@/lib/interviewTypes`.
- Produces:
  - `HintBubble({ original: string; hint: ConversationHint })`
  - `ChatThread` props: `{ messages: ConversationMessage[]; thinking: boolean; hintLoadingIndex: number | null; translations: Record<number, string>; translatingIndex: number | null; canReplay: boolean; onReplay(i: number): void; onTranslate(i: number): void; onHint(i: number): void }`
  - `SuggestPanel` props: `{ options: string[]; onPick(text: string): void; onClose(): void }`
  - `GoalChecklist` props: `{ persona: string | null; goals: string[]; goalsDone: number[] }`
  - `Composer` props (all callbacks required): `{ state: ConversationState; elapsed: number; micError: boolean; suggestions: string[] | null; suggesting: boolean; openingError?: string; onEditDraft(text: string): void; onSend(): void; onAddSegment(): void; onStart(): void; onStop(): void; onRetryTranscribe(): void; onSuggest(): void; onPickSuggestion(text: string): void; onCloseSuggestions(): void; onRetryReply(): void; onRetryOpening(): void; onSkipSpeech(): void }`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/conversation/GoalChecklist.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GoalChecklist } from "./GoalChecklist";

describe("GoalChecklist", () => {
  it("marks done goals and shows progress", () => {
    render(<GoalChecklist persona="A waiter" goals={["Gọi đồ uống", "Gọi món", "Xin thanh toán", "Cảm ơn"]} goalsDone={[0]} />);
    expect(screen.getByText("Gọi đồ uống")).toHaveClass("cv-goal-done");
    expect(screen.getByText("Gọi món")).not.toHaveClass("cv-goal-done");
    expect(screen.getByText("1/4 hoàn thành")).toBeInTheDocument();
    expect(screen.getByText("A waiter")).toBeInTheDocument();
  });
});
```

Create `apps/web/src/components/conversation/ChatThread.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatThread } from "./ChatThread";
import type { ConversationMessage } from "@/lib/conversationTypes";

function renderThread(messages: ConversationMessage[], patch: Partial<Parameters<typeof ChatThread>[0]> = {}) {
  const h = { onReplay: vi.fn(), onTranslate: vi.fn(), onHint: vi.fn() };
  render(
    <ChatThread
      messages={messages}
      thinking={false}
      hintLoadingIndex={null}
      translations={{}}
      translatingIndex={null}
      canReplay
      {...h}
      {...patch}
    />
  );
  return h;
}

const BASE: ConversationMessage[] = [
  { role: "ai", text: "Where did you go?" },
  { role: "user", text: "I go to Da Nang" },
];

describe("ChatThread", () => {
  it("renders both roles and wires AI actions by message index", () => {
    const h = renderThread(BASE);
    fireEvent.click(screen.getByRole("button", { name: "Nghe lại" }));
    fireEvent.click(screen.getByRole("button", { name: "Dịch sang tiếng Việt" }));
    expect(h.onReplay).toHaveBeenCalledWith(0);
    expect(h.onTranslate).toHaveBeenCalledWith(0);
    expect(screen.getByText("I go to Da Nang")).toBeInTheDocument();
  });

  it("shows 'Gợi ý sửa' for a user message without a hint and calls onHint", () => {
    const h = renderThread(BASE);
    fireEvent.click(screen.getByRole("button", { name: "Gợi ý sửa" }));
    expect(h.onHint).toHaveBeenCalledWith(1);
  });

  it("shows the cached hint (diff + note) instead of the button", () => {
    renderThread([BASE[0], { ...BASE[1], hint: { corrected: "I went to Da Nang", note: "Dùng quá khứ.", alternatives: ["I travelled to Da Nang"] } }]);
    expect(screen.queryByRole("button", { name: "Gợi ý sửa" })).not.toBeInTheDocument();
    expect(screen.getByText("went")).toBeInTheDocument();
    expect(screen.getByText("Dùng quá khứ.")).toBeInTheDocument();
    expect(screen.getByText("I travelled to Da Nang")).toBeInTheDocument();
  });

  it("shows a translation when present and the thinking indicator", () => {
    renderThread(BASE, { translations: { 0: "Bạn đã đi đâu?" }, thinking: true });
    expect(screen.getByText("Bạn đã đi đâu?")).toBeInTheDocument();
    expect(screen.getByText("AI đang soạn câu trả lời…")).toBeInTheDocument();
  });

  it("disables replay when canReplay is false", () => {
    renderThread(BASE, { canReplay: false });
    expect(screen.getByRole("button", { name: "Nghe lại" })).toBeDisabled();
  });
});
```

Create `apps/web/src/components/conversation/Composer.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Composer } from "./Composer";
import { initialConversationState, type ConversationState } from "@/lib/conversationMachine";

function renderComposer(patch: Partial<ConversationState>, extra: Partial<Parameters<typeof Composer>[0]> = {}) {
  const h = {
    onEditDraft: vi.fn(), onSend: vi.fn(), onAddSegment: vi.fn(), onStart: vi.fn(), onStop: vi.fn(),
    onRetryTranscribe: vi.fn(), onSuggest: vi.fn(), onPickSuggestion: vi.fn(), onCloseSuggestions: vi.fn(),
    onRetryReply: vi.fn(), onRetryOpening: vi.fn(), onSkipSpeech: vi.fn(),
  };
  render(
    <Composer state={{ ...initialConversationState, ...patch }} elapsed={0} micError={false} suggestions={null} suggesting={false} {...h} {...extra} />
  );
  return h;
}

describe("Composer", () => {
  it("warming shows the cold-start hint, or a retry after the opening failed", () => {
    renderComposer({ phase: "warming" });
    expect(screen.getByText(/10–20 giây/)).toBeInTheDocument();
  });
  it("warming + opening_failed: retry", () => {
    const h = renderComposer({ phase: "warming", notice: "opening_failed" }, { openingError: "Lỗi AI" });
    expect(screen.getByText("Lỗi AI")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(h.onRetryOpening).toHaveBeenCalled();
  });
  it("aiSpeaking: can skip straight to answering", () => {
    const h = renderComposer({ phase: "aiSpeaking" });
    fireEvent.click(screen.getByRole("button", { name: "Bỏ qua, trả lời luôn" }));
    expect(h.onSkipSpeech).toHaveBeenCalled();
  });
  it("idle: typing, send, mic, add-segment and suggest", () => {
    const h = renderComposer({ phase: "idle", draft: "hello" });
    fireEvent.change(screen.getByLabelText("Câu trả lời của bạn"), { target: { value: "hello!" } });
    expect(h.onEditDraft).toHaveBeenCalledWith("hello!");
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu ghi âm" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Nói thêm" }));
    fireEvent.click(screen.getByRole("button", { name: "Gợi ý cách nói" }));
    expect(h.onSend).toHaveBeenCalled();
    expect(h.onStart).toHaveBeenCalled();
    expect(h.onAddSegment).toHaveBeenCalled();
    expect(h.onSuggest).toHaveBeenCalled();
  });
  it("idle with nothing to send disables Send and + Nói thêm", () => {
    renderComposer({ phase: "idle" });
    expect(screen.getByRole("button", { name: "Gửi" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "+ Nói thêm" })).toBeDisabled();
  });
  it("shows earlier segments and enables Send from segments alone", () => {
    renderComposer({ phase: "idle", segments: ["first part"] });
    expect(screen.getByText("first part")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi" })).toBeEnabled();
  });
  it("review: shows the Whisper caution", () => {
    renderComposer({ phase: "review", draft: "hi" });
    expect(screen.getByText(/đừng sửa lỗi ngữ pháp/)).toBeInTheDocument();
  });
  it("recording: shows the clock and stops", () => {
    const h = renderComposer({ phase: "recording" }, { elapsed: 42 });
    expect(screen.getByText("0:42")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dừng ghi âm" }));
    expect(h.onStop).toHaveBeenCalled();
  });
  it("sttError: retry or re-record", () => {
    const h = renderComposer({ phase: "sttError" });
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    fireEvent.click(screen.getByRole("button", { name: "Thu lại" }));
    expect(h.onRetryTranscribe).toHaveBeenCalled();
    expect(h.onStart).toHaveBeenCalled();
  });
  it("replyError: retry keeps the user's message", () => {
    const h = renderComposer({ phase: "replyError" });
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(h.onRetryReply).toHaveBeenCalled();
  });
  it("notices: empty transcript and TTS failure", () => {
    renderComposer({ phase: "idle", notice: "empty_transcript" });
    expect(screen.getByText(/Không nghe thấy gì/)).toBeInTheDocument();
  });
  it("suggestions: listing, picking and closing", () => {
    const h = renderComposer({ phase: "idle" }, { suggestions: ["Option one", "Option two"] });
    fireEvent.click(screen.getByRole("button", { name: "Option two" }));
    expect(h.onPickSuggestion).toHaveBeenCalledWith("Option two");
    fireEvent.click(screen.getByRole("button", { name: "Đóng gợi ý" }));
    expect(h.onCloseSuggestions).toHaveBeenCalled();
  });
  it("aiThinking and grading show status text only", () => {
    renderComposer({ phase: "aiThinking" });
    expect(screen.getByText("AI đang suy nghĩ…")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/conversation/GoalChecklist.test.tsx src/components/conversation/ChatThread.test.tsx src/components/conversation/Composer.test.tsx`
Expected: FAIL (cannot resolve modules).

- [ ] **Step 3: Write the components**

Create `apps/web/src/components/conversation/GoalChecklist.tsx`:

```tsx
export interface GoalChecklistProps {
  persona: string | null;
  goals: string[];
  goalsDone: number[];
}

export function GoalChecklist({ persona, goals, goalsDone }: GoalChecklistProps) {
  const done = goals.filter((_, i) => goalsDone.includes(i)).length;
  const pct = goals.length === 0 ? 0 : Math.round((done / goals.length) * 100);
  return (
    <section className="iv-card" aria-label="Mục tiêu">
      <h3 className="iv-card-title">Mục tiêu của bạn</h3>
      <ul className="cv-goals">
        {goals.map((g, i) => (
          <li key={i}>
            <span className={goalsDone.includes(i) ? "cv-goal-dot done" : "cv-goal-dot"} aria-hidden="true">{goalsDone.includes(i) ? "✓" : ""}</span>
            <span className={goalsDone.includes(i) ? "cv-goal-done" : undefined}>{g}</span>
          </li>
        ))}
      </ul>
      <div className="cv-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
      <p className="iv-muted">{`${done}/${goals.length} hoàn thành`}</p>
      {persona && (
        <>
          <h4 className="cv-persona-title">AI đóng vai</h4>
          <p className="iv-muted">{persona}</p>
        </>
      )}
    </section>
  );
}
```

Create `apps/web/src/components/conversation/HintBubble.tsx`:

```tsx
import type { ConversationHint } from "@/lib/conversationTypes";
import { WordDiff } from "@/components/interview/WordDiff";

export function HintBubble({ original, hint }: { original: string; hint: ConversationHint }) {
  return (
    <div className="cv-hint">
      <span className="iv-caps">Gợi ý sửa</span>
      <WordDiff before={original} after={hint.corrected} />
      <p className="iv-muted">{hint.note}</p>
      {hint.alternatives.length > 0 && (
        <ul className="cv-alts">
          {hint.alternatives.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

Create `apps/web/src/components/conversation/ChatThread.tsx`:

```tsx
import type { ConversationMessage } from "@/lib/conversationTypes";
import { HintBubble } from "./HintBubble";

export interface ChatThreadProps {
  messages: ConversationMessage[];
  thinking: boolean;
  hintLoadingIndex: number | null;
  translations: Record<number, string>;
  translatingIndex: number | null;
  canReplay: boolean;
  onReplay(index: number): void;
  onTranslate(index: number): void;
  onHint(index: number): void;
}

export function ChatThread(props: ChatThreadProps) {
  return (
    <div className="cv-thread" aria-live="polite">
      {props.messages.map((m, i) =>
        m.role === "ai" ? (
          <div key={i} className="cv-row cv-row-ai">
            <span className="cv-avatar" aria-hidden="true">AI</span>
            <div className="cv-col">
              <p className="cv-bubble cv-bubble-ai">{m.text}</p>
              {props.translations[i] && <p className="cv-translation">{props.translations[i]}</p>}
              <div className="cv-actions">
                <button type="button" className="cv-link" disabled={!props.canReplay} onClick={() => props.onReplay(i)}>Nghe lại</button>
                <button type="button" className="cv-link" disabled={props.translatingIndex === i} onClick={() => props.onTranslate(i)}>Dịch sang tiếng Việt</button>
              </div>
            </div>
          </div>
        ) : (
          <div key={i} className="cv-row cv-row-me">
            <div className="cv-col cv-col-me">
              <p className="cv-bubble cv-bubble-me">{m.text}</p>
              {m.hint ? (
                <HintBubble original={m.text} hint={m.hint} />
              ) : (
                <div className="cv-actions cv-actions-me">
                  <button type="button" className="cv-link" disabled={props.hintLoadingIndex === i} onClick={() => props.onHint(i)}>Gợi ý sửa</button>
                </div>
              )}
            </div>
          </div>
        )
      )}
      {props.thinking && <p className="iv-muted" role="status">AI đang soạn câu trả lời…</p>}
    </div>
  );
}
```

Create `apps/web/src/components/conversation/SuggestPanel.tsx`:

```tsx
export interface SuggestPanelProps {
  options: string[];
  onPick(text: string): void;
  onClose(): void;
}

export function SuggestPanel({ options, onPick, onClose }: SuggestPanelProps) {
  return (
    <div className="cv-suggest">
      <div className="iv-row">
        <span className="iv-caps">Bạn có thể nói</span>
        <button type="button" className="cv-link" onClick={onClose}>Đóng gợi ý</button>
      </div>
      {options.map((o, i) => (
        <button key={i} type="button" className="cv-suggest-option" onClick={() => onPick(o)}>{o}</button>
      ))}
    </div>
  );
}
```

Create `apps/web/src/components/conversation/Composer.tsx`:

```tsx
import { formatClock } from "@/components/interview/SessionDock";
import { joinSegments, type ConversationState } from "@/lib/conversationMachine";
import { MAX_ANSWER_SECONDS } from "@/lib/interviewTypes";
import { SuggestPanel } from "./SuggestPanel";

export interface ComposerProps {
  state: ConversationState;
  elapsed: number;
  micError: boolean;
  suggestions: string[] | null;
  suggesting: boolean;
  openingError?: string;
  onEditDraft(text: string): void;
  onSend(): void;
  onAddSegment(): void;
  onStart(): void;
  onStop(): void;
  onRetryTranscribe(): void;
  onSuggest(): void;
  onPickSuggestion(text: string): void;
  onCloseSuggestions(): void;
  onRetryReply(): void;
  onRetryOpening(): void;
  onSkipSpeech(): void;
}

const NOTICE_TEXT = {
  empty_transcript: "Không nghe thấy gì — thử nói gần micro hơn.",
  tts_failed: "Không phát được âm thanh — đọc tin nhắn ở trên hoặc bấm Nghe lại.",
} as const;

export function Composer(props: ComposerProps) {
  const { state, elapsed } = props;
  const canCompose = state.phase === "idle" || state.phase === "review";
  const canSend = joinSegments(state.segments, state.draft).length > 0;

  return (
    <footer className="iv-dock cv-composer">
      {state.phase === "warming" &&
        (state.notice === "opening_failed" ? (
          <div className="iv-dock-row">
            <p className="iv-error" role="alert">{props.openingError ?? "Không bắt đầu được cuộc trò chuyện."}</p>
            <button type="button" className="btn-primary" onClick={props.onRetryOpening}>Thử lại</button>
          </div>
        ) : (
          <div className="iv-dock-status" role="status">
            <strong>Đang chuẩn bị cuộc trò chuyện…</strong>
            <span className="iv-muted">Lần đầu trong ngày có thể mất 10–20 giây.</span>
          </div>
        ))}

      {state.phase === "aiSpeaking" && (
        <div className="iv-dock-row">
          <div className="iv-dock-status" role="status"><strong>AI đang nói…</strong></div>
          <button type="button" className="btn-secondary" onClick={props.onSkipSpeech}>Bỏ qua, trả lời luôn</button>
        </div>
      )}

      {canCompose && (
        <div className="iv-dock-col">
          {state.notice && state.notice !== "opening_failed" && <p className="iv-warn">{NOTICE_TEXT[state.notice]}</p>}
          {props.micError && <p className="iv-error" role="alert">Không dùng được micro — bạn vẫn có thể gõ câu trả lời.</p>}
          {state.phase === "review" && (
            <p className="iv-muted">
              Bản chép lời — sửa chỗ máy nghe nhầm, <span className="iv-warn-text">đừng sửa lỗi ngữ pháp của chính bạn</span>.
            </p>
          )}
          {state.segments.length > 0 && (
            <ul className="cv-segments" aria-label="Các đoạn đã thêm">
              {state.segments.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
          {props.suggestions && (
            <SuggestPanel options={props.suggestions} onPick={props.onPickSuggestion} onClose={props.onCloseSuggestions} />
          )}
          <div className="iv-row">
            <button type="button" className="cv-chip-btn" disabled={props.suggesting} onClick={props.onSuggest}>
              {props.suggesting ? "Đang nghĩ…" : "Gợi ý cách nói"}
            </button>
            <span className="iv-muted">Xem vài câu mẫu để trả lời, không tính vào điểm</span>
          </div>
          <div className="cv-input-row">
            <textarea
              className="iv-input cv-input"
              rows={2}
              aria-label="Câu trả lời của bạn"
              placeholder="Nói hoặc gõ câu trả lời của bạn…"
              value={state.draft}
              onChange={(e) => props.onEditDraft(e.target.value)}
            />
            <button type="button" className="iv-mic" aria-label="Bắt đầu ghi âm" onClick={props.onStart}>🎤</button>
            <button type="button" className="btn-secondary" disabled={!state.draft.trim()} onClick={props.onAddSegment}>+ Nói thêm</button>
            <button type="button" className="btn-primary" disabled={!canSend} onClick={props.onSend}>Gửi</button>
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
          </div>
        </div>
      )}

      {state.phase === "aiThinking" && <p className="iv-dock-status" role="status">AI đang suy nghĩ…</p>}

      {state.phase === "replyError" && (
        <div className="iv-dock-row">
          <p className="iv-error" role="alert">AI chưa trả lời được. Tin nhắn của bạn đã được lưu.</p>
          <button type="button" className="btn-primary" onClick={props.onRetryReply}>Thử lại</button>
        </div>
      )}

      {state.phase === "grading" && <p className="iv-dock-status" role="status">Đang chấm bài…</p>}
    </footer>
  );
}
```

- [ ] **Step 4: Append CSS**

Append to the end of `apps/web/src/styles/bloom.css`:

```css

.cv-thread { display: flex; flex-direction: column; gap: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 20px; min-height: 320px; }
.cv-row { display: flex; gap: 12px; align-items: flex-start; }
.cv-row-me { justify-content: flex-end; }
.cv-avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--surface-3); color: var(--ink-soft); font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.cv-col { display: flex; flex-direction: column; gap: 6px; max-width: 640px; }
.cv-col-me { align-items: flex-end; }
.cv-bubble { margin: 0; padding: 12px 16px; font-size: 16px; line-height: 1.5; }
.cv-bubble-ai { background: var(--surface-2); border-radius: 4px 18px 18px 18px; }
.cv-bubble-me { background: var(--accent); color: var(--accent-ink); border-radius: 18px 4px 18px 18px; }
.cv-translation { margin: 0; font-size: 14.5px; color: var(--ink-soft); font-style: italic; }
.cv-actions { display: flex; gap: 14px; }
.cv-actions-me { justify-content: flex-end; }
.cv-link { font: inherit; font-size: 13px; font-weight: 600; border: 0; background: none; color: var(--accent); cursor: pointer; padding: 4px 0; }
.cv-link:disabled { color: var(--ink-faint); cursor: default; }
.cv-hint { background: var(--surface-2); border: 1px solid var(--border); border-radius: 14px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
.cv-alts { margin: 0; padding-left: 18px; font-size: 14.5px; color: var(--ink-soft); }
.cv-composer { align-items: stretch; }
.cv-input-row { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
.cv-input { flex: 1; min-width: 220px; resize: vertical; }
.cv-segments { margin: 0; padding-left: 18px; font-size: 14.5px; color: var(--ink-soft); }
.cv-chip-btn { font: inherit; font-size: 13px; font-weight: 600; border: 1px solid var(--border); background: var(--surface-2); color: var(--accent); border-radius: 999px; padding: 8px 14px; min-height: 44px; cursor: pointer; }
.cv-suggest { background: var(--surface-2); border: 1px solid var(--border); border-radius: 14px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.cv-suggest-option { font: inherit; text-align: left; border: 1px solid var(--border); background: var(--surface); color: var(--ink); border-radius: 12px; padding: 10px 14px; min-height: 44px; cursor: pointer; }
.cv-goals { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.cv-goals li { display: flex; gap: 10px; align-items: flex-start; font-size: 15px; }
.cv-goal-dot { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--border); flex-shrink: 0; box-sizing: border-box; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.cv-goal-dot.done { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.cv-goal-done { color: var(--ink-faint); text-decoration: line-through; }
.cv-bar { height: 6px; background: var(--surface-3); border-radius: 999px; overflow: hidden; }
.cv-bar span { display: block; height: 100%; background: var(--accent); border-radius: 999px; }
.cv-persona-title { margin: 8px 0 0; font-size: 14px; }
.cv-wrapup { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; background: var(--surface-2); border: 1px solid var(--border); border-radius: 14px; padding: 10px 14px; }
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/components/conversation` — Expected: all PASS.
Run: `npm run typecheck` — Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/conversation apps/web/src/styles/bloom.css
git commit -m "feat(web/conversation): chat thread, composer, hints and goal checklist" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Chat session page

**Files:**
- Create: `apps/web/src/app/(app)/conversation/[id]/page.tsx`

**Interfaces:** Consumes everything from Tasks 1–6 and 9. Mirrors the structure of `apps/web/src/app/(app)/interview/[id]/page.tsx` (read it first: same `handledRef`-per-state side-effect pattern, `useRouteParams`, `unmountedRef` reset on mount).

This page is glue; correctness is verified by typecheck, the lower-level unit tests, and the manual run in Task 12. Keep logic in the already-tested modules.

- [ ] **Step 1: Write the page**

Create `apps/web/src/app/(app)/conversation/[id]/page.tsx`:

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
  buildCondensePrompt,
  buildConversationTranslatePrompt,
  buildHintPrompt,
  buildOpeningPrompt,
  buildReplyPrompt,
  buildSuggestPrompt,
  parseCondense,
  parseConversationTranslation,
  parseHint,
  parseOpening,
  parseReply,
  parseSuggest,
} from "@/lib/conversationPrompts";
import { InterviewAiError } from "@/lib/interviewPrompts";
import { buildConversationReportPrompt, parseConversationReport, userMessageIndexes } from "@/lib/conversationReportPrompt";
import { planCondense, unsummarizedWindow } from "@/lib/conversationHistory";
import {
  completeConversationSession,
  deleteConversationSession,
  getConversationSession,
  saveConversationProgress,
  type ConversationProgress,
} from "@/lib/conversationSessions";
import {
  conversationReducer,
  initialConversationState,
  isScenarioComplete,
  joinSegments,
  replyFlags,
  type ConversationState,
} from "@/lib/conversationMachine";
import { MAX_USER_TURNS, userTurnCount, type ConversationMessage, type ConversationReport, type ConversationSession } from "@/lib/conversationTypes";
import { MAX_ANSWER_SECONDS } from "@/lib/interviewTypes";
import { useInterviewAudio } from "@/lib/useInterviewAudio";
import { useRecorder, type RecordedAudio } from "@/lib/useRecorder";
import { transcribeAudio } from "@/lib/transcribeAudioClient";
import { warmUpSpeech } from "@/lib/warmUpSpeechClient";
import { ChatThread } from "@/components/conversation/ChatThread";
import { Composer } from "@/components/conversation/Composer";
import { GoalChecklist } from "@/components/conversation/GoalChecklist";

const RECORDING_START_PHASES = new Set<ConversationState["phase"]>(["idle", "sttError", "review"]);

export default function ConversationSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const resolved = useRouteParams(params);
  const id = resolved?.id ?? null;
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();
  const { settings } = useSettingsContext();
  const [session, setSession] = useState<ConversationSession | null>(null);
  const [missing, setMissing] = useState(false);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [goalsDone, setGoalsDone] = useState<number[]>([]);
  const [translations, setTranslations] = useState<Record<number, string>>({});
  const [translatingIndex, setTranslatingIndex] = useState<number | null>(null);
  const [hintLoadingIndex, setHintLoadingIndex] = useState<number | null>(null);
  const [helperError, setHelperError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [openingError, setOpeningError] = useState<string | null>(null);
  const [state, dispatch] = useReducer(conversationReducer, initialConversationState);
  const messagesRef = useRef<ConversationMessage[]>([]);
  const goalsDoneRef = useRef<number[]>([]);
  const summaryRef = useRef("");
  const summarizedRef = useRef(0);
  const condensingRef = useRef(false);
  const recordingRef = useRef<RecordedAudio | null>(null);
  const handledRef = useRef<ConversationState | null>(null);
  const stoppingRef = useRef(false);
  const unmountedRef = useRef(false);
  const audio = useInterviewAudio(session?.setup.voice ?? "female1");
  const { start: startRecorder, stop: stopRecorder, cancel: cancelRecorder, elapsed, error: micError } = useRecorder();

  // Mirrors `state.phase` for handleStart's post-await check (see the
  // interview session page for why reading `state.phase` there is stale).
  const phaseRef = useRef(state.phase);
  phaseRef.current = state.phase;

  // Reset on every (re)mount: StrictMode's simulated unmount would otherwise
  // leave a permanent `true` that turns every later router.push into a no-op.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    void warmUpSpeech();
    getConversationSession(user.uid, id)
      .then((s) => {
        if (cancelled) return;
        if (!s) {
          setMissing(true);
        } else if (s.status === "completed") {
          router.replace(`/conversation/${id}/report`);
        } else {
          messagesRef.current = s.messages;
          goalsDoneRef.current = s.goalsDone;
          summaryRef.current = s.summary;
          summarizedRef.current = s.summarizedCount;
          setMessages(s.messages);
          setGoalsDone(s.goalsDone);
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

  const persist = useCallback(
    (patch: ConversationProgress) => {
      if (user && id) void saveConversationProgress(user.uid, id, patch).catch(() => {});
    },
    [user, id]
  );

  const appendMessage = useCallback(
    (message: ConversationMessage, extra: ConversationProgress = {}) => {
      const next = [...messagesRef.current, message];
      messagesRef.current = next;
      setMessages(next);
      persist({ messages: next, ...extra });
    },
    [persist]
  );

  // Background: folds old messages into the rolling summary. Failure is
  // ignored — later turns just send more history until a condense succeeds.
  const maybeCondense = useCallback(() => {
    if (!settings || condensingRef.current) return;
    const plan = planCondense(messagesRef.current, summarizedRef.current);
    if (!plan) return;
    condensingRef.current = true;
    void (async () => {
      try {
        const summary = parseCondense(
          await callInterviewAi(settings, buildCondensePrompt({ previousSummary: summaryRef.current, messages: plan.toFold }))
        );
        summaryRef.current = summary;
        summarizedRef.current = plan.newCount;
        persist({ summary, summarizedCount: plan.newCount });
      } catch {
        // ignored on purpose
      } finally {
        condensingRef.current = false;
      }
    })();
  }, [settings, persist]);

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
        const existing = messagesRef.current;
        if (existing.length > 0) {
          dispatch({ type: "RESUME", userTurns: userTurnCount(existing), needsReply: existing[existing.length - 1].role === "user" });
          return;
        }
        void (async () => {
          try {
            const say = parseOpening(await callInterviewAi(settings, buildOpeningPrompt(session.setup)));
            if (handledRef.current !== state) return;
            appendMessage({ role: "ai", text: say });
            dispatch({ type: "OPENING_READY" });
          } catch (err) {
            if (handledRef.current !== state) return;
            setOpeningError(err instanceof InterviewAiError ? err.message : null);
            dispatch({ type: "OPENING_FAILED" });
          }
        })();
        return;
      }
      case "aiSpeaking": {
        const last = messagesRef.current[messagesRef.current.length - 1];
        if (!session.setup.speakAloud || !last || last.role !== "ai") {
          dispatch({ type: "SPEECH_ENDED" });
          return;
        }
        void (async () => {
          const ok = await audio.speak(last.text);
          if (handledRef.current !== state) return;
          dispatch({ type: "SPEECH_ENDED", ttsFailed: !ok });
        })();
        return;
      }
      case "transcribing": {
        const review = session.setup.reviewTranscript;
        void (async () => {
          const rec = recordingRef.current;
          if (!rec) {
            if (handledRef.current !== state) return;
            dispatch({ type: "TRANSCRIBED", text: "", review });
            return;
          }
          try {
            const text = await transcribeAudio(rec.blob);
            if (handledRef.current !== state) return;
            if (!review && text.trim()) {
              // Persist the user's message BEFORE the AI call, so a failure
              // can never lose what they said.
              appendMessage({ role: "user", text: joinSegments(state.segments, text) });
              recordingRef.current = null;
            }
            dispatch({ type: "TRANSCRIBED", text, review });
          } catch {
            if (handledRef.current !== state) return;
            dispatch({ type: "TRANSCRIBE_FAILED" });
          }
        })();
        return;
      }
      case "aiThinking": {
        void (async () => {
          const flags = replyFlags(session.setup.mode, state.userTurns);
          try {
            const raw = await callInterviewAi(
              settings,
              buildReplyPrompt({
                setup: session.setup,
                summary: summaryRef.current,
                window: unsummarizedWindow(messagesRef.current, summarizedRef.current),
                goalsDone: goalsDoneRef.current,
                ...flags,
              })
            );
            if (handledRef.current !== state) return;
            const reply = parseReply(raw, session.setup.goals.length);
            const merged = [...new Set([...goalsDoneRef.current, ...reply.goalsDone])].sort((a, b) => a - b);
            goalsDoneRef.current = merged;
            setGoalsDone(merged);
            appendMessage({ role: "ai", text: reply.say }, { goalsDone: merged });
            const final = flags.mustClose || isScenarioComplete(session.setup.goals, merged);
            const suggestEnd = session.setup.mode === "topic" && (reply.suggestEnd || flags.offerEnd);
            dispatch({ type: "REPLY_RECEIVED", final, suggestEnd });
            maybeCondense();
          } catch {
            if (handledRef.current !== state) return;
            dispatch({ type: "REPLY_FAILED" });
          }
        })();
        return;
      }
      case "grading": {
        void (async () => {
          const finalMessages = messagesRef.current;
          const userIndexes = userMessageIndexes(finalMessages);
          if (userIndexes.length === 0) {
            await deleteConversationSession(uid, id).catch(() => {});
            if (unmountedRef.current) return;
            router.push("/conversation");
            return;
          }
          let report: ConversationReport | null = null;
          try {
            report = parseConversationReport(
              await callInterviewAi(
                settings,
                buildConversationReportPrompt(session.setup, summaryRef.current, finalMessages, goalsDoneRef.current)
              ),
              userIndexes,
              session.setup.mode === "roleplay"
            );
          } catch {
            report = null;
          }
          await saveConversationProgress(uid, id, { messages: finalMessages, goalsDone: goalsDoneRef.current }).catch(() => {});
          await completeConversationSession(uid, id, report).catch(() => {});
          if (unmountedRef.current) return;
          router.push(`/conversation/${id}/report`);
        })();
        return;
      }
      default:
        return;
    }
  }, [state, session, settings, user, id, audio, appendMessage, maybeCondense, router]);

  const handleStop = useCallback(async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    const rec = await stopRecorder();
    if (!rec) {
      stoppingRef.current = false;
      return;
    }
    recordingRef.current = rec;
    dispatch({ type: "STOP_RECORDING" });
    stoppingRef.current = false;
  }, [stopRecorder]);

  useEffect(() => {
    if (state.phase === "recording" && elapsed >= MAX_ANSWER_SECONDS) void handleStop();
  }, [state.phase, elapsed, handleStop]);

  if (authLoading || (user && !resolved)) return <p>Đang tải…</p>;
  if (!user) {
    return (
      <div>
        <h2 className="scr-title">Hội thoại tiếng Anh</h2>
        <p className="scr-sub">Đăng nhập để tiếp tục.</p>
        <SignInButton />
      </div>
    );
  }
  if (missing) {
    return (
      <div>
        <h2 className="scr-title">Không tìm thấy buổi trò chuyện</h2>
        <button type="button" className="btn-secondary" onClick={() => router.push("/conversation")}>Về trang Hội thoại</button>
      </div>
    );
  }
  if (!session) return <p>Đang tải…</p>;
  if (state.phase === "grading") {
    return (
      <div className="iv-grading" role="status">
        <h2 className="scr-title">Đang chấm bài…</h2>
        <p className="scr-sub">AI đang đọc lại cuộc trò chuyện của bạn. Thường mất 10–30 giây.</p>
      </div>
    );
  }

  const setup = session.setup;

  async function handleStart() {
    audio.stop();
    const ok = await startRecorder();
    if (!ok) return;
    if (!RECORDING_START_PHASES.has(phaseRef.current)) {
      // The session moved on while the mic prompt was pending: release the mic.
      cancelRecorder();
      return;
    }
    dispatch({ type: "START_RECORDING" });
  }

  function handleSend() {
    const text = joinSegments(state.segments, state.draft);
    if (!text) return;
    audio.stop();
    appendMessage({ role: "user", text });
    recordingRef.current = null;
    setSuggestions(null);
    dispatch({ type: "SEND" });
  }

  function handleEnd() {
    audio.stop();
    cancelRecorder();
    if (state.phase === "idle" || state.phase === "review") {
      const text = joinSegments(state.segments, state.draft);
      if (text) appendMessage({ role: "user", text });
    }
    dispatch({ type: "END" });
  }

  function handleReplay(index: number) {
    const m = messagesRef.current[index];
    if (!m) return;
    audio.stop();
    void audio.speak(m.text);
  }

  async function handleTranslate(index: number) {
    const m = messagesRef.current[index];
    if (!m || !settings || translations[index]) return;
    setTranslatingIndex(index);
    setHelperError(null);
    try {
      const vi = parseConversationTranslation(await callInterviewAi(settings, buildConversationTranslatePrompt(m.text)));
      setTranslations((t) => ({ ...t, [index]: vi }));
    } catch {
      setHelperError("Không dịch được — thử lại sau.");
    }
    setTranslatingIndex(null);
  }

  async function handleHint(index: number) {
    const m = messagesRef.current[index];
    if (!m || m.role !== "user" || m.hint || !settings) return;
    setHintLoadingIndex(index);
    setHelperError(null);
    try {
      const previousAi = [...messagesRef.current.slice(0, index)].reverse().find((x) => x.role === "ai")?.text ?? "";
      const hint = parseHint(await callInterviewAi(settings, buildHintPrompt({ setup, userText: m.text, previousAi })));
      const next = messagesRef.current.map((x, i) => (i === index ? { ...x, hint } : x));
      messagesRef.current = next;
      setMessages(next);
      persist({ messages: next });
    } catch {
      setHelperError("Không lấy được gợi ý sửa — bấm lại để thử.");
    }
    setHintLoadingIndex(null);
  }

  async function handleSuggest() {
    if (!settings) return;
    setSuggesting(true);
    setHelperError(null);
    try {
      const currentGoal = setup.goals.find((_, i) => !goalsDoneRef.current.includes(i)) ?? null;
      const options = parseSuggest(
        await callInterviewAi(
          settings,
          buildSuggestPrompt({ setup, currentGoal, summary: summaryRef.current, window: messagesRef.current.slice(-4) })
        )
      );
      setSuggestions(options);
    } catch {
      setHelperError("Không gợi ý được — bấm lại để thử.");
    }
    setSuggesting(false);
  }

  const canReplay = state.phase === "idle" || state.phase === "review";
  const roleplay = setup.mode === "roleplay";

  return (
    <div className="iv-session">
      <header className="iv-session-head">
        <button type="button" className="btn-secondary" onClick={handleEnd} disabled={state.phase === "transcribing"}>
          Kết thúc &amp; xem báo cáo
        </button>
        <div className="iv-session-title">
          <strong>{`${setup.topic} · ${setup.level}`}</strong>
          <span className="iv-muted">{`${roleplay ? "Nhập vai" : "Chủ đề tự do"} · Lượt ${state.userTurns} / ${MAX_USER_TURNS}`}</span>
        </div>
      </header>

      <div className="iv-session-body">
        <div className="cv-main">
          <ChatThread
            messages={messages}
            thinking={state.phase === "aiThinking"}
            hintLoadingIndex={hintLoadingIndex}
            translations={translations}
            translatingIndex={translatingIndex}
            canReplay={canReplay}
            onReplay={handleReplay}
            onTranslate={(i) => void handleTranslate(i)}
            onHint={(i) => void handleHint(i)}
          />
          {helperError && <p className="iv-error" role="alert">{helperError}</p>}
          {state.wrapUpOffered && !roleplay && state.phase === "idle" && (
            <div className="cv-wrapup" role="status">
              <span>Bạn đã trò chuyện khá lâu — kết thúc và xem báo cáo?</span>
              <button type="button" className="btn-primary" onClick={handleEnd}>Kết thúc</button>
              <button type="button" className="btn-secondary" onClick={() => dispatch({ type: "DISMISS_WRAP_UP" })}>Nói tiếp</button>
            </div>
          )}
        </div>
        {roleplay && (
          <aside className="iv-session-side">
            <GoalChecklist persona={setup.persona} goals={setup.goals} goalsDone={goalsDone} />
          </aside>
        )}
      </div>

      <Composer
        state={state}
        elapsed={elapsed}
        micError={micError === "denied"}
        suggestions={suggestions}
        suggesting={suggesting}
        openingError={openingError ?? undefined}
        onEditDraft={(text) => dispatch({ type: "EDIT_DRAFT", text })}
        onSend={handleSend}
        onAddSegment={() => dispatch({ type: "ADD_SEGMENT" })}
        onStart={() => void handleStart()}
        onStop={() => void handleStop()}
        onRetryTranscribe={() => dispatch({ type: "RETRY_TRANSCRIBE" })}
        onSuggest={() => void handleSuggest()}
        onPickSuggestion={(text) => {
          dispatch({ type: "EDIT_DRAFT", text });
          setSuggestions(null);
        }}
        onCloseSuggestions={() => setSuggestions(null)}
        onRetryReply={() => dispatch({ type: "RETRY_REPLY" })}
        onRetryOpening={() => dispatch({ type: "RETRY_OPENING" })}
        onSkipSpeech={() => {
          dispatch({ type: "SPEECH_ENDED" });
          audio.stop();
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add the layout rule**

Append to the end of `apps/web/src/styles/bloom.css`:

```css
.cv-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
```

- [ ] **Step 3: Typecheck and run the whole suite**

Run: `npm run typecheck` — Expected: no errors. Fix any type error by adjusting the page (do not change tested modules' signatures).
Run: `npm test` — Expected: all existing + new tests PASS.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(app)/conversation/[id]/page.tsx" apps/web/src/styles/bloom.css
git commit -m "feat(web/conversation): chat session page" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Report screen (components + page)

**Files:**
- Create: `apps/web/src/components/conversation/ConversationReportSummary.tsx`
- Create: `apps/web/src/components/conversation/RecurringMistakes.tsx`
- Create: `apps/web/src/components/conversation/CorrectionList.tsx`
- Create: `apps/web/src/components/conversation/PhraseSaveList.tsx`
- Create: `apps/web/src/app/(app)/conversation/[id]/report/page.tsx`
- Modify: `apps/web/src/styles/bloom.css` (append)
- Test: `apps/web/src/components/conversation/CorrectionList.test.tsx`, `PhraseSaveList.test.tsx`, `ConversationReportSummary.test.tsx`

**Interfaces:**
- Produces:
  - `ConversationReportSummary({ report: ConversationReport; delta: number | null })`
  - `RecurringMistakes({ items: ConversationMistake[] })`
  - `CorrectionList({ items: ConversationCorrection[] })`
  - `PhraseSaveList({ phrases: ConversationPhrase[]; saved: Set<string>; onSave(phrase: ConversationPhrase): void })`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/conversation/ConversationReportSummary.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationReportSummary } from "./ConversationReportSummary";
import type { ConversationReport } from "@/lib/conversationTypes";

const REPORT: ConversationReport = {
  overall: 7.2,
  criteria: { grammar: 6.5, vocabulary: 7.5, fluency: 7, coherence: 8 },
  criteriaNotes: { grammar: "Chú ý thì quá khứ.", vocabulary: "", fluency: "", coherence: "" },
  recurringMistakes: [], corrections: [], phrases: [],
};

describe("ConversationReportSummary", () => {
  it("shows the overall score, each criterion and its note", () => {
    render(<ConversationReportSummary report={REPORT} delta={null} />);
    expect(screen.getByText("7.2")).toBeInTheDocument();
    expect(screen.getByText("Ngữ pháp")).toBeInTheDocument();
    expect(screen.getByText("6.5")).toBeInTheDocument();
    expect(screen.getByText("Chú ý thì quá khứ.")).toBeInTheDocument();
    expect(screen.getByText(/không chấm phát âm/i)).toBeInTheDocument();
  });
  it("shows the delta only when given, with its sign", () => {
    const { rerender } = render(<ConversationReportSummary report={REPORT} delta={0.4} />);
    expect(screen.getByText("+0.4 so với buổi trước")).toBeInTheDocument();
    rerender(<ConversationReportSummary report={REPORT} delta={-1} />);
    expect(screen.getByText("-1 so với buổi trước")).toBeInTheDocument();
    rerender(<ConversationReportSummary report={REPORT} delta={null} />);
    expect(screen.queryByText(/so với buổi trước/)).not.toBeInTheDocument();
  });
  it("shows the goal result only for role-play reports", () => {
    const { rerender } = render(<ConversationReportSummary report={REPORT} delta={null} />);
    expect(screen.queryByText("Kết quả mục tiêu")).not.toBeInTheDocument();
    rerender(<ConversationReportSummary report={{ ...REPORT, goalResult: { achieved: true, comment: "Đạt cả hai." } }} delta={null} />);
    expect(screen.getByText("Kết quả mục tiêu")).toBeInTheDocument();
    expect(screen.getByText("Đạt cả hai.")).toBeInTheDocument();
  });
});
```

Create `apps/web/src/components/conversation/CorrectionList.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CorrectionList } from "./CorrectionList";
import { RecurringMistakes } from "./RecurringMistakes";

describe("CorrectionList", () => {
  it("renders the word diff and the Vietnamese note per correction", () => {
    render(<CorrectionList items={[{ messageIndex: 1, said: "I go to Da Nang", corrected: "I went to Da Nang", note: "Dùng quá khứ." }]} />);
    expect(screen.getByText("go")).toBeInTheDocument(); // removed word
    expect(screen.getByText("went")).toBeInTheDocument(); // added word
    expect(screen.getByText("Dùng quá khứ.")).toBeInTheDocument();
  });
  it("shows an empty state", () => {
    render(<CorrectionList items={[]} />);
    expect(screen.getByText("Không có câu nào cần sửa.")).toBeInTheDocument();
  });
});

describe("RecurringMistakes", () => {
  it("lists patterns with said → better examples, or renders nothing when empty", () => {
    const { container, rerender } = render(<RecurringMistakes items={[]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<RecurringMistakes items={[{ pattern: "Quên chia quá khứ", examples: [{ said: "I go", better: "I went" }] }]} />);
    expect(screen.getByText("Quên chia quá khứ")).toBeInTheDocument();
    expect(screen.getByText("I go")).toBeInTheDocument();
    expect(screen.getByText("I went")).toBeInTheDocument();
  });
});
```

Create `apps/web/src/components/conversation/PhraseSaveList.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PhraseSaveList } from "./PhraseSaveList";

const PHRASES = [
  { text: "I would like", meaning: "tôi muốn", example: "I would like some water." },
  { text: "freshly caught", meaning: "mới đánh bắt", example: "We ate freshly caught fish." },
];

describe("PhraseSaveList", () => {
  it("saves an unsaved phrase and shows saved ones as disabled", () => {
    const onSave = vi.fn();
    render(<PhraseSaveList phrases={PHRASES} saved={new Set(["freshly caught"])} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /I would like/ }));
    expect(onSave).toHaveBeenCalledWith(PHRASES[0]);
    expect(screen.getByRole("button", { name: /freshly caught ✓ đã lưu/ })).toBeDisabled();
  });
  it("renders nothing for an empty list", () => {
    const { container } = render(<PhraseSaveList phrases={[]} saved={new Set()} onSave={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/conversation/ConversationReportSummary.test.tsx src/components/conversation/CorrectionList.test.tsx src/components/conversation/PhraseSaveList.test.tsx`
Expected: FAIL (cannot resolve modules).

- [ ] **Step 3: Write the components**

Create `apps/web/src/components/conversation/ConversationReportSummary.tsx`:

```tsx
import { CONVERSATION_CRITERIA, type ConversationReport } from "@/lib/conversationTypes";

export function ConversationReportSummary({ report, delta }: { report: ConversationReport; delta: number | null }) {
  return (
    <section className="iv-card cv-summary" aria-label="Điểm tổng">
      <div className="cv-overall">
        <span className="iv-caps">Điểm tổng</span>
        <strong className="cv-overall-score">{report.overall.toFixed(1)}</strong>
        {delta !== null && <span className="iv-muted">{`${delta > 0 ? "+" : ""}${delta} so với buổi trước`}</span>}
      </div>
      <div className="cv-criteria">
        {CONVERSATION_CRITERIA.map(({ key, label }) => (
          <div key={key} className="cv-criterion">
            <div className="iv-row cv-criterion-head">
              <span>{label}</span>
              <strong>{report.criteria[key].toFixed(1)}</strong>
            </div>
            <div className="cv-bar" aria-hidden="true"><span style={{ width: `${report.criteria[key] * 10}%` }} /></div>
            {report.criteriaNotes[key] && <p className="iv-muted">{report.criteriaNotes[key]}</p>}
          </div>
        ))}
      </div>
      {report.goalResult && (
        <div className="cv-goal-result">
          <span className="iv-caps">Kết quả mục tiêu</span>
          <strong>{report.goalResult.achieved ? "Đạt mục tiêu" : "Chưa đạt mục tiêu"}</strong>
          <p>{report.goalResult.comment}</p>
        </div>
      )}
      <p className="iv-muted">Chưa chấm phát âm: hệ thống chỉ nhận lại chữ bạn nói, không nghe được cách phát âm.</p>
    </section>
  );
}
```

Create `apps/web/src/components/conversation/RecurringMistakes.tsx`:

```tsx
import type { ConversationMistake } from "@/lib/conversationTypes";

export function RecurringMistakes({ items }: { items: ConversationMistake[] }) {
  if (items.length === 0) return null;
  return (
    <section className="iv-card" aria-label="Lỗi lặp lại">
      <h3 className="iv-card-title">Lỗi lặp lại</h3>
      {items.map((m, i) => (
        <div key={i} className="cv-mistake">
          <strong>{m.pattern}</strong>
          {m.examples.map((e, j) => (
            <p key={j} className="cv-example">
              <del>{e.said}</del> → <ins>{e.better}</ins>
            </p>
          ))}
        </div>
      ))}
    </section>
  );
}
```

Hmm: tests use `getByText("I go")` / `getByText("I went")`; `<del>`/`<ins>` elements each contain exactly that text, so they match.

Create `apps/web/src/components/conversation/CorrectionList.tsx`:

```tsx
import type { ConversationCorrection } from "@/lib/conversationTypes";
import { WordDiff } from "@/components/interview/WordDiff";

export function CorrectionList({ items }: { items: ConversationCorrection[] }) {
  return (
    <section className="iv-card" aria-label="Câu đáng sửa">
      <h3 className="iv-card-title">Câu đáng sửa nhất</h3>
      {items.length === 0 && <p className="iv-muted">Không có câu nào cần sửa.</p>}
      {items.map((c) => (
        <div key={c.messageIndex} className="cv-hint">
          <WordDiff before={c.said} after={c.corrected} />
          {c.note && <p className="iv-muted">{c.note}</p>}
        </div>
      ))}
    </section>
  );
}
```

Create `apps/web/src/components/conversation/PhraseSaveList.tsx`:

```tsx
import type { ConversationPhrase } from "@/lib/conversationTypes";

export interface PhraseSaveListProps {
  phrases: ConversationPhrase[];
  saved: Set<string>;
  onSave(phrase: ConversationPhrase): void;
}

export function PhraseSaveList({ phrases, saved, onSave }: PhraseSaveListProps) {
  if (phrases.length === 0) return null;
  return (
    <section className="iv-card" aria-label="Cụm nên học">
      <h3 className="iv-card-title">Cụm nên học</h3>
      <div className="iv-row">
        {phrases.map((p) => {
          const isSaved = saved.has(p.text);
          return (
            <button
              key={p.text}
              type="button"
              className={isSaved ? "iv-phrase iv-phrase-saved" : "iv-phrase"}
              disabled={isSaved}
              title={p.meaning}
              onClick={() => onSave(p)}
            >
              {isSaved ? `${p.text} ✓ đã lưu` : `${p.text} ＋`}
            </button>
          );
        })}
      </div>
      <p className="iv-muted">→ lưu vào Ngân hàng từ vựng</p>
    </section>
  );
}
```

- [ ] **Step 4: Write the report page**

Create `apps/web/src/app/(app)/conversation/[id]/report/page.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { useRouteParams } from "@/lib/useRouteParams";
import { SignInButton } from "@/components/SignInButton";
import { callInterviewAi, hasAiKey } from "@/lib/interviewAi";
import { buildConversationReportPrompt, parseConversationReport, userMessageIndexes } from "@/lib/conversationReportPrompt";
import { completeConversationSession, getConversationSession, listRecentConversationSessions } from "@/lib/conversationSessions";
import { getVocabRecordByHeadword, saveVocabRecord } from "@/lib/vocabRecords";
import { capitalizeHeadword } from "@/lib/vocabDisplay";
import type { ConversationPhrase, ConversationSession } from "@/lib/conversationTypes";
import { ConversationReportSummary } from "@/components/conversation/ConversationReportSummary";
import { RecurringMistakes } from "@/components/conversation/RecurringMistakes";
import { CorrectionList } from "@/components/conversation/CorrectionList";
import { PhraseSaveList } from "@/components/conversation/PhraseSaveList";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export default function ConversationReportPage({ params }: { params: Promise<{ id: string }> }) {
  const resolved = useRouteParams(params);
  const id = resolved?.id ?? null;
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();
  const { settings } = useSettingsContext();
  const [session, setSession] = useState<ConversationSession | null>(null);
  const [previous, setPrevious] = useState<ConversationSession | null>(null);
  const [missing, setMissing] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [regrading, setRegrading] = useState(false);
  const [regradeError, setRegradeError] = useState<string | null>(null);
  const [phraseSaveError, setPhraseSaveError] = useState<string | null>(null);
  const savingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    getConversationSession(user.uid, id)
      .then(async (s) => {
        if (cancelled) return;
        if (!s) {
          setMissing(true);
          return;
        }
        if (s.status === "in_progress") {
          router.replace(`/conversation/${id}`);
          return;
        }
        setSession(s);
        const recent = await listRecentConversationSessions(user.uid, 10).catch(() => []);
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
        <h2 className="scr-title">Kết quả hội thoại</h2>
        <p className="scr-sub">Đăng nhập để xem kết quả.</p>
        <SignInButton />
      </div>
    );
  }
  if (missing) {
    return (
      <div>
        <h2 className="scr-title">Không tìm thấy buổi trò chuyện</h2>
        <Link href="/conversation">Về trang Hội thoại</Link>
      </div>
    );
  }
  if (!session) return <p>Đang tải…</p>;

  const report = session.report;
  const delta = report && previous?.report ? Math.round((report.overall - previous.report.overall) * 10) / 10 : null;

  async function handleRegrade() {
    if (!user || !settings || !session) return;
    setRegrading(true);
    setRegradeError(null);
    try {
      const next = parseConversationReport(
        await callInterviewAi(
          settings,
          buildConversationReportPrompt(session.setup, session.summary, session.messages, session.goalsDone)
        ),
        userMessageIndexes(session.messages),
        session.setup.mode === "roleplay"
      );
      await completeConversationSession(user.uid, session.id, next);
      setSession({ ...session, report: next, reportError: false });
    } catch (err) {
      setRegradeError(err instanceof Error ? err.message : "Chấm lại thất bại.");
    }
    setRegrading(false);
  }

  async function handleSavePhrase(phrase: ConversationPhrase) {
    if (!user) return;
    // Guards a double-click from firing two saves for the same phrase.
    if (savingRef.current.has(phrase.text)) return;
    savingRef.current.add(phrase.text);
    const headword = capitalizeHeadword(phrase.text.trim());
    setPhraseSaveError(null);
    try {
      const existing = await getVocabRecordByHeadword(user.uid, headword, "english");
      if (!existing) {
        const now = new Date().toISOString();
        await saveVocabRecord(user.uid, {
          headword,
          inputType: "phrase",
          ipa: "",
          meaning: phrase.meaning,
          examples: phrase.example ? [phrase.example] : [],
          personalNotes: "Từ luyện Hội thoại tiếng Anh",
          topicIds: [],
          targetLanguage: "english",
          cefrLevel: "b1",
          activeContext: "general",
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
      setPhraseSaveError("Không lưu được cụm từ — thử lại.");
    } finally {
      savingRef.current.delete(phrase.text);
    }
  }

  return (
    <div className="iv-page iv-report">
      <header className="iv-report-head">
        <div>
          <Link href="/conversation">← Hội thoại</Link>
          <h2 className="scr-title">Kết quả hội thoại</h2>
          <p className="iv-muted">
            {`${session.setup.topic} · ${session.setup.level} · ${session.setup.mode === "roleplay" ? "Nhập vai" : "Chủ đề tự do"} · ${formatDate(session.createdAt)}`}
          </p>
        </div>
        <Link href="/conversation" className="btn-primary">Buổi mới</Link>
      </header>

      {report ? (
        <>
          <ConversationReportSummary report={report} delta={delta} />
          <RecurringMistakes items={report.recurringMistakes} />
          <CorrectionList items={report.corrections} />
          {phraseSaveError && <p className="iv-error" role="alert">{phraseSaveError}</p>}
          <PhraseSaveList phrases={report.phrases} saved={saved} onSave={(p) => void handleSavePhrase(p)} />
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
    </div>
  );
}
```

`activeContext: "general"` is a valid `VocabRecord` value (also used by `vocabDraft.ts`).

- [ ] **Step 5: Append CSS**

Append to the end of `apps/web/src/styles/bloom.css`:

```css

.cv-summary { gap: 16px; }
.cv-overall { display: flex; flex-direction: column; gap: 2px; }
.cv-overall-score { font-size: 48px; line-height: 1.1; color: var(--accent); }
.cv-criteria { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px 28px; }
.cv-criterion { display: flex; flex-direction: column; gap: 6px; }
.cv-criterion-head { justify-content: space-between; flex-wrap: nowrap; font-weight: 600; }
.cv-goal-result { display: flex; flex-direction: column; gap: 4px; background: var(--surface-2); border-radius: 14px; padding: 12px 14px; }
.cv-goal-result p { margin: 0; }
.cv-mistake { display: flex; flex-direction: column; gap: 4px; padding: 8px 0; border-top: 1px solid var(--surface-3); }
.cv-example { margin: 0; font-size: 15.5px; }
.cv-example del { color: var(--danger); background: var(--danger-bg); text-decoration: none; border-radius: 4px; padding: 0 3px; }
.cv-example ins { color: var(--success); background: var(--success-bg); text-decoration: none; font-weight: 600; border-radius: 4px; padding: 0 3px; }
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run src/components/conversation` — Expected: all PASS.
Run: `npm run typecheck` — Expected: no errors (fix `activeContext` per the note above if flagged).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/conversation "apps/web/src/app/(app)/conversation/[id]/report/page.tsx" apps/web/src/styles/bloom.css
git commit -m "feat(web/conversation): report screen" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Spec sync, README, and final verification

**Files:**
- Modify: `docs/superpowers/specs/2026-10-09-conversation-practice-design.md`
- Modify: `README.md`

- [ ] **Step 1: Sync the spec with what was built**

In the spec:
1. §4.2 state-machine diagram: replace the line `warming → aiSpeaking → idle → recording → review → sending → aiThinking → aiSpeaking → … → closing → grading → done` with `warming → aiSpeaking → idle → recording → transcribing → review → aiThinking → aiSpeaking → … → grading` and add under it: `- There is no separate sending/closing phase: Send persists the user message and enters \`aiThinking\`; the AI's final line (all role-play goals done, or the 30-turn cap) is spoken, then the machine goes to \`grading\`. Failures add \`sttError\` and \`replyError\`.`
2. §3.2 `ConversationReport` is in §6: change `phrases: string[];                     // 4–8 English phrases for the vocab bank` to `phrases: { text: string; meaning: string; example: string }[];  // 4–8 English phrases; meaning is Vietnamese`.
3. §10: append bullets: `- Persona is stored in English (it steers the AI); role-play goals are in Vietnamese (shown to the learner). No character names or avatar letters: the AI avatar is "AI".` and `- The mockup's mic-denied and "+ Nói thêm" states follow §8/§4.2.`

- [ ] **Step 2: README**

Find the Interview feature line: run `grep -n "Phỏng vấn" README.md`. Directly after that feature's bullet(s), add a bullet in the same style/language:

`- **Hội thoại tiếng Anh (web):** trò chuyện với AI bằng giọng nói hoặc gõ, về một chủ đề tự do hoặc nhập vai một tình huống có mục tiêu; gợi ý sửa câu và gợi ý cách nói theo yêu cầu, báo cáo cuối buổi với lỗi lặp lại, câu đáng sửa và cụm từ lưu vào Ngân hàng từ vựng.`

If README has no Interview bullet, add the line under the web feature list.

- [ ] **Step 3: Full verification**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all tests PASS (record the totals).
Run: `npm run build` — Expected: Next.js build succeeds and lists `/conversation`, `/conversation/[id]`, `/conversation/[id]/report`.

- [ ] **Step 4: Manual verification (needs the deployed Cloud Functions + a BYOK key)**

Run `npm run dev` from `apps/web/`, sign in, then check:
1. Free topic (Du lịch, B1): the AI opens and speaks; reply by typing; reply by voice with transcript review; use "+ Nói thêm" to merge two segments into one bubble; one AI reply per send.
2. "Gợi ý sửa" on a user message shows a diff + note; tapping again makes no network call (DevTools).
3. "Gợi ý cách nói" shows 2–3 options; picking one fills the composer.
4. Role-play (Gọi món ở nhà hàng): checklist ticks as goals are met; when all done the AI closes, speaks, and the report opens with "Kết quả mục tiêu".
5. Kill the network mid-reply: the user message stays, "Thử lại" works. Reload mid-session: the chat resumes.
6. Report: scores, recurring mistakes, corrections, phrase save (appears in the vocab bank with the example), "Chấm lại" if grading failed, reopening an old report with no AI key set.
7. Topic mode around user turn 12 shows the wrap-up chip; "Nói tiếp" dismisses it.

Report anything that fails instead of claiming success.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-10-09-conversation-practice-design.md README.md
git commit -m "docs: sync conversation spec with implementation, add README entry" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** §2 scope — Setup (Task 8), Chat with voice/typed composer, review, "+ Nói thêm", replay/translate/"Gợi ý sửa"/"Gợi ý cách nói", end (Tasks 9–10), role-play persona/goals/checklist (Tasks 8–10), report (Tasks 6, 11), history/recent + old report without AI key (Tasks 4, 8, 11). §3 routes/sidebar (Tasks 7–11), data (Tasks 1, 4). §4 flow: start/opening/resume (Task 10), machine (Task 5), per-turn + condense (Tasks 3, 10), helpers (Task 10). §5 prompts (Tasks 2, 6). §6 report incl. delta + no-pronunciation note (Tasks 6, 11). §8 errors: each row is handled in Tasks 5/9/10 (mic denied allows typing: Task 8 `canStart` ignores mic; `micError` copy in Composer). §9 tests: machine, parsers, history, scenarios, Composer, hint cache — NOTE: the spec lists a "HintBubble second tap uses cache, no AI call" component test and a "SuggestPanel option fills composer" test; the cache is enforced in the page by the early return `if (m.hint) return` in `handleHint` and the option-fill is covered by the `Composer` suggestions test plus `onPickSuggestion` → `EDIT_DRAFT` in the page. §11 deploy: nothing to build.

**Placeholder scan:** no TBD/TODO; every code step has full code. One intentional verification note in Task 11 (`activeContext` valid values) is a concrete check with a fallback, not a placeholder.

**Type consistency:** `ConversationProgress` (Task 4) used in Task 10; `joinSegments` (Task 5) used by Composer/page; `replyFlags`, `isScenarioComplete` (Task 5) used in Task 10; `ReplyInput` fields match the page's `buildReplyPrompt` call (`goalsDone`, `offerEnd`, `mustClose`); `ConversationPhrase {text, meaning, example}` consistent across Tasks 1, 6, 11; `parseConversationReport(raw, userIndexes, hasGoals)` consistent in Tasks 6, 10, 11; `unsummarizedWindow`/`planCondense` (Task 3) match Task 10 usage; `ComposerProps` handlers match the page's props one-to-one.
