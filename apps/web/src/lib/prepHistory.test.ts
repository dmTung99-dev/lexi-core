import { describe, expect, it } from "vitest";
import { foldText, kitSummary, matchesPrepQuery } from "./prepHistory";

describe("kitSummary", () => {
  it("returns the stored summary when present", () => {
    expect(kitSummary({ title: "T", situation: "S", persona: "P", goals: ["g"], summary: " Stored. " })).toBe("Stored.");
  });

  it("builds a fallback from title, situation, persona and goals", () => {
    expect(
      kitSummary({ title: "Phỏng vấn khoá game", situation: "Tôi đi\nphỏng vấn", persona: "A strict mentor.", goals: ["Giới thiệu", "Hỏi lịch học"] })
    ).toBe("Phỏng vấn khoá game. Situation: Tôi đi phỏng vấn. A strict mentor. Goals: Giới thiệu; Hỏi lịch học");
  });

  it("caps at 400 chars", () => {
    expect(kitSummary({ title: "T", situation: "x".repeat(900), persona: "", goals: [] }).length).toBe(400);
  });
});

describe("matchesPrepQuery", () => {
  it("ignores case and diacritics, and folds đ", () => {
    expect(matchesPrepQuery({ title: "Lập trình game", situation: "", summary: undefined }, "lap trinh")).toBe(true);
    expect(matchesPrepQuery({ title: "Đi Đà Lạt", situation: "", summary: undefined }, "da lat")).toBe(true);
    expect(foldText("Đà Lạt")).toBe("da lat");
  });

  it("matches on situation and summary", () => {
    expect(matchesPrepQuery({ title: "A", situation: "Tôi đi phỏng vấn", summary: undefined }, "phong van")).toBe(true);
    expect(matchesPrepQuery({ title: "A", situation: "", summary: "A trip to Tokyo." }, "TOKYO")).toBe(true);
  });

  it("treats a blank query as a match and rejects non-matches", () => {
    expect(matchesPrepQuery({ title: "Lập trình game", situation: "", summary: undefined }, "  ")).toBe(true);
    expect(matchesPrepQuery({ title: "Lập trình game", situation: "", summary: undefined }, "tokyo")).toBe(false);
  });
});
