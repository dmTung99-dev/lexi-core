import { describe, expect, it } from "vitest";
import { wordDiff } from "./wordDiff";

describe("wordDiff", () => {
  it("returns one equal segment for identical text", () => {
    expect(wordDiff("I went home.", "I went home.")).toEqual([{ kind: "equal", text: "I went home." }]);
  });

  it("marks a replaced word as removed then added", () => {
    expect(wordDiff("We disagree about it", "We disagreed about it")).toEqual([
      { kind: "equal", text: "We" },
      { kind: "removed", text: "disagree" },
      { kind: "added", text: "disagreed" },
      { kind: "equal", text: "about it" },
    ]);
  });

  it("handles a multi-word replacement", () => {
    expect(wordDiff("me and my teammate disagreed", "my teammate and I disagreed")).toEqual([
      { kind: "removed", text: "me and" },
      { kind: "equal", text: "my teammate" },
      { kind: "added", text: "and I" },
      { kind: "equal", text: "disagreed" },
    ]);
  });

  it("handles empty inputs", () => {
    expect(wordDiff("", "Hello")).toEqual([{ kind: "added", text: "Hello" }]);
    expect(wordDiff("Hello", "")).toEqual([{ kind: "removed", text: "Hello" }]);
    expect(wordDiff("", "")).toEqual([]);
  });

  it("compares words case- and punctuation-sensitively as whole tokens", () => {
    expect(wordDiff("finally we chose", "in the end, we chose")).toEqual([
      { kind: "removed", text: "finally" },
      { kind: "added", text: "in the end," },
      { kind: "equal", text: "we chose" },
    ]);
  });
});
