import { beforeEach, describe, expect, it, vi } from "vitest";
import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, setDoc } from "firebase/firestore";
import {
  createConversationPrep,
  deleteConversationPrep,
  getConversationPrep,
  listRecentConversationPreps,
} from "./conversationPreps";
import type { NewConversationPrep } from "./conversationPrepTypes";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => "col"),
  doc: vi.fn(() => ({ id: "new-id" })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(() => "q"),
  orderBy: vi.fn(() => "ob"),
  limit: vi.fn(() => "lim"),
}));
vi.mock("./firebase", () => ({ getFirebaseDb: vi.fn(() => "db") }));

const PREP: NewConversationPrep = {
  situation: "Báo cáo task A",
  level: "B1",
  title: "Báo cáo",
  persona: "A client.",
  goals: ["Chào"],
  dialogue: [{ speaker: "you", en: "Hi", vi: "Chào" }],
  patterns: [{ pattern: "Hi ___", meaning: "m", example: "Hi", why: [] }],
  vocab: [{ text: "hi", meaning: "chào", example: "Hi!" }],
};

beforeEach(() => vi.clearAllMocks());

describe("conversationPreps", () => {
  it("writes a kit under users/{uid}/conversation_preps with id and createdAt", async () => {
    vi.mocked(doc).mockReturnValue({ id: "new-id" } as never);
    await expect(createConversationPrep("u1", PREP)).resolves.toBe("new-id");
    expect(collection).toHaveBeenCalledWith("db", "users", "u1", "conversation_preps");
    expect(setDoc).toHaveBeenCalledWith({ id: "new-id" }, { ...PREP, id: "new-id", createdAt: expect.any(String) });
  });

  it("returns null for a missing kit and the kit with its id otherwise", async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false } as never);
    await expect(getConversationPrep("u1", "x")).resolves.toBeNull();
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => true, id: "p1", data: () => ({ title: "T" }) } as never);
    await expect(getConversationPrep("u1", "p1")).resolves.toEqual({ title: "T", id: "p1" });
    expect(doc).toHaveBeenCalledWith("db", "users", "u1", "conversation_preps", "p1");
  });

  it("lists newest first, limited", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [
        { id: "a", data: () => ({ title: "A" }) },
        { id: "b", data: () => ({ title: "B" }) },
      ],
    } as never);
    await expect(listRecentConversationPreps("u1", 5)).resolves.toEqual([
      { title: "A", id: "a" },
      { title: "B", id: "b" },
    ]);
    expect(orderBy).toHaveBeenCalledWith("createdAt", "desc");
    expect(limit).toHaveBeenCalledWith(5);
  });

  it("deletes a kit", async () => {
    await deleteConversationPrep("u1", "p1");
    expect(deleteDoc).toHaveBeenCalledTimes(1);
    expect(doc).toHaveBeenCalledWith("db", "users", "u1", "conversation_preps", "p1");
  });
});
