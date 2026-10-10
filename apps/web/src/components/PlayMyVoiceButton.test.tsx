import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { PlayMyVoiceButton } from "./PlayMyVoiceButton";
import { clearRecordings, saveRecordings } from "@/lib/recordedAudioStore";

class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  constructor(src = "") {
    this.src = src;
    FakeAudio.instances.push(this);
  }
}

function current(): FakeAudio {
  return FakeAudio.instances[FakeAudio.instances.length - 1];
}

describe("PlayMyVoiceButton", () => {
  let counter = 0;

  beforeEach(() => {
    counter = 0;
    FakeAudio.instances = [];
    vi.stubGlobal("Audio", FakeAudio);
    URL.createObjectURL = vi.fn(() => `blob:url-${++counter}`) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    clearRecordings("");
    vi.unstubAllGlobals();
  });

  it("renders nothing without a recording", () => {
    const { container } = render(<PlayMyVoiceButton recordingKey="k" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when none of several keys has a recording", () => {
    const { container } = render(<PlayMyVoiceButton recordingKeys={["a", "b"]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("plays every blob in order, then returns to idle", async () => {
    saveRecordings("k", [new Blob(["a"]), new Blob(["b"])]);
    render(<PlayMyVoiceButton recordingKey="k" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nghe lại giọng tôi" }));
    });
    expect(screen.getByRole("button", { name: "Dừng" })).toBeInTheDocument();
    const audio = current();
    expect(audio.src).toBe("blob:url-1");
    expect(audio.play).toHaveBeenCalledTimes(1);
    await act(async () => {
      audio.onended?.();
    });
    expect(audio.src).toBe("blob:url-2");
    expect(audio.play).toHaveBeenCalledTimes(2);
    await act(async () => {
      audio.onended?.();
    });
    expect(screen.getByRole("button", { name: "Nghe lại giọng tôi" })).toBeInTheDocument();
    expect(FakeAudio.instances).toHaveLength(1);
  });

  it("flattens recordings across several keys in order, skipping missing keys", async () => {
    saveRecordings("a", [new Blob(["a"])]);
    saveRecordings("c", [new Blob(["c"])]);
    render(<PlayMyVoiceButton recordingKeys={["a", "b", "c"]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nghe lại giọng tôi" }));
    });
    const audio = current();
    expect(audio.src).toBe("blob:url-1");
    await act(async () => {
      audio.onended?.();
    });
    expect(audio.src).toBe("blob:url-2");
  });

  it("stops when clicked again while playing", async () => {
    saveRecordings("k", [new Blob(["a"]), new Blob(["b"])]);
    render(<PlayMyVoiceButton recordingKey="k" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nghe lại giọng tôi" }));
    });
    const audio = current();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dừng" }));
    });
    expect(audio.pause).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Nghe lại giọng tôi" })).toBeInTheDocument();
    // A late `ended` from the stopped clip must not advance playback.
    await act(async () => {
      audio.onended?.();
    });
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it("resets silently when play() rejects", async () => {
    saveRecordings("k", [new Blob(["a"])]);
    render(<PlayMyVoiceButton recordingKey="k" />);
    vi.stubGlobal(
      "Audio",
      class extends FakeAudio {
        play = vi.fn(() => Promise.reject(new Error("blocked")));
      }
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nghe lại giọng tôi" }));
    });
    expect(screen.getByRole("button", { name: "Nghe lại giọng tôi" })).toBeInTheDocument();
  });

  it("stops playback on unmount", async () => {
    saveRecordings("k", [new Blob(["a"])]);
    const { unmount } = render(<PlayMyVoiceButton recordingKey="k" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nghe lại giọng tôi" }));
    });
    const audio = current();
    unmount();
    expect(audio.pause).toHaveBeenCalled();
  });
});
