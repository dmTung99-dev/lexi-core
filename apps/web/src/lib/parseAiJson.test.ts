import { describe, expect, it } from "vitest";
import { parseAiJsonObject } from "./parseAiJson";

describe("parseAiJsonObject", () => {
  it("parses a plain JSON object", () => {
    expect(parseAiJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips markdown code fences", () => {
    expect(parseAiJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseAiJsonObject('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("extracts a balanced JSON object even with trailing prose around it", () => {
    expect(parseAiJsonObject('Sure! {"a":1} Hope that helps.')).toEqual({ a: 1 });
  });

  it("does not get confused by braces inside string values", () => {
    expect(parseAiJsonObject('{"a":"contains { and } inside"}')).toEqual({
      a: "contains { and } inside",
    });
  });

  it("throws when no JSON object can be found", () => {
    expect(() => parseAiJsonObject("no json here")).toThrow();
  });

  // A real production failure: the AI occasionally emits a trailing comma
  // before a closing `}`/`]` on longer structured output (translation +
  // several suggestions), which strict JSON.parse rejects outright even
  // though the rest of the payload is well-formed.
  it("tolerates a trailing comma before a closing brace", () => {
    expect(parseAiJsonObject('{"a":1,"b":2,}')).toEqual({ a: 1, b: 2 });
  });

  it("tolerates a trailing comma before a closing bracket", () => {
    expect(parseAiJsonObject('{"suggestions":[{"headword":"a"},{"headword":"b"},]}')).toEqual({
      suggestions: [{ headword: "a" }, { headword: "b" }],
    });
  });

  it("tolerates a trailing comma nested inside an array of objects", () => {
    expect(
      parseAiJsonObject(
        '{"translation":"x","suggestions":[{"headword":"a","synonyms":["s1","s2",]},]}'
      )
    ).toEqual({
      translation: "x",
      suggestions: [{ headword: "a", synonyms: ["s1", "s2"] }],
    });
  });

  it("does not touch a trailing comma inside a string value", () => {
    expect(parseAiJsonObject('{"a":"literally a trailing comma, right here"}')).toEqual({
      a: "literally a trailing comma, right here",
    });
  });
});
