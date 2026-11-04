import { describe, expect, it } from "vitest";
import { practiceTargetsSection, topicMemorySection } from "./learnerMemoryPrompt";
import type { MistakeTarget, TopicFact } from "./learnerMemoryTypes";

const FACT: TopicFact = { id: "f1", fact: "Went to Da Lat in March with family", asked: ["food", "weather"], updatedAt: "2026-11-01T00:00:00Z" };
const TARGET: MistakeTarget = {
  id: "m1", pattern: "past tense", rule: "Use the simple past for finished events.",
  example: { said: "I go there yesterday", better: "I went there yesterday" },
};

describe("topicMemorySection", () => {
  it("is empty without facts", () => {
    expect(topicMemorySection([])).toBe("");
  });

  it("lists facts with asked angles and the anti-interrogation rules", () => {
    const s = topicMemorySection([FACT]);
    expect(s).toContain("What you already know about this learner");
    expect(s).toContain("Went to Da Lat in March with family");
    expect(s).toContain("food, weather");
    expect(s).toContain("Do not ask again about angles already covered");
    expect(s).toContain("never press for small details or private matters");
    expect(s).toContain("move to a different angle");
    expect(s).toContain("Do not open by saying you remember");
  });

  it("handles a fact with no asked angles", () => {
    expect(topicMemorySection([{ ...FACT, asked: [] }])).toContain("Went to Da Lat in March with family");
  });
});

describe("practiceTargetsSection", () => {
  it("is empty without targets", () => {
    expect(practiceTargetsSection([], "conversation")).toBe("");
    expect(practiceTargetsSection([], "interview")).toBe("");
  });

  it("conversation: lists targets and forbids correcting or mentioning them", () => {
    const s = practiceTargetsSection([TARGET], "conversation");
    expect(s).toContain("Practice targets");
    expect(s).toContain(TARGET.rule);
    expect(s).toContain("I go there yesterday");
    expect(s).toContain("I went there yesterday");
    expect(s).toContain("never correct");
    expect(s).toContain("never mention");
  });

  it("interview: asks for up to 2 questions shaped around the targets", () => {
    const s = practiceTargetsSection([TARGET], "interview");
    expect(s).toContain("Practice targets");
    expect(s).toContain("up to 2 questions");
    expect(s).toContain(TARGET.rule);
  });
});
