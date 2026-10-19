import { InterviewAiError, parseJson, str } from "./interviewPrompts";
import { WHY_RULES, parseWhy } from "./conversationPrompts";
import {
  CONVERSATION_CRITERIA,
  type ConversationCorrection,
  type ConversationCriterionKey,
  type ConversationMessage,
  type ConversationMistake,
  type ConversationPhrase,
  type ConversationReport,
  type ConversationSetup,
  type WhyPoint,
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
      const hint = m.hint ? `\n    (earlier hint: "${m.hint.corrected}")` : "";
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
  "recurringMistakes": [{"pattern": "...", "rule": "...", "examples": [{"said": "...", "better": "..."}]}],
  "corrections": [{"messageIndex": 1, "said": "...", "corrected": "...", "note": "...", "why": [{"part": "...", "reason": "..."}]}],
  "phrases": [{"text": "...", "meaning": "...", "example": "..."}]${goalJson}
}

- Scores are 0–10 (one decimal for "overall"). Pronunciation cannot be judged; do not mention it.
- "criteriaNotes", recurringMistakes "pattern", corrections "note" and "goalResult.comment" are in VIETNAMESE, one short sentence each.
- Speech transcription can mishear words. When a word is nonsense in context but SOUNDS like a word that fits (e.g. "the book" where "a bug" is clearly meant, or "lorry" for "later"), treat it as a transcription error, not a learner mistake: leave it out of recurringMistakes, corrections and the scores. Only flag what the learner really got wrong.
- "recurringMistakes": at most 3 patterns that repeat; "said"/"better" are exact English quotes. "rule" is ONE short VIETNAMESE sentence stating the English rule to remember, contrasting with Vietnamese when that is the cause (e.g. "Danh từ bổ nghĩa đứng TRƯỚC danh từ chính, ngược tiếng Việt: danh sách công việc → task list").
- "corrections": at most 8 of the most worthwhile fixes. "messageIndex" is the bracketed number of a Learner message; "said" is that message (or the relevant part) verbatim; "corrected" changes as little as possible. If a hint was already given for a message, stay consistent with it. "why": one entry per edit (max 4). ${WHY_RULES} Here "part" is the fixed fragment as it appears in "corrected", and "reason" states the rule behind the fix, not just what changed.
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
      return { pattern: str(o.pattern), rule: str(o.rule), examples };
    })
    .filter((m) => m.pattern)
    .slice(0, 3);

  const corrections: ConversationCorrection[] = listOf(json.corrections)
    .map((item) => {
      const o = objectOf(item);
      return {
        messageIndex: o.messageIndex,
        said: str(o.said),
        corrected: str(o.corrected),
        note: str(o.note),
        why: parseWhy(o.why, 4),
      };
    })
    .filter(
      (c): c is ConversationCorrection & { why: WhyPoint[] } =>
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
