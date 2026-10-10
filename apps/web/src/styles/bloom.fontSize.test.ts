import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.resolve(import.meta.dirname, "bloom.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const PLAIN = /^calc\(([0-9.]+)(px|rem) \* var\(--type-scale\)\)$/;
const FLOORED = /^max\(var\(--type-min\), calc\(([0-9.]+)(px|rem) \* var\(--type-scale\)\)\)$/;
const RELATIVE = /^(?:[0-9.]+(?:em|%)|inherit)$/;
const IOS_GUARD = "16px !important";
// Below this original size (px; rem x 16) the 12px phone floor can bite at the smallest user setting.
const FLOOR_THRESHOLD_PX = 15;

// Real `font-size` properties only: not `--font-size`, `line-font-size` and the like.
const values = [...css.matchAll(/(?<![-\w])font-size:\s*([^;}]+?)\s*[;}]/g)].map((m) => m[1]);

function originalPx(value: string): number | null {
  const m = PLAIN.exec(value) ?? FLOORED.exec(value);
  if (!m) return null;
  return Number(m[1]) * (m[2] === "rem" ? 16 : 1);
}

describe("bloom.css font-size convention", () => {
  it("finds the font-size declarations", () => {
    expect(values.length).toBeGreaterThan(100);
  });

  it("scales every font-size with --type-scale (or is relative / the single iOS input guard)", () => {
    const offenders = values.filter((v) => !(PLAIN.test(v) || FLOORED.test(v) || RELATIVE.test(v) || v === IOS_GUARD));
    expect(offenders).toEqual([]);
  });

  it("floors every converted size under 15px with --type-min, and nothing at 15px or above", () => {
    const wrongFloor = values.flatMap((v) => {
      const px = originalPx(v);
      if (px === null) return [];
      const floored = FLOORED.test(v);
      return (px < FLOOR_THRESHOLD_PX) === floored ? [] : [v];
    });
    expect(wrongFloor).toEqual([]);
    // Guard against the check above passing vacuously.
    expect(values.filter((v) => FLOORED.test(v)).length).toBeGreaterThan(0);
    expect(values.filter((v) => PLAIN.test(v)).length).toBeGreaterThan(0);
  });

  it("uses the iOS 16px guard exactly once", () => {
    expect(values.filter((v) => v === IOS_GUARD)).toHaveLength(1);
  });

  it("defines the scale variables precisely, with the phone device scale at 0.9", () => {
    const decls = (name: string) => [...css.matchAll(new RegExp(name + ":([^;}]+);", "g"))].map((m) => m[1].trim());
    expect(decls("--device-type-scale")).toEqual(["1", "0.9"]);
    expect(decls("--user-type-scale")).toEqual(["1", "0.9", "1.15"]);
  });

  it("defines the phone-only type floor: --type-min 0px on desktop, 12px at <=820px", () => {
    const decls = [...css.matchAll(/--type-min:([^;}]+);/g)].map((m) => m[1].trim());
    expect(decls).toEqual(["0px", "12px"]);
    expect(css).not.toMatch(/max\(12px/);
  });

  it("scales unstyled text: .app-frame sets its own base font-size from --type-scale", () => {
    const rule = /\.app-frame\s*\{([^}]*)\}/g;
    const bodies = [...css.matchAll(rule)].map((m) => m[1]);
    expect(bodies.some((b) => /(?<![-\w])font-size:\s*calc\(1rem \* var\(--type-scale\)\);/.test(b))).toBe(true);
  });
});
