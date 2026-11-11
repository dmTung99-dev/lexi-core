import { describe, expect, it } from "vitest";
import { kitSummary } from "./prepHistory";

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
