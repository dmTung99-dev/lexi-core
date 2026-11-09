import { describe, expect, it } from "vitest";
import { parseMemoryUpdate, practiceTargetsSection, reportMemorySection, topicMemorySection } from "./learnerMemoryPrompt";
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

describe("topicMemorySection free bucket", () => {
  it("notes facts come from various topics only for the free bucket", () => {
    expect(topicMemorySection([FACT], true)).toContain("various topics");
    expect(topicMemorySection([FACT], true)).toContain("only bring one up if it fits the current topic");
    expect(topicMemorySection([FACT])).not.toContain("various topics");
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

describe("reportMemorySection", () => {
  const tracked = [{ id: "m1", pattern: "past tense", rule: "Use the simple past." }];
  it("is empty with nothing tracked and no facts", () => {
    expect(reportMemorySection({ tracked: [], facts: null }, "conversation")).toBe("");
  });
  it("lists tracked ids and asks for mistakeChecks and trackedId", () => {
    const s = reportMemorySection({ tracked, facts: null }, "interview");
    expect(s).toContain("m1");
    expect(s).toContain('"mistakeChecks"');
    expect(s).toContain('"trackedId"');
    expect(s).not.toContain("topicFacts");
  });
  it("asks for topicFacts with previous facts for conversations", () => {
    const s = reportMemorySection({ tracked, facts: [FACT] }, "conversation");
    expect(s).toContain('"topicFacts"');
    expect(s).toContain(FACT.fact);
  });
  it("asks for topicFacts even with no previous facts (empty list)", () => {
    expect(reportMemorySection({ tracked: [], facts: [] }, "conversation")).toContain('"topicFacts"');
  });
  it("tells the model to keep facts from other topics for the free bucket", () => {
    const s = reportMemorySection({ tracked, facts: [FACT], freeTopic: true }, "conversation");
    expect(s).toContain("various typed-in topics");
    expect(s).toContain("keep facts from other topics unless this session superseded them");
    expect(reportMemorySection({ tracked, facts: [FACT] }, "conversation")).not.toContain("various typed-in topics");
  });
  it("omits topicFacts when facts is null", () => {
    expect(reportMemorySection({ tracked, facts: null }, "conversation")).not.toContain("topicFacts");
  });
  it("tells the grader to replace contradicted facts with the newer information", () => {
    const s = reportMemorySection({ tracked: [], facts: [FACT] }, "conversation");
    expect(s).toContain("Keep one line per subject");
    expect(s).toContain("replace the earlier fact with the newer information and never keep both versions");
  });
});

describe("parseMemoryUpdate", () => {
  const raw = JSON.stringify({
    mistakeChecks: [
      { id: "m1", result: "correct" },
      { id: "zzz", result: "wrong" },
      { id: "m2", result: "maybe" },
    ],
    recurringMistakes: [
      { pattern: "tense", rule: "r", examples: [{ said: "I go", better: "I went" }], trackedId: "m1" },
      { pattern: "art", examples: [{ said: "a", better: "the" }], trackedId: "nope" },
      { pattern: "", examples: [{ said: "a", better: "b" }] },
      { pattern: "noex", rule: "r", examples: [] },
      { pattern: "badex", examples: [{ said: "", better: "x" }, { said: "s", better: "b" }] },
    ],
    topicFacts: [{ fact: " Went to Da Lat ", asked: ["food", 3, null] }, { fact: "" }, { fact: "Likes tea" }, "x"],
  });
  it("parses valid output and drops malformed items", () => {
    expect(parseMemoryUpdate(raw, ["m1", "m2"], "conversation")).toEqual({
      checks: [{ id: "m1", result: "correct" }],
      found: [
        { pattern: "tense", rule: "r", example: { said: "I go", better: "I went" }, trackedId: "m1" },
        { pattern: "art", rule: "", example: { said: "a", better: "the" } },
        { pattern: "badex", rule: "", example: { said: "s", better: "b" } },
      ],
      topicFacts: [{ fact: "Went to Da Lat", asked: ["food"] }, { fact: "Likes tea", asked: [] }],
    });
  });
  it("drops trackedId not in the list", () => {
    expect(parseMemoryUpdate(raw, [], "conversation").found.every((f) => f.trackedId === undefined)).toBe(true);
  });
  it("topicFacts is null for interviews and when missing or not an array", () => {
    expect(parseMemoryUpdate(raw, ["m1"], "interview").topicFacts).toBeNull();
    expect(parseMemoryUpdate('{"topicFacts":"x"}', [], "conversation").topicFacts).toBeNull();
    expect(parseMemoryUpdate("{}", [], "conversation").topicFacts).toBeNull();
  });
  it("never throws on garbage", () => {
    expect(parseMemoryUpdate("not json at all", ["m1"], "conversation")).toEqual({ checks: [], found: [], topicFacts: null });
  });
  it("returns the empty update for non-object JSON", () => {
    for (const r of ["null", "[]", "5", '"x"']) {
      expect(parseMemoryUpdate(r, ["m1"], "conversation")).toEqual({ checks: [], found: [], topicFacts: null });
    }
  });
  it("de-duplicates checks by id, first wins", () => {
    const dup = JSON.stringify({ mistakeChecks: [{ id: "m1", result: "wrong" }, { id: "m1", result: "correct" }] });
    expect(parseMemoryUpdate(dup, ["m1"], "conversation").checks).toEqual([{ id: "m1", result: "wrong" }]);
  });
  it("caps found at 3", () => {
    const many = JSON.stringify({ recurringMistakes: [1, 2, 3, 4].map((n) => ({ pattern: `p${n}`, examples: [{ said: "a", better: "b" }] })) });
    expect(parseMemoryUpdate(many, [], "interview").found).toHaveLength(3);
  });
});
