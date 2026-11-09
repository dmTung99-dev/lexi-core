import { beforeEach, describe, expect, it, vi } from "vitest";
import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc } from "firebase/firestore";
import {
  deleteCoveredItem,
  deleteTopicFact,
  deleteTopicMemory,
  deleteTrackedMistake,
  getMistakeMemory,
  getPrepCoverage,
  getTopicMemory,
  isPrepGroupKey,
  listPrepSceneMemories,
  listTopicMemories,
  saveMistakeMemory,
  savePrepCoverage,
  saveTopicMemory,
} from "./learnerMemory";
import type { TopicMemory, TrackedMistake } from "./learnerMemoryTypes";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => "col"),
  doc: vi.fn(() => "ref"),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(() => "q"),
  orderBy: vi.fn(() => "ob"),
}));
vi.mock("./firebase", () => ({ getFirebaseDb: vi.fn(() => "db") }));

function mistake(id: string): TrackedMistake {
  return {
    id, pattern: "p", rule: "r", example: { said: "a", better: "b" }, source: "conversation",
    createdAt: "2026-01-01T00:00:00.000Z", lastSeenAt: "2026-01-01T00:00:00.000Z",
    sm2Repetitions: 0, sm2EaseFactor: 2.5, sm2Interval: 0, nextReviewAt: "2026-01-01T00:00:00.000Z",
  };
}

function topic(factIds: string[]): TopicMemory {
  return {
    key: "free", label: "Tự do", updatedAt: "2026-01-01T00:00:00.000Z",
    facts: factIds.map((id) => ({ id, fact: "f", asked: [], updatedAt: "2026-01-01T00:00:00.000Z" })),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("learnerMemory", () => {
  it("returns an empty mistake memory when the doc is missing", async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    expect(await getMistakeMemory("u1")).toEqual({ items: [], updatedAt: "" });
    expect(doc).toHaveBeenCalledWith("db", "users", "u1", "learner_memory", "mistakes");
  });

  it("propagates Firestore errors on read", async () => {
    vi.mocked(getDoc).mockRejectedValue(new Error("boom"));
    await expect(getMistakeMemory("u1")).rejects.toThrow("boom");
  });

  it("saves mistakes as { items, updatedAt }", async () => {
    await saveMistakeMemory("u1", [mistake("m1")]);
    expect(setDoc).toHaveBeenCalledWith("ref", { items: [mistake("m1")], updatedAt: expect.any(String) });
  });

  it("returns null for a missing topic memory", async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    expect(await getTopicMemory("u1", "free")).toBeNull();
    expect(doc).toHaveBeenCalledWith("db", "users", "u1", "conversation_memory", "free");
  });

  it("returns an existing topic memory", async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => topic(["a"]) } as never);
    expect(await getTopicMemory("u1", "free")).toEqual(topic(["a"]));
  });

  it("defaults missing facts to an empty list", async () => {
    const { facts: _facts, ...noFacts } = topic([]);
    vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => noFacts } as never);
    expect((await getTopicMemory("u1", "free"))?.facts).toEqual([]);
    vi.mocked(getDocs).mockResolvedValue({ docs: [{ data: () => noFacts }] } as never);
    expect((await listTopicMemories("u1"))[0].facts).toEqual([]);
  });

  it("saves a topic memory under its key", async () => {
    await saveTopicMemory("u1", topic(["a"]));
    expect(doc).toHaveBeenCalledWith("db", "users", "u1", "conversation_memory", "free");
    expect(setDoc).toHaveBeenCalledWith("ref", topic(["a"]));
  });

  it("lists topic memories ordered by updatedAt desc", async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [{ data: () => topic(["a"]) }] } as never);
    expect(await listTopicMemories("u1")).toEqual([topic(["a"])]);
    expect(collection).toHaveBeenCalledWith("db", "users", "u1", "conversation_memory");
    expect(orderBy).toHaveBeenCalledWith("updatedAt", "desc");
    expect(query).toHaveBeenCalled();
  });

  it("deleteTrackedMistake writes the items without the id", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true, data: () => ({ items: [mistake("m1"), mistake("m2")], updatedAt: "x" }),
    } as never);
    await deleteTrackedMistake("u1", "m1");
    expect(setDoc).toHaveBeenCalledWith("ref", { items: [mistake("m2")], updatedAt: expect.any(String) });
  });

  it("deleteTopicFact keeps the doc while facts remain", async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => topic(["a", "b"]) } as never);
    await deleteTopicFact("u1", "free", "a");
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(setDoc).toHaveBeenCalledWith("ref", expect.objectContaining({ facts: topic(["b"]).facts }));
  });

  it("deleteTopicFact deletes the doc when the last fact goes", async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => topic(["a"]) } as never);
    await deleteTopicFact("u1", "free", "a");
    expect(deleteDoc).toHaveBeenCalledWith("ref");
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("deleteTopicFact is a no-op for a missing doc", async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    await deleteTopicFact("u1", "free", "a");
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("deleteTopicMemory deletes the doc", async () => {
    await deleteTopicMemory("u1", "free");
    expect(deleteDoc).toHaveBeenCalledWith("ref");
  });
});

function scene(prepId: string, factIds: string[], updatedAt = "2026-01-01T00:00:00.000Z"): TopicMemory {
  return {
    key: `prep_${prepId}`, label: "Kit", updatedAt,
    facts: factIds.map((id) => ({ id, fact: "f", asked: [], updatedAt })),
  };
}

describe("prep scene memory routing", () => {
  it("recognises prep group keys", () => {
    expect(isPrepGroupKey("prep_p1")).toBe(true);
    expect(isPrepGroupKey("topic_travel")).toBe(false);
    expect(isPrepGroupKey("free")).toBe(false);
  });

  it("reads a kit's scene memory from prep_scene_memory", async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => true, data: () => scene("p1", ["a"]) } as never);
    expect(await getTopicMemory("u1", "prep_p1")).toEqual(scene("p1", ["a"]));
    expect(doc).toHaveBeenCalledWith("db", "users", "u1", "prep_scene_memory", "p1");
    expect(getDoc).toHaveBeenCalledTimes(1);
  });

  it("falls back to the legacy conversation_memory doc", async () => {
    vi.mocked(getDoc)
      .mockResolvedValueOnce({ exists: () => false } as never)
      .mockResolvedValueOnce({ exists: () => true, data: () => scene("p1", ["old"]) } as never);
    expect(await getTopicMemory("u1", "prep_p1")).toEqual(scene("p1", ["old"]));
    expect(doc).toHaveBeenCalledWith("db", "users", "u1", "conversation_memory", "prep_p1");
  });

  it("returns null when neither doc exists", async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    expect(await getTopicMemory("u1", "prep_p1")).toBeNull();
  });

  it("saves to prep_scene_memory and removes the legacy doc", async () => {
    await saveTopicMemory("u1", scene("p1", ["a"]));
    expect(doc).toHaveBeenCalledWith("db", "users", "u1", "prep_scene_memory", "p1");
    expect(setDoc).toHaveBeenCalledWith("ref", scene("p1", ["a"]));
    expect(doc).toHaveBeenCalledWith("db", "users", "u1", "conversation_memory", "prep_p1");
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it("still resolves when removing the legacy doc fails", async () => {
    vi.mocked(deleteDoc).mockRejectedValueOnce(new Error("nope"));
    await expect(saveTopicMemory("u1", scene("p1", ["a"]))).resolves.toBeUndefined();
  });

  it("keeps non-prep keys in conversation_memory", async () => {
    await saveTopicMemory("u1", topic(["a"]));
    expect(doc).toHaveBeenCalledWith("db", "users", "u1", "conversation_memory", "free");
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it("listTopicMemories leaves out prep groups", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [{ data: () => topic(["a"]) }, { data: () => scene("p1", ["b"]) }],
    } as never);
    expect((await listTopicMemories("u1")).map((m) => m.key)).toEqual(["free"]);
  });

  it("listPrepSceneMemories merges new and legacy docs, new wins, newest first", async () => {
    vi.mocked(getDocs)
      .mockResolvedValueOnce({
        docs: [{ data: () => scene("p1", ["new"], "2026-01-02T00:00:00.000Z") }],
      } as never)
      .mockResolvedValueOnce({
        docs: [
          { data: () => scene("p1", ["legacy"], "2026-01-01T00:00:00.000Z") },
          { data: () => scene("p2", ["legacy2"], "2026-01-03T00:00:00.000Z") },
          { data: () => topic(["a"]) },
        ],
      } as never);
    const list = await listPrepSceneMemories("u1");
    expect(list.map((m) => [m.key, m.facts[0].id])).toEqual([
      ["prep_p2", "legacy2"],
      ["prep_p1", "new"],
    ]);
    expect(collection).toHaveBeenCalledWith("db", "users", "u1", "prep_scene_memory");
  });

  it("deleteTopicMemory for a prep key removes the new and the legacy doc", async () => {
    await deleteTopicMemory("u1", "prep_p1");
    expect(deleteDoc).toHaveBeenCalledTimes(2);
    expect(doc).toHaveBeenCalledWith("db", "users", "u1", "prep_scene_memory", "p1");
    expect(doc).toHaveBeenCalledWith("db", "users", "u1", "conversation_memory", "prep_p1");
  });

  it("deleteTopicFact on the last prep fact removes both docs", async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => true, data: () => scene("p1", ["a"]) } as never);
    await deleteTopicFact("u1", "prep_p1", "a");
    expect(deleteDoc).toHaveBeenCalledTimes(2);
    expect(setDoc).not.toHaveBeenCalled();
  });
});

describe("prep coverage storage", () => {
  it("returns empty coverage when the doc is missing", async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false } as never);
    expect(await getPrepCoverage("u1")).toEqual({ patterns: [], words: [], updatedAt: "" });
    expect(doc).toHaveBeenCalledWith("db", "users", "u1", "prep_memory", "coverage");
  });

  it("defaults missing lists", async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => true, data: () => ({ updatedAt: "t" }) } as never);
    expect(await getPrepCoverage("u1")).toEqual({ patterns: [], words: [], updatedAt: "t" });
  });

  it("saves coverage as-is", async () => {
    const cov = { patterns: [{ text: "p", lastSeenAt: "t" }], words: [], updatedAt: "t" };
    await savePrepCoverage("u1", cov);
    expect(setDoc).toHaveBeenCalledWith("ref", cov);
  });

  it("deleteCoveredItem removes one word and keeps the patterns", async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        patterns: [{ text: "p", lastSeenAt: "t" }],
        words: [{ text: "Behind schedule", lastSeenAt: "t" }, { text: "a heads-up", lastSeenAt: "t" }],
        updatedAt: "t",
      }),
    } as never);
    await deleteCoveredItem("u1", "words", "behind schedule");
    expect(setDoc).toHaveBeenCalledWith("ref", {
      patterns: [{ text: "p", lastSeenAt: "t" }],
      words: [{ text: "a heads-up", lastSeenAt: "t" }],
      updatedAt: expect.any(String),
    });
  });
});
