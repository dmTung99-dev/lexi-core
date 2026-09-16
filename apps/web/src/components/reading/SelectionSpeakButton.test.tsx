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
});
