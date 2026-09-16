import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PassageReview } from "./PassageReview";

const sentences = [
  { target: "Hello there.", vietnamese: "Xin chào.", vocabWords: [] },
  { target: "Nice to meet you.", vietnamese: "Rất vui được gặp bạn.", vocabWords: [] },
];

describe("PassageReview", () => {
  it("renders nothing when there are no sentences", () => {
    const { container } = render(<PassageReview sentences={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the English passage and the Vietnamese translation", () => {
    render(<PassageReview sentences={sentences} />);
    expect(screen.getByText("Hello there.")).toBeInTheDocument();
    expect(screen.getByText("Xin chào.")).toBeInTheDocument();
  });

  it("highlights the paired sentence when hovering the English side", () => {
    render(<PassageReview sentences={sentences} />);
    const en = screen.getByTestId("en-sentence-0");
    const vi = screen.getByTestId("vi-sentence-0");

    expect(en).not.toHaveClass("reading-sentence-hover");
    expect(vi).not.toHaveClass("reading-sentence-hover");

    fireEvent.mouseEnter(en);
    expect(en).toHaveClass("reading-sentence-hover");
    expect(vi).toHaveClass("reading-sentence-hover");

    fireEvent.mouseLeave(en);
    expect(en).not.toHaveClass("reading-sentence-hover");
    expect(vi).not.toHaveClass("reading-sentence-hover");
  });

  it("highlights the paired sentence when hovering the Vietnamese side", () => {
    render(<PassageReview sentences={sentences} />);
    const en = screen.getByTestId("en-sentence-0");
    const vi = screen.getByTestId("vi-sentence-0");

    fireEvent.mouseEnter(vi);
    expect(en).toHaveClass("reading-sentence-hover");
    expect(vi).toHaveClass("reading-sentence-hover");
  });

  it("only highlights the hovered sentence's own pair, not other sentences", () => {
    render(<PassageReview sentences={sentences} />);
    const firstEn = screen.getByTestId("en-sentence-0");
    const secondEn = screen.getByTestId("en-sentence-1");

    fireEvent.mouseEnter(firstEn);
    expect(firstEn).toHaveClass("reading-sentence-hover");
    expect(secondEn).not.toHaveClass("reading-sentence-hover");
  });
});
