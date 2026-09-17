import { describe, expect, it } from "vitest";
import { ambientZoomFactor } from "./selectionSpeak";

describe("ambientZoomFactor", () => {
  it("returns the ratio between the true rendered width and the unzoomed layout width", () => {
    const el = document.createElement("div");
    el.getBoundingClientRect = () => new DOMRect(0, 0, 115, 0);
    Object.defineProperty(el, "offsetWidth", { value: 100, configurable: true });

    expect(ambientZoomFactor(el)).toBeCloseTo(1.15, 5);
  });

  it("returns 1 when either width is zero (no real layout, e.g. jsdom's default)", () => {
    const el = document.createElement("div");
    // No getBoundingClientRect/offsetWidth override — both default to 0.
    expect(ambientZoomFactor(el)).toBe(1);
  });
});
