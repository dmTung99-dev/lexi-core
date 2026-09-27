import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useInterviewAudio } from "./useInterviewAudio";
import { synthesizeSpeech } from "./synthesizeSpeechClient";
import type { InterviewVoice } from "./interviewTypes";

vi.mock("./synthesizeSpeechClient", () => ({
  synthesizeSpeech: vi.fn(),
  toAudioDataUrl: (b64: string) => `data:${b64}`,
}));

const played: string[] = [];
let autoEnd = true;

class FakeAudio {
  src = "";
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play() {
    played.push(this.src);
    if (autoEnd) queueMicrotask(() => this.onended?.());
    return Promise.resolve();
  }
  pause() {}
}

beforeEach(() => {
  played.length = 0;
  autoEnd = true;
  vi.stubGlobal("Audio", FakeAudio);
  vi.mocked(synthesizeSpeech).mockImplementation(async ({ text }) => ({ audioBase64: text }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("useInterviewAudio", () => {
  it("speaks every chunk in order with the chosen voice", async () => {
    const { result } = renderHook(() => useInterviewAudio("female2"));
    const text = `${"a".repeat(300)}. ${"b".repeat(300)}.`;
    let ok = false;
    await act(async () => {
      ok = await result.current.speak(text);
    });
    expect(ok).toBe(true);
    expect(synthesizeSpeech).toHaveBeenCalledTimes(2);
    expect(synthesizeSpeech).toHaveBeenCalledWith(expect.objectContaining({ language: "en", voice: "female2" }));
    expect(played).toEqual([`data:${"a".repeat(300)}.`, `data:${"b".repeat(300)}.`]);
  });

  it("resolves false when synthesis fails", async () => {
    vi.mocked(synthesizeSpeech).mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useInterviewAudio("male1"));
    await act(async () => {
      expect(await result.current.speak("Hello.")).toBe(false);
    });
  });

  it("reuses prefetched clips", async () => {
    const { result } = renderHook(() => useInterviewAudio("male1"));
    act(() => result.current.prefetch("main-1", "Next question?"));
    await act(async () => {
      expect(await result.current.playPrefetched("main-1", "Next question?")).toBe(true);
    });
    expect(synthesizeSpeech).toHaveBeenCalledTimes(1);
  });

  it("playPrefetched synthesizes on demand when nothing was prefetched", async () => {
    const { result } = renderHook(() => useInterviewAudio("male1"));
    await act(async () => {
      expect(await result.current.playPrefetched("main-9", "Hi.")).toBe(true);
    });
    expect(synthesizeSpeech).toHaveBeenCalledTimes(1);
  });

  it("stop() resolves the pending play with false", async () => {
    autoEnd = false;
    const { result } = renderHook(() => useInterviewAudio("male1"));
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.speak("Hello.");
    });
    // Wait until FakeAudio.play() has actually been invoked (synthesis resolved
    // and playback started) before stopping, so this exercises stop() cancelling
    // in-flight *playback* rather than winning a race against synthesis.
    await act(async () => {
      while (played.length === 0) await Promise.resolve();
      result.current.stop();
    });
    await expect(pending).resolves.toBe(false);
    expect(played).toEqual(["data:Hello."]);
  });

  it("returns a referentially stable object across re-renders, even when voice changes", async () => {
    const { result, rerender } = renderHook(
      ({ voice }: { voice: InterviewVoice }) => useInterviewAudio(voice),
      { initialProps: { voice: "male1" } }
    );
    const first = result.current;
    rerender({ voice: "male1" });
    expect(result.current).toBe(first);
    rerender({ voice: "female2" });
    expect(result.current).toBe(first);

    // The stable callback still picks up the latest voice via a ref, not a stale closure.
    await act(async () => {
      await result.current.speak("Hello.");
    });
    expect(synthesizeSpeech).toHaveBeenCalledWith(expect.objectContaining({ voice: "female2" }));
  });
});
