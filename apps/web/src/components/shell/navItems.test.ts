import { describe, expect, it } from "vitest";
import { MORE_ITEMS, NAV_GROUPS, TAB_ITEMS, hidesTabBar, isActivePath, isMoreActive } from "./navItems";

describe("navItems", () => {
  it("keeps all 11 areas in the original sidebar order", () => {
    const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toEqual([
      "/dashboard", "/lookup", "/vocab-bank", "/practice",
      "/reading", "/word-radar", "/knowledge", "/listening",
      "/interview", "/conversation", "/settings",
    ]);
  });

  it("has four tab items followed by seven 'more' items covering every area exactly once", () => {
    expect(TAB_ITEMS.map((i) => i.href)).toEqual(["/dashboard", "/lookup", "/vocab-bank", "/practice"]);
    expect(MORE_ITEMS.map((i) => i.href)).toEqual([
      "/reading", "/word-radar", "/knowledge", "/listening", "/interview", "/conversation", "/settings",
    ]);
    expect(TAB_ITEMS.length + MORE_ITEMS.length).toBe(11);
  });

  it("gives the long vocab-bank label a short tab label", () => {
    expect(TAB_ITEMS.find((i) => i.href === "/vocab-bank")?.shortLabel).toBe("Từ vựng");
  });

  it("matches a route and its nested routes, not look-alike prefixes", () => {
    expect(isActivePath("/interview", "/interview")).toBe(true);
    expect(isActivePath("/interview/abc/report", "/interview")).toBe(true);
    expect(isActivePath("/interviewing", "/interview")).toBe(false);
  });

  it("marks 'Thêm' active only for routes in the seven other areas", () => {
    expect(isMoreActive("/settings")).toBe(true);
    expect(isMoreActive("/reading/part5")).toBe(true);
    expect(isMoreActive("/lookup")).toBe(false);
    expect(isMoreActive("/dashboard")).toBe(false);
  });

  it("hides the tab bar only on live interview/conversation session pages", () => {
    expect(hidesTabBar("/interview/abc123")).toBe(true);
    expect(hidesTabBar("/conversation/abc123")).toBe(true);
    expect(hidesTabBar("/interview")).toBe(false);
    expect(hidesTabBar("/conversation")).toBe(false);
    expect(hidesTabBar("/interview/abc123/report")).toBe(false);
    expect(hidesTabBar("/conversation/abc123/report")).toBe(false);
    expect(hidesTabBar("/vocab-bank")).toBe(false);
  });
});
