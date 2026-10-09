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
