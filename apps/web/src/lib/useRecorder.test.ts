import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRecorder } from "./useRecorder";

class FakeRecorder {
  static isTypeSupported = () => true;
  mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {}
  stop() {
    this.ondataavailable?.({ data: new Blob(["abc"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

const trackStop = vi.fn();

beforeEach(() => {
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: trackStop }] }) },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  trackStop.mockClear();
});

describe("useRecorder", () => {
  it("records and returns a blob, releasing the mic", async () => {
    const { result } = renderHook(() => useRecorder());
    let started = false;
    await act(async () => {
      started = await result.current.start();
    });
    expect(started).toBe(true);
    expect(result.current.recording).toBe(true);

    let audio: Awaited<ReturnType<typeof result.current.stop>> = null;
    await act(async () => {
      audio = await result.current.stop();
    });
    expect(audio!.blob.size).toBe(3);
    expect(result.current.recording).toBe(false);
    expect(trackStop).toHaveBeenCalled();
  });

  it("sets error=denied when getUserMedia rejects", async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(new Error("NotAllowed"));
    const { result } = renderHook(() => useRecorder());
    await act(async () => {
      expect(await result.current.start()).toBe(false);
    });
    expect(result.current.error).toBe("denied");
  });

  it("stop without start returns null", async () => {
    const { result } = renderHook(() => useRecorder());
    await act(async () => {
      expect(await result.current.stop()).toBeNull();
    });
  });
});
