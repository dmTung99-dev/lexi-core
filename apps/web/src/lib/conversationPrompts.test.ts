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
    expect(parseOpening('{"say":" Hi there! "}')).toEqual({ say: "Hi there!", vi: "" });
    expect(() => parseOpening('{"say":""}')).toThrow();
  });
  it("parses vi when present and defaults it to empty when absent", () => {
    expect(parseOpening('{"say":"Hi!","vi":" Xin chào! "}')).toEqual({ say: "Hi!", vi: "Xin chào!" });
    expect(parseOpening('{"say":"Hi!"}').vi).toBe("");
  });
  it("asks for a Vietnamese translation", () => {
    for (const setup of [TOPIC, ROLE]) {
      const p = buildOpeningPrompt(setup);
      expect(p).toContain('"vi"');
      expect(p).toContain("Vietnamese translation");
    }
  });
});

describe("reply", () => {
  const base = { summary: "", window: [{ role: "user" as const, text: "I like Da Nang" }], goalsDone: [], offerEnd: false, mustClose: false, userTurn: 1 };
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
    expect(out).toEqual({ say: "Nice!", vi: "", goalsDone: [1, 0], suggestEnd: true });
    expect(parseReply('{"say":"Ok"}', 0)).toEqual({ say: "Ok", vi: "", goalsDone: [], suggestEnd: false });
  });
  it("parses vi when present and defaults it to empty when absent", () => {
    expect(parseReply('{"say":"Nice!","vi":" Tuyệt! "}', 0).vi).toBe("Tuyệt!");
    expect(parseReply('{"say":"Nice!"}', 0).vi).toBe("");
  });
  it("asks for a Vietnamese translation in both modes", () => {
    for (const setup of [TOPIC, ROLE]) {
      const p = buildReplyPrompt({ ...base, setup });
      expect(p).toContain('"vi"');
      expect(p).toContain("Vietnamese translation");
    }
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
  it("asks for why points", () => {
    expect(buildHintPrompt({ setup: TOPIC, userText: "x", previousAi: "y" })).toContain('"why"');
  });
  it("parses corrected, note and up to 2 alternatives", () => {
    const out = parseHint('{"corrected":"I went to Da Nang","note":"Dùng quá khứ.","alternatives":["a","b","c"]}');
    expect(out).toEqual({ corrected: "I went to Da Nang", note: "Dùng quá khứ.", alternatives: ["a", "b"], why: [] });
  });
  it("parses why points, dropping incomplete ones and capping at 4", () => {
    const why = [
      { part: "went", reason: "Quá khứ đơn vì chuyến đi đã kết thúc." },
      { part: "", reason: "x" },
      { part: "to", reason: "" },
      "junk",
      { part: "b", reason: "r" }, { part: "c", reason: "r" }, { part: "d", reason: "r" }, { part: "e", reason: "r" },
    ];
    const out = parseHint(JSON.stringify({ corrected: "I went", note: "n", why }));
    expect(out.why).toEqual([
      { part: "went", reason: "Quá khứ đơn vì chuyến đi đã kết thúc." },
      { part: "b", reason: "r" }, { part: "c", reason: "r" }, { part: "d", reason: "r" },
    ]);
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
  it("asks for why points per option", () => {
    const p = buildSuggestPrompt({ setup: TOPIC, currentGoal: null, summary: "", window: [] });
    expect(p).toContain('"why"');
  });
  it("parses 2-3 options with why points, rejects fewer than 2", () => {
    const raw = JSON.stringify({
      options: [
        { text: "a", why: [{ part: "p", reason: "r" }, { part: "q", reason: "s" }, { part: "x", reason: "y" }, { part: "z", reason: "w" }] },
        { text: "b" },
        { text: "" },
        { text: "c", why: [] },
        { text: "d", why: [] },
      ],
    });
    expect(parseSuggest(raw)).toEqual([
      { text: "a", why: [{ part: "p", reason: "r" }, { part: "q", reason: "s" }, { part: "x", reason: "y" }] },
      { text: "b", why: [] },
      { text: "c", why: [] },
    ]);
    expect(() => parseSuggest('{"options":[{"text":"a"}]}')).toThrow();
  });
  it("still accepts plain-string options", () => {
    expect(parseSuggest('{"options":["a","b"]}')).toEqual([{ text: "a", why: [] }, { text: "b", why: [] }]);
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

describe("learner memory in conversation prompts", () => {
  const base = { summary: "", window: [{ role: "user" as const, text: "I like Da Lat" }], goalsDone: [], offerEnd: false, mustClose: false, userTurn: 2 };
  const FACTS = [{ id: "f1", fact: "Went to Da Lat in March with family", asked: ["food", "weather"], updatedAt: "2026-11-01T00:00:00Z" }];
  const TARGETS = [{ id: "m1", pattern: "past tense", rule: "Use the simple past for finished events.", example: { said: "I go there yesterday", better: "I went there yesterday" } }];
  const snap = (facts: typeof FACTS, targets: typeof TARGETS) => ({ groupKey: "free", groupLabel: "Tự do", facts, targets });
  const HEADINGS = ["What you already know about this learner", "Practice targets"];

  it("adds no memory headings without memory or with an empty snapshot", () => {
    for (const setup of [TOPIC, ROLE]) {
      for (const memory of [undefined, snap([], [])]) {
        const opening = buildOpeningPrompt(setup, memory);
        const reply = buildReplyPrompt({ ...base, setup, memory });
        for (const h of HEADINGS) {
          expect(opening).not.toContain(h);
          expect(reply).not.toContain(h);
        }
        expect(reply).toContain("NEVER correct the learner's mistakes");
      }
    }
  });

  it("opening and reply prompts carry the facts and the pacing rules", () => {
    const memory = snap(FACTS, []);
    for (const p of [buildOpeningPrompt(TOPIC, memory), buildReplyPrompt({ ...base, setup: TOPIC, memory })]) {
      expect(p).toContain("Went to Da Lat in March with family");
      expect(p).toContain("food, weather");
      expect(p).toContain("Do not ask again about angles already covered");
      expect(p).toContain("never press for small details or private matters");
      expect(p).toContain("move to a different angle");
      expect(p).toContain("Do not open by saying you remember");
      expect(p).not.toContain("Practice targets");
    }
  });

  it("reply prompt carries the practice targets with the never-correct wording on offering turns", () => {
    for (const userTurn of [2, 5, 8, 11]) {
      const p = buildReplyPrompt({ ...base, userTurn, setup: TOPIC, memory: snap([], TARGETS) });
      expect(p).toContain("Practice targets");
      expect(p).toContain("Use the simple past for finished events.");
      expect(p).toContain("If it fits naturally");
      expect(p).toContain("never correct");
      expect(p).toContain("never mention");
      expect(p).not.toContain("whole chat");
    }
  });

  it("omits the practice targets on every other turn and when there are none", () => {
    for (const userTurn of [1, 3, 4, 6, 7, 14]) {
      expect(buildReplyPrompt({ ...base, userTurn, setup: TOPIC, memory: snap([], TARGETS) })).not.toContain("Practice targets");
    }
    expect(buildReplyPrompt({ ...base, userTurn: 2, setup: TOPIC, memory: snap([], []) })).not.toContain("Practice targets");
  });

  it("tells the chat prompt that Tự do facts come from various topics", () => {
    const free = buildReplyPrompt({ ...base, setup: TOPIC, memory: snap(FACTS, []) });
    expect(free).toContain("various topics");
    expect(free).toContain("only bring one up if it fits the current topic");
    const other = buildReplyPrompt({ ...base, setup: TOPIC, memory: { ...snap(FACTS, []), groupKey: "topic_travel" } });
    expect(other).not.toContain("various topics");
  });
});
