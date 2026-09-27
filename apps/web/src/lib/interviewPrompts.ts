import { parseAiJsonObject } from "./parseAiJson";
import type { InterviewPlanItem, InterviewSetup } from "./interviewTypes";

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
Write exactly ${setup.questionCount} main interview questions, in the order you will ask them, each with a natural Vietnamese translation (for a candidate who wants to check meaning, not a word-for-word gloss).
- Start with a short warm-up question (e.g. a brief self-introduction), end with a natural closing question.
- Fit the seniority and interview type. If a CV summary is given, at least half the questions must reference specific experience from it. If a job description is given, cover its key requirements.
- One question per item, spoken style, max 35 words each, no numbering.

Return ONLY a JSON object, no prose:
{"questions": [{"en": "...", "vi": "..."}, ...]}`;
}

export function parseQuestionPlan(raw: string, count: number): InterviewPlanItem[] {
  const items = parseJson(raw).questions;
  const questions = (Array.isArray(items) ? items : [])
    .map((item) => {
      const o = (item ?? {}) as Record<string, unknown>;
      return { en: str(o.en), vi: str(o.vi) };
    })
    .filter((q) => q.en.length > 0);
  if (questions.length < count) throw new InterviewAiError("AI không tạo đủ câu hỏi.");
  return questions.slice(0, count);
}

export interface NextTurnInput {
  setup: InterviewSetup;
  mainQuestion: string;
  exchanges: { question: string; answer: string }[];
  nextMainQuestion: string | null;
}

export type NextTurnDecision =
  | { action: "follow_up"; say: string; vi: string }
  | { action: "next"; ack: string };

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
1. Ask ONE follow-up question if the answer is vague, lacks the candidate's own concrete actions or results, or makes a claim worth probing. Max 30 words, spoken style, directly about what they said. Also give "vi": a natural Vietnamese translation of "say".
2. Move on, with a brief neutral acknowledgement (max 12 words, e.g. "Thanks, that's helpful."). Do not give feedback or scores.

Return ONLY a JSON object, no prose — either
{"action": "follow_up", "say": "...", "vi": "..."}
or
{"action": "next", "ack": "..."}`;
}

export function parseNextTurn(raw: string): NextTurnDecision {
  const json = parseJson(raw);
  if (json.action === "follow_up") {
    const say = str(json.say);
    if (!say) throw new InterviewAiError("AI thiếu câu hỏi xoáy.");
    return { action: "follow_up", say, vi: str(json.vi) };
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
