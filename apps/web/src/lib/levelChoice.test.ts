import { describe, expect, it } from "vitest";
import { levelMixSentence, levelWeight, pickRandomLevel, weightedOrder } from "./levelChoice";

const SCALE = ["a1", "a2", "b1", "b2", "c1", "c2"] as const;

function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("levelWeight", () => {
  it("weighs levels by position up to the ceiling and drops levels above it", () => {
    expect(SCALE.map((l) => levelWeight(SCALE, l, "b2"))).toEqual([1, 2, 3, 4, 0, 0]);
  });
  it("counts from the lowest level of a shorter scale", () => {
    const short = ["A2", "B1", "B2", "C1"] as const;
    expect(short.map((l) => levelWeight(short, l, "B2"))).toEqual([1, 2, 3, 0]);
  });
  it("gives unknown levels weight 1", () => {
    expect(levelWeight<string>(SCALE, "zz", "b2")).toBe(1);
  });
});

describe("weightedOrder", () => {
  it("drops zero-weight items and keeps every other item once", () => {
    const out = weightedOrder(["a", "b", "c"], (x) => (x === "b" ? 0 : 1), seq([0.5]));
    expect(out.sort()).toEqual(["a", "c"]);
  });
  it("picks proportionally to weight: low random hits the first item, high random the heavy one", () => {
    // weights a=1, b=3 → total 4; r=0.1 → 0.4 < 1 → "a"; r=0.9 → 3.6 ≥ 1 → "b"
    expect(weightedOrder(["a", "b"], (x) => (x === "a" ? 1 : 3), seq([0.1]))[0]).toBe("a");
    expect(weightedOrder(["a", "b"], (x) => (x === "a" ? 1 : 3), seq([0.9]))[0]).toBe("b");
  });
  it("favours heavier items over many runs", () => {
    let rnd = 42;
    const random = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
    let heavyFirst = 0;
    for (let i = 0; i < 2000; i++) {
      if (weightedOrder(["light", "heavy"], (x) => (x === "heavy" ? 4 : 1), random)[0] === "heavy") heavyFirst++;
    }
    expect(heavyFirst / 2000).toBeGreaterThan(0.72);
    expect(heavyFirst / 2000).toBeLessThan(0.88);
  });
});

describe("pickRandomLevel", () => {
  it("stays inside the scale", () => {
    expect(pickRandomLevel(SCALE, () => 0)).toBe("a1");
    expect(pickRandomLevel(SCALE, () => 0.999999)).toBe("c2");
    expect(pickRandomLevel(SCALE, () => 0.5)).toBe("b2");
  });
});

describe("levelMixSentence", () => {
  it("is the shared instruction with the level upper-cased", () => {
    expect(levelMixSentence("b2")).toBe(
      "Write mainly at CEFR B2. About a quarter of the sentences and words may be easier, for variety. Never go above CEFR B2."
    );
  });
});
