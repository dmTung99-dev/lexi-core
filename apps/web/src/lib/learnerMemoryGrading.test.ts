import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadInterviewTargets, loadSessionSnapshot } from "./learnerMemoryGrading";
import { getMistakeMemory, getTopicMemory } from "./learnerMemory";
import type { ConversationSetup } from "./conversationTypes";
import type { TrackedMistake } from "./learnerMemoryTypes";

vi.mock("./learnerMemory", () => ({ getMistakeMemory: vi.fn(), getTopicMemory: vi.fn() }));

const SETUP: ConversationSetup = {
  mode: "topic", topic: "Travel", level: "B1", voice: "female1",
  speakAloud: true, reviewTranscript: true, persona: null, goals: [],
};
const NOW = new Date("2026-11-04T00:00:00.000Z");
const DUE: TrackedMistake = {
  id: "m1", pattern: "p", rule: "r", example: { said: "w", better: "ok" },
  source: "conversation", createdAt: "2026-10-01T00:00:00.000Z", lastSeenAt: "2026-10-01T00:00:00.000Z",
  sm2Repetitions: 0, sm2EaseFactor: 2.5, sm2Interval: 0, nextReviewAt: "2026-11-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMistakeMemory).mockResolvedValue({ items: [], updatedAt: "" });
  vi.mocked(getTopicMemory).mockResolvedValue(null);
});

describe("loadSessionSnapshot", () => {
  it("returns an empty free-group snapshot when nothing is remembered", async () => {
    await expect(loadSessionSnapshot("u1", SETUP, NOW)).resolves.toEqual({
      groupKey: "free", groupLabel: "Tự do", facts: [], targets: [],
    });
    expect(getTopicMemory).toHaveBeenCalledWith("u1", "free");
  });

  it("includes topic facts and up to 3 due targets", async () => {
    const facts = [{ text: "Likes Hoi An", updatedAt: "x" }] as never;
    vi.mocked(getTopicMemory).mockResolvedValue({ key: "free", label: "Tự do", facts, updatedAt: "x" } as never);
    vi.mocked(getMistakeMemory).mockResolvedValue({ items: [DUE], updatedAt: "x" });
    const snap = await loadSessionSnapshot("u1", SETUP, NOW);
    expect(snap?.facts).toEqual(facts);
    expect(snap?.targets).toEqual([{ id: "m1", pattern: "p", rule: "r", example: { said: "w", better: "ok" } }]);
  });

  it("returns undefined when a read fails", async () => {
    vi.mocked(getMistakeMemory).mockRejectedValue(new Error("boom"));
    await expect(loadSessionSnapshot("u1", SETUP, NOW)).resolves.toBeUndefined();
    vi.mocked(getMistakeMemory).mockResolvedValue({ items: [], updatedAt: "" });
    vi.mocked(getTopicMemory).mockRejectedValue(new Error("boom"));
    await expect(loadSessionSnapshot("u1", SETUP, NOW)).resolves.toBeUndefined();
  });
});

describe("loadInterviewTargets", () => {
  it("returns up to 2 due targets, or undefined on failure", async () => {
    const many = ["a", "b", "c"].map((id) => ({ ...DUE, id }));
    vi.mocked(getMistakeMemory).mockResolvedValue({ items: many, updatedAt: "x" });
    const targets = await loadInterviewTargets("u1", NOW);
    expect(targets?.map((t) => t.id)).toEqual(["a", "b"]);
    vi.mocked(getMistakeMemory).mockRejectedValue(new Error("boom"));
    await expect(loadInterviewTargets("u1", NOW)).resolves.toBeUndefined();
  });
});
