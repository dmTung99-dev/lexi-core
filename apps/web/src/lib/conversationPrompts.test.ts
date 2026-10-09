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
