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

  it("returns exactly count questions with their translations, trimming extras", () => {
    const raw = JSON.stringify({
      questions: [
        { en: "Q1", vi: "C1" },
        { en: " Q2 ", vi: " C2 " },
        { en: "Q3", vi: "C3" },
        { en: "Q4", vi: "C4" },
        { en: "Q5", vi: "C5" },
        { en: "Q6", vi: "C6" },
      ],
    });
    expect(parseQuestionPlan(raw, 5)).toEqual([
      { en: "Q1", vi: "C1" },
      { en: "Q2", vi: "C2" },
      { en: "Q3", vi: "C3" },
      { en: "Q4", vi: "C4" },
      { en: "Q5", vi: "C5" },
    ]);
  });

  it("throws when fewer than count valid questions", () => {
    expect(() => parseQuestionPlan(JSON.stringify({ questions: [{ en: "Q1", vi: "C1" }, { en: "" }] }), 5)).toThrow(
      InterviewAiError
    );
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

  it("parses follow_up, including its translation", () => {
    expect(parseNextTurn('{"action":"follow_up","say":"Why Redux?","vi":"Vì sao Redux?"}')).toEqual({
      action: "follow_up",
      say: "Why Redux?",
      vi: "Vì sao Redux?",
    });
  });

  it("defaults vi to empty when the AI omits it", () => {
    expect(parseNextTurn('{"action":"follow_up","say":"Why Redux?"}')).toEqual({
      action: "follow_up",
      say: "Why Redux?",
      vi: "",
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
