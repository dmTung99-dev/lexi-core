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
