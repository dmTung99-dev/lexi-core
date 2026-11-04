import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyGradingMemory,
  loadGradingMemory,
  loadInterviewTargets,
  loadSessionSnapshot,
  toReportMemoryInput,
  type GradingMemory,
} from "./learnerMemoryGrading";
import { getMistakeMemory, getTopicMemory, saveMistakeMemory, saveTopicMemory } from "./learnerMemory";
import { markConversationMemoryApplied } from "./conversationSessions";
import { markInterviewMemoryApplied } from "./interviewSessions";
import type { ConversationSession, ConversationSetup } from "./conversationTypes";
import type { InterviewSession } from "./interviewTypes";
import type { TopicMemory, TrackedMistake } from "./learnerMemoryTypes";

vi.mock("./learnerMemory", () => ({
  getMistakeMemory: vi.fn(),
  getTopicMemory: vi.fn(),
  saveMistakeMemory: vi.fn(),
  saveTopicMemory: vi.fn(),
}));
vi.mock("./conversationSessions", () => ({ markConversationMemoryApplied: vi.fn() }));
vi.mock("./interviewSessions", () => ({ markInterviewMemoryApplied: vi.fn() }));

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
  vi.mocked(saveMistakeMemory).mockResolvedValue(undefined);
  vi.mocked(saveTopicMemory).mockResolvedValue(undefined);
  vi.mocked(markConversationMemoryApplied).mockResolvedValue(undefined);
  vi.mocked(markInterviewMemoryApplied).mockResolvedValue(undefined);
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

const TOPIC: TopicMemory = {
  key: "topic_x", label: "Fresh", updatedAt: "x",
  facts: [{ id: "f1", fact: "Fresh fact", asked: [], updatedAt: "x" }],
};

function convSession(patch: Partial<ConversationSession> = {}): ConversationSession {
  return {
    id: "s1", createdAt: "x", status: "in_progress", setup: SETUP, summary: "", summarizedCount: 0,
    messages: [], goalsDone: [], report: null, reportError: false, ...patch,
  };
}

const IV_SESSION: InterviewSession = {
  id: "s2", createdAt: "x", status: "in_progress",
  setup: { role: "SE", level: "junior", type: "behavioral", questionCount: 5, voice: "male2", jd: "", cvSummary: null, reviewTranscript: true },
  plan: [], turns: [], report: null, reportError: false,
};

describe("loadGradingMemory", () => {
  it("returns null when memory was already applied", async () => {
    await expect(loadGradingMemory("u1", { kind: "conversation", session: convSession({ memoryApplied: true }) })).resolves.toBeNull();
    await expect(loadGradingMemory("u1", { kind: "interview", session: { ...IV_SESSION, memoryApplied: true } })).resolves.toBeNull();
    expect(getMistakeMemory).not.toHaveBeenCalled();
  });

  it("reads fresh memory under the snapshot's group, not the snapshot's facts", async () => {
    vi.mocked(getMistakeMemory).mockResolvedValue({ items: [DUE], updatedAt: "x" });
    vi.mocked(getTopicMemory).mockResolvedValue(TOPIC);
    const session = convSession({
      memory: { groupKey: "topic_x", groupLabel: "Snap", facts: [{ id: "old", fact: "Stale", asked: [], updatedAt: "x" }], targets: [] },
    });
    const gm = await loadGradingMemory("u1", { kind: "conversation", session });
    expect(getTopicMemory).toHaveBeenCalledWith("u1", "topic_x");
    expect(gm).toEqual({ kind: "conversation", mistakes: [DUE], topic: { key: "topic_x", label: "Snap", prev: TOPIC } });
    expect(toReportMemoryInput(gm)).toEqual({ tracked: [{ id: "m1", pattern: "p", rule: "r" }], facts: TOPIC.facts });
  });

  it("keeps the topic when the mistakes read fails, and the reverse", async () => {
    vi.mocked(getMistakeMemory).mockRejectedValue(new Error("boom"));
    vi.mocked(getTopicMemory).mockResolvedValue(TOPIC);
    const gm = await loadGradingMemory("u1", { kind: "conversation", session: convSession() });
    expect(gm).toEqual({ kind: "conversation", mistakes: null, topic: { key: "free", label: "Tự do", prev: TOPIC } });
    expect(toReportMemoryInput(gm)).toEqual({ tracked: [], facts: TOPIC.facts });

    vi.mocked(getMistakeMemory).mockResolvedValue({ items: [DUE], updatedAt: "x" });
    vi.mocked(getTopicMemory).mockRejectedValue(new Error("boom"));
    const gm2 = await loadGradingMemory("u1", { kind: "conversation", session: convSession() });
    expect(gm2).toEqual({ kind: "conversation", mistakes: [DUE], topic: null });
    expect(toReportMemoryInput(gm2)?.facts).toBeNull();
  });

  it("uses memoryGroupKey(setup) when the session has no snapshot", async () => {
    const gm = await loadGradingMemory("u1", { kind: "conversation", session: convSession({ setup: { ...SETUP, prepId: "p9" } }) });
    expect(getTopicMemory).toHaveBeenCalledWith("u1", "prep_p9");
    expect(gm?.topic).toEqual({ key: "prep_p9", label: "Travel", prev: null });
  });

  it("reads only mistakes for an interview", async () => {
    vi.mocked(getMistakeMemory).mockResolvedValue({ items: [DUE], updatedAt: "x" });
    const gm = await loadGradingMemory("u1", { kind: "interview", session: IV_SESSION });
    expect(gm).toEqual({ kind: "interview", mistakes: [DUE], topic: null });
    expect(getTopicMemory).not.toHaveBeenCalled();
  });
});

describe("toReportMemoryInput", () => {
  it("is undefined without grading memory", () => {
    expect(toReportMemoryInput(null)).toBeUndefined();
  });
});

describe("applyGradingMemory", () => {
  const FOUND = { pattern: "np", rule: "nr", example: { said: "a", better: "b" } };

  it("writes mistakes and topic, then marks the session", async () => {
    const gm: GradingMemory = { kind: "conversation", mistakes: [DUE], topic: { key: "free", label: "Tự do", prev: null } };
    await applyGradingMemory("u1", "s1", gm, { checks: [{ id: "m1", result: "correct" }], found: [FOUND], topicFacts: [{ fact: "Likes tea", asked: [] }] }, NOW);
    const items = vi.mocked(saveMistakeMemory).mock.calls[0][1];
    expect(items.map((m) => m.pattern)).toEqual(["p", "np"]);
    expect(items[0].sm2Repetitions).toBe(1);
    expect(items[1].source).toBe("conversation");
    expect(saveTopicMemory).toHaveBeenCalledWith("u1", expect.objectContaining({ key: "free", label: "Tự do", facts: [expect.objectContaining({ fact: "Likes tea" })] }));
    expect(markConversationMemoryApplied).toHaveBeenCalledWith("u1", "s1");
    expect(vi.mocked(markConversationMemoryApplied).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(saveTopicMemory).mock.invocationCallOrder[0]
    );
  });

  it("skips the mistakes write when its read failed, but still marks applied", async () => {
    const gm: GradingMemory = { kind: "conversation", mistakes: null, topic: { key: "free", label: "Tự do", prev: null } };
    await applyGradingMemory("u1", "s1", gm, { checks: [], found: [FOUND], topicFacts: null }, NOW);
    expect(saveMistakeMemory).not.toHaveBeenCalled();
    expect(saveTopicMemory).not.toHaveBeenCalled();
    expect(markConversationMemoryApplied).toHaveBeenCalledWith("u1", "s1");
  });

  it("tags interview mistakes, marks the interview session and never throws", async () => {
    vi.mocked(saveMistakeMemory).mockRejectedValue(new Error("down"));
    vi.mocked(markInterviewMemoryApplied).mockRejectedValue(new Error("down"));
    const gm: GradingMemory = { kind: "interview", mistakes: [], topic: null };
    await expect(applyGradingMemory("u1", "s2", gm, { checks: [], found: [FOUND], topicFacts: null }, NOW)).resolves.toBeUndefined();
    expect(vi.mocked(saveMistakeMemory).mock.calls[0][1][0].source).toBe("interview");
    expect(markInterviewMemoryApplied).toHaveBeenCalledWith("u1", "s2");
    expect(markConversationMemoryApplied).not.toHaveBeenCalled();
  });
});
