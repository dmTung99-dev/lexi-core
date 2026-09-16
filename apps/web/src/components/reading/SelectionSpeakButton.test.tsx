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

const rect = { top: 100, left: 50, width: 40, height: 20 } as DOMRect;

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
});
