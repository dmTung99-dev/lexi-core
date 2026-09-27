import {
  CRITERIA,
  combinedAnswer,
  type CriterionKey,
  type InterviewPhrase,
  type InterviewPlanItem,
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

export function buildReportPrompt(setup: InterviewSetup, plan: InterviewPlanItem[], turns: InterviewTurn[]): string {
  const blocks = answeredMainIndexes(turns).map((i) => {
    const lines = turns
      .filter((t) => t.mainIndex === i && !t.skipped)
      .map((t) => `${t.kind === "main" ? "Interviewer" : "Interviewer (follow-up)"}: ${t.question}\nCandidate: ${t.answer}`)
      .join("\n");
    return `### mainIndex ${i}\nPlanned question: ${plan[i]?.en ?? ""}\n${lines}\nCombined candidate answer: ${combinedAnswer(turns, i)}`;
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
