import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteTopicMemory, getMistakeMemory, getPrepCoverage, savePrepCoverage } from "./learnerMemory";
import { deleteKitMemory, loadKitMemory, recordKitCoverage } from "./prepMemory";
import type { TrackedMistake } from "./learnerMemoryTypes";

vi.mock("./learnerMemory", () => ({
  getPrepCoverage: vi.fn(),
  savePrepCoverage: vi.fn(),
  getMistakeMemory: vi.fn(),
  deleteTopicMemory: vi.fn(),
}));

const NOW = new Date("2026-11-09T00:00:00.000Z");

function mistake(id: string, nextReviewAt: string): TrackedMistake {
  return {
    id, pattern: `p-${id}`, rule: "r", example: { said: "s", better: "b" }, source: "conversation",
    createdAt: "2026-01-01T00:00:00.000Z", lastSeenAt: "2026-01-01T00:00:00.000Z",
    sm2Repetitions: 0, sm2EaseFactor: 2.5, sm2Interval: 0, nextReviewAt,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("loadKitMemory", () => {
  it("returns the most recent covered items and up to 2 due mistakes", async () => {
    vi.mocked(getPrepCoverage).mockResolvedValueOnce({
      patterns: Array.from({ length: 45 }, (_, i) => ({ text: `p${i}`, lastSeenAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() })),
      words: [{ text: "w1", lastSeenAt: "2026-01-01T00:00:00.000Z" }],
      updatedAt: "x",
    });
    vi.mocked(getMistakeMemory).mockResolvedValueOnce({
      items: [mistake("a", "2026-01-01T00:00:00.000Z"), mistake("b", "2026-01-02T00:00:00.000Z"), mistake("c", "2026-01-03T00:00:00.000Z"), mistake("later", "2027-01-01T00:00:00.000Z")],
      updatedAt: "x",
    });
    const mem = await loadKitMemory("u1", NOW);
    expect(mem?.patterns).toHaveLength(40);
    expect(mem?.patterns[0]).toBe("p44");
    expect(mem?.patterns).not.toContain("p0");
    expect(mem?.words).toEqual(["w1"]);
    expect(mem?.targets.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("returns undefined when a read fails", async () => {
    vi.mocked(getPrepCoverage).mockRejectedValueOnce(new Error("offline"));
    vi.mocked(getMistakeMemory).mockResolvedValueOnce({ items: [], updatedAt: "" });
    expect(await loadKitMemory("u1", NOW)).toBeUndefined();
  });
});

describe("recordKitCoverage", () => {
  it("adds the kit's patterns and vocab to the coverage", async () => {
    vi.mocked(getPrepCoverage).mockResolvedValueOnce({ patterns: [], words: [], updatedAt: "" });
    await recordKitCoverage("u1", { patterns: [{ pattern: "I'd like to ___" }], vocab: [{ text: "behind schedule" }] }, NOW);
    expect(savePrepCoverage).toHaveBeenCalledWith("u1", {
      patterns: [{ text: "I'd like to ___", lastSeenAt: NOW.toISOString() }],
      words: [{ text: "behind schedule", lastSeenAt: NOW.toISOString() }],
      updatedAt: NOW.toISOString(),
    });
  });

  it("never throws", async () => {
    vi.mocked(getPrepCoverage).mockRejectedValueOnce(new Error("offline"));
    await expect(recordKitCoverage("u1", { patterns: [], vocab: [] }, NOW)).resolves.toBeUndefined();
    expect(savePrepCoverage).not.toHaveBeenCalled();
  });
});

describe("deleteKitMemory", () => {
  it("deletes the kit's scene memory group", async () => {
    await deleteKitMemory("u1", "p1");
    expect(deleteTopicMemory).toHaveBeenCalledWith("u1", "prep_p1");
  });

  it("never throws", async () => {
    vi.mocked(deleteTopicMemory).mockRejectedValueOnce(new Error("x"));
    await expect(deleteKitMemory("u1", "p1")).resolves.toBeUndefined();
  });
});
