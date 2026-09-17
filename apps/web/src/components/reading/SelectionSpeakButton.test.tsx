import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SelectionSpeakButton } from "./SelectionSpeakButton";
import { synthesizeSpeech } from "@/lib/synthesizeSpeechClient";

vi.mock("@/lib/synthesizeSpeechClient", async () => {
  const actual = await vi.importActual<typeof import("@/lib/synthesizeSpeechClient")>(
    "@/lib/synthesizeSpeechClient"
  );
  return { ...actual, synthesizeSpeech: vi.fn() };
});

const rect = new DOMRect(50, 100, 40, 20); // left: 50, top: 100, right: 90, bottom: 120

beforeEach(() => {
  vi.clearAllMocks();
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
});

describe("SelectionSpeakButton", () => {
  it("calls synthesizeSpeech with the selected text (English, no voice) and plays the audio", async () => {
    vi.mocked(synthesizeSpeech).mockResolvedValue({ audioBase64: "AAAA" });
    render(<SelectionSpeakButton text="favorable" rect={rect} />);

    fireEvent.click(screen.getByRole("button", { name: /Nghe phát âm: favorable/ }));

    await waitFor(() => expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled());
    expect(synthesizeSpeech).toHaveBeenCalledWith({ text: "favorable", language: "en" });
  });

  it("shows a loading state while the request is in flight", async () => {
    let resolvePromise!: (v: { audioBase64: string }) => void;
    vi.mocked(synthesizeSpeech).mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      })
    );
    render(<SelectionSpeakButton text="favorable" rect={rect} />);

    fireEvent.click(screen.getByRole("button", { name: /Nghe phát âm/ }));
    expect(await screen.findByText("…")).toBeInTheDocument();

    resolvePromise({ audioBase64: "AAAA" });
    await waitFor(() => expect(screen.queryByText("…")).toBeNull());
  });

  it("shows a warning icon after a failed request, and stays clickable to retry", async () => {
    vi.mocked(synthesizeSpeech).mockRejectedValueOnce(new Error("network"));
    render(<SelectionSpeakButton text="favorable" rect={rect} />);

    fireEvent.click(screen.getByRole("button", { name: /Nghe phát âm/ }));
    expect(await screen.findByText("⚠️")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nghe phát âm/ })).not.toBeDisabled();
  });

  it("resets to idle when the selected text prop changes", async () => {
    vi.mocked(synthesizeSpeech).mockRejectedValueOnce(new Error("network"));
    const { rerender } = render(<SelectionSpeakButton text="favorable" rect={rect} />);

    fireEvent.click(screen.getByRole("button", { name: /Nghe phát âm/ }));
    expect(await screen.findByText("⚠️")).toBeInTheDocument();

    rerender(<SelectionSpeakButton text="ongoing impasse" rect={rect} />);
    expect(screen.getByText("🔊")).toBeInTheDocument();
  });

  it("prevents the default mousedown action so it doesn't collapse the active text selection", () => {
    render(<SelectionSpeakButton text="favorable" rect={rect} />);
    const button = screen.getByRole("button", { name: /Nghe phát âm/ });

    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    button.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("positions horizontally at the selection's right edge and vertically at its top (floats above via CSS) when well within the viewport", () => {
    render(<SelectionSpeakButton text="favorable" rect={rect} />);
    const button = screen.getByRole("button", { name: /Nghe phát âm/ });

    expect(button.style.left).toBe(`${rect.right}px`);
    expect(button.style.top).toBe(`${rect.top}px`);
  });

  it("clamps horizontal position so the button never renders past the right edge of the viewport", () => {
    const overflowRect = new DOMRect(50, 50, window.innerWidth + 500, 10);
    render(<SelectionSpeakButton text="favorable" rect={overflowRect} />);
    const button = screen.getByRole("button", { name: /Nghe phát âm/ });

    const left = parseFloat(button.style.left);
    // 26px button width + 3px CSS translate offset + 8px margin must still fit.
    expect(left).toBeLessThanOrEqual(window.innerWidth - 26 - 3 - 8);
  });

  it("clamps vertical position so the button (which floats above its anchor) never renders past the top edge of the viewport", () => {
    const nearTopRect = new DOMRect(50, 5, 40, 10); // a selection right at the top of the viewport
    render(<SelectionSpeakButton text="favorable" rect={nearTopRect} />);
    const button = screen.getByRole("button", { name: /Nghe phát âm/ });

    const top = parseFloat(button.style.top);
    // 26px button height + 4px gap above the line + 8px margin must still fit above y=0.
    expect(top).toBeGreaterThanOrEqual(26 + 4 + 8);
  });

  it("shows a disabled, explained state instead of disappearing when the selection is too long", () => {
    render(<SelectionSpeakButton text="favorable" rect={rect} tooLong />);
    const button = screen.getByRole("button");

    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("🔇");
    expect(button.title).toMatch(/quá dài/i);
  });

  it("does not call synthesizeSpeech when clicked while tooLong", () => {
    render(<SelectionSpeakButton text="favorable" rect={rect} tooLong />);
    fireEvent.click(screen.getByRole("button"));

    expect(synthesizeSpeech).not.toHaveBeenCalled();
  });

  // Regression test: the "cỡ chữ" (font size) setting applies a CSS `zoom`
  // to the whole app (.app-frame.fs-large { zoom: 1.15 }, bloom.css). This
  // button renders inside that zoomed subtree, so the browser re-multiplies
  // whatever raw top/left px we set by the ambient zoom when painting it —
  // reported live as the button drifting further from the actual selection
  // the more text was selected (a bigger raw rect.right value means a
  // bigger absolute error once re-multiplied by zoom). Dividing by
  // zoomFactor before setting the style must cancel that out exactly.
  it("divides the position by zoomFactor so the final rendered position matches the true coordinate", () => {
    render(<SelectionSpeakButton text="favorable" rect={rect} zoomFactor={1.15} />);
    const button = screen.getByRole("button", { name: /Nghe phát âm/ });

    // rect.right = 90, rect.top = 100 (both well within the viewport, so
    // clamping doesn't kick in) — dividing by 1.15 is what cancels the
    // browser's own re-multiplication once painted inside the zoomed tree.
    expect(parseFloat(button.style.left)).toBeCloseTo(90 / 1.15, 5);
    expect(parseFloat(button.style.top)).toBeCloseTo(100 / 1.15, 5);
  });

  it("defaults zoomFactor to 1 (no adjustment) when not provided", () => {
    render(<SelectionSpeakButton text="favorable" rect={rect} />);
    const button = screen.getByRole("button", { name: /Nghe phát âm/ });

    expect(button.style.left).toBe(`${rect.right}px`);
    expect(button.style.top).toBe(`${rect.top}px`);
  });

  it("scales the viewport clamping margins by zoomFactor so the button's true on-screen footprint still fits", () => {
    const overflowRect = new DOMRect(50, 50, window.innerWidth + 500, 10);
    render(<SelectionSpeakButton text="favorable" rect={overflowRect} zoomFactor={1.15} />);
    const button = screen.getByRole("button", { name: /Nghe phát âm/ });

    const renderedLeft = parseFloat(button.style.left) * 1.15; // true on-screen px after zoom
    // The button's true footprint (26px + 3px offset, both zoomed) + 8px
    // true-pixel margin must still fit inside the real viewport width.
    expect(renderedLeft).toBeLessThanOrEqual(window.innerWidth - 26 * 1.15 - 3 * 1.15 - 8 + 0.01);
  });
});
