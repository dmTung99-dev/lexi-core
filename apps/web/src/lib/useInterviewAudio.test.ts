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
const audioInstances: FakeAudio[] = [];

class FakeAudio {
  src = "";
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    audioInstances.push(this);
  }
  play() {
    played.push(this.src);
    if (autoEnd) queueMicrotask(() => this.onended?.());
    return Promise.resolve();
  }
  pause() {}
}

beforeEach(() => {
  played.length = 0;
  audioInstances.length = 0;
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

  it("a new play call supersedes an in-flight one", async () => {
    autoEnd = false;
    const { result } = renderHook(() => useInterviewAudio("male1"));

    let firstPromise!: Promise<boolean>;
    act(() => {
      firstPromise = result.current.speak("One.");
    });
    // Wait until "One." is actually playing before starting "Two.".
    await act(async () => {
      while (played.length === 0) await Promise.resolve();
    });

    let secondPromise!: Promise<boolean>;
    act(() => {
      secondPromise = result.current.speak("Two.");
    });

    // Race the first promise's settlement against a real (macrotask) timer so
    // a genuine hang (the bug: overlapping playUrl calls overwrite
    // onended/onerror/cancelCurrentRef without ever resolving the superseded
    // promise) fails this test quickly instead of stalling the whole suite.
    // A microtask busy-loop would starve the setTimeout callback and hang for
    // real, so this races the promise itself, not a poll of some flag.
    const TIMEOUT = Symbol("timeout");
    const raceResult = await act(async () =>
      Promise.race([firstPromise, new Promise((resolve) => setTimeout(() => resolve(TIMEOUT), 300))])
    );
    expect(raceResult).toBe(false); // not TIMEOUT

    // Let "Two." finish: wait until it's playing, then trigger its onended.
    await act(async () => {
      while (played.length < 2) await Promise.resolve();
    });
    expect(played).toEqual(["data:One.", "data:Two."]);
    await act(async () => {
      audioInstances[0]?.onended?.();
    });
    await expect(secondPromise).resolves.toBe(true);
  });
});
