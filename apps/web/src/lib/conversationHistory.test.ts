import { describe, expect, it } from "vitest";
import { planCondense, shouldCondense, unsummarizedWindow } from "./conversationHistory";
import type { ConversationMessage } from "./conversationTypes";

function msgs(n: number): ConversationMessage[] {
  return Array.from({ length: n }, (_, i) => ({ role: i % 2 === 0 ? "ai" : "user", text: `m${i}` }));
}

describe("unsummarizedWindow", () => {
  it("returns everything when nothing is summarized", () => {
    expect(unsummarizedWindow(msgs(5), 0)).toHaveLength(5);
  });
  it("skips messages already folded into the summary", () => {
    const out = unsummarizedWindow(msgs(20), 12);
    expect(out).toHaveLength(8);
    expect(out[0].text).toBe("m12");
  });
});

describe("shouldCondense / planCondense", () => {
  it("does not condense below 16 unsummarized messages", () => {
    expect(shouldCondense(15, 0)).toBe(false);
    expect(planCondense(msgs(15), 0)).toBeNull();
  });
  it("condenses at 16, folding all but the last 8", () => {
    expect(shouldCondense(16, 0)).toBe(true);
    const plan = planCondense(msgs(16), 0);
    expect(plan?.newCount).toBe(8);
    expect(plan?.toFold).toHaveLength(8);
    expect(plan?.toFold[7].text).toBe("m7");
  });
  it("counts only messages after the previous fold", () => {
    expect(shouldCondense(23, 8)).toBe(false);
    expect(shouldCondense(24, 8)).toBe(true);
    const plan = planCondense(msgs(24), 8);
    expect(plan?.newCount).toBe(16);
    expect(plan?.toFold.map((m) => m.text)).toEqual(msgs(24).slice(8, 16).map((m) => m.text));
  });
});
