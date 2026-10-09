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
