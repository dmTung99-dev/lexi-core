import { describe, expect, it } from "vitest";
import { findPatternSpan, lineHighlights } from "./prepHighlight";

function slice(line: string, pattern: string): string | null {
  const s = findPatternSpan(line, pattern);
  return s ? line.slice(s.start, s.end) : null;
}

describe("findPatternSpan", () => {
  it("finds the fixed part before a ___ blank, case-insensitively", () => {
    expect(slice("Thanks. I'd like to walk you through the plan.", "i'd like to walk you through ___")).toBe(
      "I'd like to walk you through"
    );
  });

  it("strips '+ V' placeholders and matches curly apostrophes", () => {
    expect(slice("We’re on track to finish by Friday.", "We're on track to + V")).toBe("We’re on track to");
  });

  it("ignores optional parenthesised parts and picks the longest fixed chunk", () => {
    expect(slice("One thing I want to flag is that we're late.", "One thing I want to flag is (that) ___")).toBe(
      "One thing I want to flag is"
    );
  });

  it("tolerates extra whitespace in the line", () => {
    expect(slice("We  are on track", "we are on track")).toBe("We  are on track");
  });

  it("returns null when nothing matches or the pattern is only placeholders", () => {
    expect(findPatternSpan("Hello there", "I'd like to ___")).toBeNull();
    expect(findPatternSpan("Hello there", "___ + V")).toBeNull();
  });
});

describe("lineHighlights", () => {
  it("returns non-overlapping spans sorted by position with their pattern index", () => {
    const line = "I'd like to walk you through it, and we're on track to finish.";
    const out = lineHighlights(line, [
      { pattern: "we're on track to + V" },
      { pattern: "I'd like to walk you through ___" },
      { pattern: "I'd like to ___" },
      { pattern: "nothing here ___" },
    ]);
    expect(out.map((h) => [line.slice(h.start, h.end), h.patternIndex])).toEqual([
      ["I'd like to walk you through", 1],
      ["we're on track to", 0],
    ]);
  });
});
