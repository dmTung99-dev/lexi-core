import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HintBubble } from "./HintBubble";

describe("HintBubble", () => {
  it("shows the why points when present", () => {
    render(
      <HintBubble
        original="I go to Da Nang"
        hint={{ corrected: "I went to Da Nang", note: "Dùng quá khứ.", alternatives: [], why: [{ part: "went", reason: "Chuyến đi đã kết thúc." }] }}
      />
    );
    expect(screen.getByText("went", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText(/Chuyến đi đã kết thúc/)).toBeInTheDocument();
  });
  it("renders a hint cached before why points existed", () => {
    const { container } = render(
      <HintBubble original="I go" hint={{ corrected: "I went", note: "Dùng quá khứ.", alternatives: [] }} />
    );
    expect(screen.getByText("Dùng quá khứ.")).toBeInTheDocument();
    expect(container.querySelector(".cv-why")).toBeNull();
  });
});
