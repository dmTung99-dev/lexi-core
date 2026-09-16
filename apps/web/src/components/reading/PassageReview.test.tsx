import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { synthesizeSpeech } from "@/lib/synthesizeSpeechClient";
import { PassageReview } from "./PassageReview";

vi.mock("@/lib/synthesizeSpeechClient", async () => {
  const actual = await vi.importActual<typeof import("@/lib/synthesizeSpeechClient")>(
    "@/lib/synthesizeSpeechClient"
  );
  return { ...actual, synthesizeSpeech: vi.fn() };
});

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

function selectWithin(element: HTMLElement) {
  const textNode = element.firstChild as Text;
  const range = document.createRange();
  range.setStart(textNode, 0);
  range.setEnd(textNode, textNode.length);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  fireEvent.mouseUp(document);
}

describe("PassageReview select-to-speak", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  });

  it("shows a speak button after selecting text in the English passage", () => {
    render(<PassageReview sentences={sentences} />);
    expect(screen.queryByRole("button", { name: /Nghe phát âm/ })).toBeNull();

    const enSegment = screen.getByText("Hello there.");
    selectWithin(enSegment);

    expect(screen.getByRole("button", { name: /Nghe phát âm: Hello there\./ })).toBeInTheDocument();
  });

  it("does not show a speak button for a selection in the Vietnamese translation", () => {
    render(<PassageReview sentences={sentences} />);
    const viSegment = screen.getByText("Xin chào.");
    selectWithin(viSegment);

    expect(screen.queryByRole("button", { name: /Nghe phát âm/ })).toBeNull();
  });

  it("speaks the selected English text when the button is clicked", async () => {
    vi.mocked(synthesizeSpeech).mockResolvedValue({ audioBase64: "AAAA" });
    render(<PassageReview sentences={sentences} />);

    selectWithin(screen.getByText("Hello there."));
    fireEvent.click(screen.getByRole("button", { name: /Nghe phát âm: Hello there\./ }));

    await waitFor(() => expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled());
    expect(synthesizeSpeech).toHaveBeenCalledWith({ text: "Hello there.", language: "en" });
  });

  it("does not show a speak button for a selection longer than the server's 500-character limit", () => {
    const longText = "word ".repeat(150).trim(); // 749 chars, well over the 500 limit
    const longSentences = [{ target: longText, vietnamese: "Bản dịch dài.", vocabWords: [] }];
    render(<PassageReview sentences={longSentences} />);

    selectWithin(screen.getByText(longText));

    expect(screen.queryByRole("button", { name: /Nghe phát âm/ })).toBeNull();
  });
});
