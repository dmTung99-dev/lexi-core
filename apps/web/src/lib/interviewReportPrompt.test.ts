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
