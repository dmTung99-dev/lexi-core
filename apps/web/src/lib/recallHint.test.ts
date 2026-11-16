import { describe, expect, it } from "vitest";
import {
  answersMatch,
  fillSlots,
  hintAvailable,
  hintReveal,
  initialReveal,
  isSeparator,
  maskHeadword,
} from "./recallHint";

describe("recallHint", () => {
  it("A1/A2 reveal nothing", () => {
    expect(initialReveal("borrow", "a2").size).toBe(0);
  });
  it("B2 reveals 25% of letters, deterministic, never more than half", () => {
    const a = initialReveal("behind schedule", "b2");
    expect(a.size).toBe(Math.round(0.25 * 14)); // 4
    expect([...a]).toEqual([...initialReveal("behind schedule", "b2")]);
    expect(initialReveal("cat", "c2").size).toBeLessThanOrEqual(1);
  });
  it("B1 reveals at least one letter on words of 4+ letters", () => {
    expect(initialReveal("plan", "b1").size).toBe(1);
  });
  it("never reveals separators", () => {
    const r = initialReveal("a heads-up", "c2");
    for (const i of r) expect(isSeparator("a heads-up"[i])).toBe(false);
  });
  it("hint skips letters already typed correctly", () => {
    const before = new Set<number>();
    const after = hintReveal("borrow", before, "bor");
    for (const i of after) expect(i).toBeGreaterThanOrEqual(3);
    expect(after.size).toBe(1); // ceil(0.25 × 3 eligible)
  });
  it("hint never reveals the last hidden letter", () => {
    const all = new Set([0, 1, 2, 3, 4]);
    expect(hintReveal("borrow", all, "").size).toBe(5);
    expect(hintAvailable("borrow", all, "")).toBe(false);
  });
  it("fillSlots lays typed text over slots and reports overflow", () => {
    const { slots, overflow } = fillSlots("behind schedule", new Set([1]), "behind  sch");
    expect(slots[7]).toEqual({ kind: "letter", ch: "s", source: "typed" });
    expect(slots[6].kind).toBe("sep");
    expect(slots[10]).toEqual({ kind: "letter", ch: "", source: "empty" });
    expect(fillSlots("plan", new Set(), "plans").overflow).toBe("s");
  });
  it("answersMatch ignores case, extra spaces and quote/dash variants", () => {
    expect(answersMatch("  New  york ", "New York")).toBe(true);
    expect(answersMatch("don’t", "don't")).toBe(true);
    expect(answersMatch("a heads–up", "a heads-up")).toBe(true);
    expect(answersMatch("behind schedual", "behind schedule")).toBe(false);
  });
  it("maskHeadword hides the word and simple inflections", () => {
    expect(maskHeadword("He negotiated hard; negotiate again.", "negotiate")).toBe("He ___ hard; ___ again.");
    expect(maskHeadword("The project is behind schedule.", "behind schedule")).toBe("The project is ___.");
    expect(maskHeadword("schedules", "schedule")).toBe("___");
  });
  it("maskHeadword handles hyphenated headwords", () => {
    expect(maskHeadword("a heads-up call", "heads-up")).toBe("a ___ call");
  });
  it("maskHeadword covers e-drop, y->i, doubled consonant and apostrophes", () => {
    expect(maskHeadword("the act of negotiating", "negotiate")).toBe("the act of ___");
    expect(maskHeadword("He studied", "study")).toBe("He ___");
    expect(maskHeadword("She studies", "study")).toBe("She ___");
    expect(maskHeadword("It stopped", "stop")).toBe("It ___");
    expect(maskHeadword("stopping now", "stop")).toBe("___ now");
    expect(maskHeadword("I don’t know", "don't")).toBe("I ___ know");
  });
  it("fillSlots: revealed letter shows (conflict) when typed char differs", () => {
    expect(fillSlots("borrow", new Set([1]), "bx").slots[1]).toEqual({ kind: "letter", ch: "o", source: "conflict" });
    expect(fillSlots("borrow", new Set([1]), "bo").slots[1]).toEqual({ kind: "letter", ch: "o", source: "typed" });
    const revealed = hintReveal("borrow", new Set(), "barrow");
    const shown = fillSlots("borrow", revealed, "barrow").slots.map((x) => x.ch).join("");
    expect(shown).not.toBe("barrow");
    expect(fillSlots("borrow", new Set([1]), "barrow").slots[1]).toEqual({ kind: "letter", ch: "o", source: "conflict" });
    expect(fillSlots("borrow", new Set([1]), "b").slots[1]).toEqual({ kind: "letter", ch: "o", source: "revealed" });
  });
});
