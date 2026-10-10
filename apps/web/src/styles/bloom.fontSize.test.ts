import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.resolve(import.meta.dirname, "bloom.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const SCALED = /^(?:max\(12px, )?calc\([0-9.]+(?:px|rem) \* var\(--type-scale\)\)\)?$/;
const RELATIVE = /^(?:[0-9.]+(?:em|%)|inherit)$/;
const IOS_GUARD = "16px !important";

describe("bloom.css font-size convention", () => {
  const values = [...css.matchAll(/font-size:\s*([^;}]+?)\s*[;}]/g)].map((m) => m[1]);

  it("finds the font-size declarations", () => {
    expect(values.length).toBeGreaterThan(100);
  });

  it("scales every font-size with --type-scale (or is relative / the single iOS input guard)", () => {
    const offenders = values.filter((v) => !(SCALED.test(v) || RELATIVE.test(v) || v === IOS_GUARD));
    expect(offenders).toEqual([]);
  });

  it("uses the iOS 16px guard exactly once", () => {
    expect(values.filter((v) => v === IOS_GUARD)).toHaveLength(1);
  });

  it("defines the scale variables, with the phone device scale at 0.9", () => {
    expect(css).toMatch(/--device-type-scale:\s*1/);
    expect(css).toMatch(/--device-type-scale:\s*0\.9/);
    expect(css).toMatch(/--user-type-scale:\s*0\.9/);
    expect(css).toMatch(/--user-type-scale:\s*1\.15/);
  });
});
