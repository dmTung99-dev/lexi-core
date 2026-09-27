import { describe, expect, it } from "vitest";
import { splitSentences } from "./splitSentences";

describe("splitSentences", () => {
  it("returns a single chunk for short text", () => {
    expect(splitSentences("Hello there. How are you?")).toEqual(["Hello there. How are you?"]);
  });

  it("returns [] for blank text", () => {
    expect(splitSentences("   ")).toEqual([]);
  });

  it("packs whole sentences into chunks no longer than maxLen", () => {
    const text = "One two three. Four five six. Seven eight nine.";
    const chunks = splitSentences(text, 30);
    expect(chunks).toEqual(["One two three. Four five six.", "Seven eight nine."]);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(30));
  });

  it("hard-splits a single sentence longer than maxLen on word boundaries", () => {
    const long = Array.from({ length: 20 }, (_, i) => `word${i}`).join(" ") + ".";
    const chunks = splitSentences(long, 40);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(40));
    expect(chunks.join(" ")).toBe(long);
  });

  it("defaults maxLen to 500", () => {
    const sentence = "a".repeat(300) + ". ";
    const chunks = splitSentences(sentence.repeat(2).trim());
    expect(chunks).toHaveLength(2);
  });
});
