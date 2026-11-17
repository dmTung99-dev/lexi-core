import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RecallTypingCard } from "./RecallTypingCard";
import type { VocabRecord } from "@/lib/vocabRecords";
import { getPronunciationUrl } from "@/lib/pronunciation";

vi.mock("@/lib/pronunciation", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pronunciation")>("@/lib/pronunciation");
  return { ...actual, getPronunciationUrl: vi.fn() };
});

class StubAudio {
  static instances: StubAudio[] = [];
  src: string;
  preload = "";
  currentTime = 5;
  play = vi.fn().mockResolvedValue(undefined);
  constructor(src: string) {
    this.src = src;
    StubAudio.instances.push(this);
  }
}

const RECORD: VocabRecord = {
  id: "1",
  headword: "behind schedule",
  inputType: "phrase",
  ipa: "/bɪˈhaɪnd ˈʃɛdjuːl/",
  meaning: "chậm tiến độ",
  examples: [],
  personalNotes: "",
  topicIds: [],
  targetLanguage: "english",
  cefrLevel: "b2",
  activeContext: "general",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  nextReviewAt: null,
  sm2Repetitions: 0,
  sm2EaseFactor: 2.5,
  sm2Interval: 0,
  definition: "The project is behind schedule.",
  synonyms: [],
};
const PLAN: VocabRecord = { ...RECORD, headword: "plan", cefrLevel: "a2", definition: "", meaning: "kế hoạch" };

const mockUrl = vi.mocked(getPronunciationUrl);

async function flush() {
  await act(async () => {});
}
async function setup(record = RECORD) {
  const onDone = vi.fn();
  const utils = render(<RecallTypingCard record={record} onDone={onDone} />);
  await flush();
  return { onDone, ...utils };
}
const input = () => screen.getByLabelText("Gõ từ tiếng Anh") as HTMLInputElement;
function type(v: string) {
  fireEvent.change(input(), { target: { value: v } });
}
function enter() {
  fireEvent.keyDown(input(), { key: "Enter" });
}
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  StubAudio.instances = [];
  vi.stubGlobal("Audio", StubAudio);
  mockUrl.mockReset();
  mockUrl.mockResolvedValue("u1");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("RecallTypingCard", () => {
  it("masks the headword in the definition", async () => {
    await setup();
    expect(screen.getByText("The project is ___.")).toBeTruthy();
    expect(screen.queryByText(/behind schedule/)).toBeNull();
  });

  it("correct answer goes green and waits for a second Enter to report clean", async () => {
    const { onDone } = await setup();
    type("Behind schedule");
    enter();
    expect(screen.getByText("✓ Chính xác")).toBeTruthy();
    advance(10000);
    expect(onDone).not.toHaveBeenCalled();
    enter();
    expect(onDone).toHaveBeenCalledWith("clean");
  });

  it("wrong answer shows the answer and reports wrong on the next Enter", async () => {
    const { onDone } = await setup();
    type("behind schedual");
    enter();
    expect(screen.getByText("Đáp án")).toBeTruthy();
    expect(screen.getByText("behind schedule")).toBeTruthy();
    advance(10000);
    expect(onDone).not.toHaveBeenCalled();
    enter();
    expect(onDone).toHaveBeenCalledWith("wrong");
  });

  it("a hint makes a correct answer count as hinted", async () => {
    const { onDone } = await setup();
    fireEvent.click(screen.getByRole("button", { name: "Gợi ý (3)" }));
    expect(screen.getByRole("button", { name: "Gợi ý (2)" })).toBeTruthy();
    type("behind schedule");
    enter();
    enter();
    expect(onDone).toHaveBeenCalledWith("hinted");
  });

  it("skip unlocks only after 3 hints and reports skipped", async () => {
    const { onDone } = await setup();
    const skip = () => screen.getByRole("button", { name: "Bỏ qua" }) as HTMLButtonElement;
    expect(skip().disabled).toBe(true);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: /^Gợi ý/ }));
    expect(skip().disabled).toBe(false);
    fireEvent.click(skip());
    advance(10000);
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
    expect(onDone).toHaveBeenCalledWith("skipped");
  });

  it("after the letter hints the button becomes a replayable listen hint", async () => {
    const { onDone } = await setup();
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: /^Gợi ý/ }));
    const listen = screen.getByRole("button", { name: "Nghe phát âm" });
    const audio = StubAudio.instances[0];
    fireEvent.click(listen);
    expect(audio.currentTime).toBe(0);
    audio.currentTime = 3;
    fireEvent.click(listen);
    expect(audio.currentTime).toBe(0);
    expect(audio.play).toHaveBeenCalledTimes(2);
    type("behind schedule");
    enter();
    enter();
    expect(onDone).toHaveBeenCalledWith("hinted");
  });

  it("listen hint and skip unlock early when no letter is eligible", async () => {
    await setup(PLAN);
    type("pla");
    for (let i = 0; i < 3; i++) {
      const b = screen.queryByRole("button", { name: /^Gợi ý/ }) as HTMLButtonElement | null;
      if (!b || b.disabled) break;
      fireEvent.click(b);
    }
    const listen = screen.getByRole("button", { name: "Nghe phát âm" }) as HTMLButtonElement;
    expect(listen.disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Bỏ qua" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("listen hint is disabled when the audio failed", async () => {
    mockUrl.mockRejectedValue(new Error("x"));
    const { onDone } = await setup();
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: /^Gợi ý/ }));
    expect((screen.getByRole("button", { name: "Nghe phát âm" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Bỏ qua" }));
    enter();
    expect(onDone).toHaveBeenCalledWith("skipped");
  });

  it("further Enters and Tiếp tục after advancing report only once", async () => {
    const { onDone } = await setup();
    type("behind schedule");
    enter();
    expect(input().readOnly).toBe(true);
    enter();
    enter();
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("a held-down (repeating) Enter does not advance past the result", async () => {
    const { onDone } = await setup();
    type("behind schedule");
    enter();
    fireEvent.keyDown(input(), { key: "Enter", repeat: true });
    expect(onDone).not.toHaveBeenCalled();
    enter();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("Tab uses the hint button: letter hints, then listen, then replay after grading", async () => {
    const { onDone } = await setup();
    const tab = (extra: Record<string, unknown> = {}) =>
      fireEvent.keyDown(input(), { key: "Tab", ...extra });
    tab();
    expect(screen.getByRole("button", { name: "Gợi ý (2)" })).toBeTruthy();
    tab({ repeat: true });
    expect(screen.getByRole("button", { name: "Gợi ý (2)" })).toBeTruthy();
    tab({ shiftKey: true });
    expect(screen.getByRole("button", { name: "Gợi ý (2)" })).toBeTruthy();
    tab();
    tab();
    expect(screen.getByRole("button", { name: "Nghe phát âm" })).toBeTruthy();
    const audio = StubAudio.instances[0];
    tab();
    expect(audio.play).toHaveBeenCalledTimes(1);
    type("behind schedule");
    enter();
    const playsAfterGrade = vi.mocked(audio.play).mock.calls.length;
    tab();
    expect(audio.play).toHaveBeenCalledTimes(playsAfterGrade + 1);
    expect(onDone).not.toHaveBeenCalled();
    enter();
    expect(onDone).toHaveBeenCalledWith("hinted");
  });

  it("typed letters fill the pattern", async () => {
    await setup();
    type("beh");
    const slots = screen.getByLabelText("Gợi ý độ dài").querySelectorAll(".recall-slot");
    expect(Array.from(slots).slice(0, 3).map((s) => s.textContent)).toEqual(["b", "e", "h"]);
  });

  it("empty Enter does nothing", async () => {
    const { onDone } = await setup();
    enter();
    advance(3000);
    expect(onDone).not.toHaveBeenCalled();
    expect(input().readOnly).toBe(false);
  });

  it("preloads the pronunciation on show and plays it once on reveal", async () => {
    await setup();
    expect(mockUrl).toHaveBeenCalledTimes(1);
    expect(mockUrl).toHaveBeenCalledWith({ text: "behind schedule", language: "en", tier: "word" });
    const audio = StubAudio.instances[0];
    expect(audio.play).not.toHaveBeenCalled();
    type("behind schedual");
    enter();
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Nghe phát âm/ })).toBeNull();
  });

  it("plays when the audio arrives late, but not after the card is gone", async () => {
    let resolve!: (u: string) => void;
    mockUrl.mockReturnValue(new Promise<string>((r) => (resolve = r)));
    const a = await setup();
    type("behind schedual");
    enter();
    await act(async () => resolve("late"));
    expect(StubAudio.instances[0].play).toHaveBeenCalledTimes(1);
    a.unmount();

    StubAudio.instances = [];
    let resolve2!: (u: string) => void;
    mockUrl.mockReturnValue(new Promise<string>((r) => (resolve2 = r)));
    const b = await setup();
    type("behind schedual");
    enter();
    b.unmount();
    await act(async () => resolve2("late2"));
    expect(StubAudio.instances.every((i) => i.play.mock.calls.length === 0)).toBe(true);
  });

  it("audio failure is silent", async () => {
    mockUrl.mockRejectedValue(new Error("boom"));
    await setup();
    type("behind schedual");
    enter();
    expect(screen.getByText("Đáp án")).toBeTruthy();
    expect(screen.queryByText(/boom|lỗi/i)).toBeNull();
  });

  it("keeps focus on the input after clicking a hint", async () => {
    await setup();
    const btn = screen.getByRole("button", { name: "Gợi ý (3)" });
    expect(fireEvent.mouseDown(btn)).toBe(false);
    fireEvent.click(btn);
    expect(document.activeElement).toBe(input());
  });

  it("ignores Enter while an IME composition is active", async () => {
    const { onDone } = await setup();
    type("behind schedule");
    fireEvent.keyDown(input(), { key: "Enter", isComposing: true });
    expect(screen.queryByText("✓ Chính xác")).toBeNull();
    enter();
    expect(screen.getByText("✓ Chính xác")).toBeTruthy();
    enter();
    expect(onDone).toHaveBeenCalled();
  });

  it("shows the length pattern as slots, not as an input placeholder", async () => {
    await setup(PLAN);
    expect(input().placeholder).toBe("");
    expect(screen.getByLabelText("Gợi ý độ dài").querySelectorAll(".recall-slot").length).toBe(4);
  });
});
