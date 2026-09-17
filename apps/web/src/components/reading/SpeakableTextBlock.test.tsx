import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { synthesizeSpeech } from "@/lib/synthesizeSpeechClient";
import { SpeakableTextBlock } from "./SpeakableTextBlock";

vi.mock("@/lib/synthesizeSpeechClient", async () => {
  const actual = await vi.importActual<typeof import("@/lib/synthesizeSpeechClient")>(
    "@/lib/synthesizeSpeechClient"
  );
  return { ...actual, synthesizeSpeech: vi.fn() };
});

function selectWithin(element: HTMLElement, coords?: { clientX: number; clientY: number }) {
  const textNode = element.firstChild as Text;
  const range = document.createRange();
  range.setStart(textNode, 0);
  range.setEnd(textNode, textNode.length);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  fireEvent.mouseUp(document, coords);
}

describe("SpeakableTextBlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  });

  it("renders children with no speak button until text is selected", () => {
    render(
      <SpeakableTextBlock>
        <p>Hello there.</p>
      </SpeakableTextBlock>
    );
    expect(screen.getByText("Hello there.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nghe phát âm/ })).toBeNull();
  });

  it("shows a speak button after selecting text inside the block", () => {
    render(
      <SpeakableTextBlock>
        <p>Hello there.</p>
      </SpeakableTextBlock>
    );
    selectWithin(screen.getByText("Hello there."));
    expect(screen.getByRole("button", { name: /Nghe phát âm: Hello there\./ })).toBeInTheDocument();
  });

  it("speaks the selected text when the button is clicked", async () => {
    vi.mocked(synthesizeSpeech).mockResolvedValue({ audioBase64: "AAAA" });
    render(
      <SpeakableTextBlock>
        <p>Hello there.</p>
      </SpeakableTextBlock>
    );
    selectWithin(screen.getByText("Hello there."));
    fireEvent.click(screen.getByRole("button", { name: /Nghe phát âm: Hello there\./ }));

    await waitFor(() => expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled());
    expect(synthesizeSpeech).toHaveBeenCalledWith({ text: "Hello there.", language: "en" });
  });

  it("does not show a speak button for a selection outside the block", () => {
    render(
      <div>
        <SpeakableTextBlock>
          <p>Hello there.</p>
        </SpeakableTextBlock>
        <p>Outside text.</p>
      </div>
    );
    selectWithin(screen.getByText("Outside text."));
    expect(screen.queryByRole("button", { name: /Nghe phát âm/ })).toBeNull();
  });
});
