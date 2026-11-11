import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { InterviewAudio } from "./useInterviewAudio";
import { useSpeakPending } from "./useSpeakPending";

function fakeAudio() {
  const calls: { onStarted?: () => void; finish: (ok: boolean) => void }[] = [];
  const audio: InterviewAudio = {
    speak: vi.fn(
      (_text: string, onStarted?: () => void) =>
        new Promise<boolean>((resolve) => calls.push({ onStarted, finish: resolve }))
    ),
    prefetch: vi.fn(),
    playPrefetched: vi.fn(),
    stop: vi.fn(),
  };
  return { audio, calls };
}

describe("useSpeakPending", () => {
  it("is pending from the click until playback starts", () => {
    const { audio, calls } = fakeAudio();
    const { result } = renderHook(() => useSpeakPending(audio));

    act(() => result.current.speak("hello", "k1"));
    expect(audio.stop).toHaveBeenCalled();
    expect(result.current.pendingKey).toBe("k1");

    act(() => calls[0].onStarted?.());
    expect(result.current.pendingKey).toBeNull();
  });

  it("defaults the key to the text and clears when the call settles without playing", async () => {
    const { audio, calls } = fakeAudio();
    const { result } = renderHook(() => useSpeakPending(audio));

    act(() => result.current.speak("hello"));
    expect(result.current.pendingKey).toBe("hello");

    await act(async () => calls[0].finish(false));
    expect(result.current.pendingKey).toBeNull();
  });

  it("a superseded call settling late does not clear the newer call's spinner", async () => {
    const { audio, calls } = fakeAudio();
    const { result } = renderHook(() => useSpeakPending(audio));

    act(() => result.current.speak("a", "same"));
    act(() => result.current.speak("b", "same"));
    await act(async () => calls[0].finish(false));
    expect(result.current.pendingKey).toBe("same");

    act(() => calls[1].onStarted?.());
    expect(result.current.pendingKey).toBeNull();
  });
});
