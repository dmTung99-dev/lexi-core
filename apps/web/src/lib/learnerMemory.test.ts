import { beforeEach, describe, expect, it, vi } from "vitest";
import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc } from "firebase/firestore";
import {
  deleteTopicFact,
  deleteTopicMemory,
  deleteTrackedMistake,
  getMistakeMemory,
  getTopicMemory,
  listTopicMemories,
  saveMistakeMemory,
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
