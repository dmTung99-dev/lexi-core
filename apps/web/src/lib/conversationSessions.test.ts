import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import {
  completeConversationSession,
  createConversationSession,
  deleteConversationSession,
  getConversationSession,
  listRecentConversationSessions,
  saveConversationProgress,
} from "./conversationSessions";
import type { ConversationSetup } from "./conversationTypes";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => "col"),
  doc: vi.fn(() => ({ id: "new-id" })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(() => "q"),
  orderBy: vi.fn(() => "ob"),
  limit: vi.fn(() => "lim"),
}));
vi.mock("./firebase", () => ({ getFirebaseDb: vi.fn(() => "db") }));

const SETUP: ConversationSetup = {
  mode: "topic", topic: "Travel", level: "B1", voice: "female1",
  speakAloud: true, reviewTranscript: true, persona: null, goals: [],
};

beforeEach(() => vi.clearAllMocks());

describe("conversationSessions", () => {
  it("creates an in_progress session with empty chat state and returns its id", async () => {
    vi.mocked(doc).mockReturnValue({ id: "new-id" } as never);
    const id = await createConversationSession("u1", SETUP);
    expect(id).toBe("new-id");
    expect(setDoc).toHaveBeenCalledWith(
      { id: "new-id" },
      expect.objectContaining({
        id: "new-id", status: "in_progress", setup: SETUP,
        summary: "", summarizedCount: 0, messages: [], goalsDone: [],
        report: null, reportError: false, createdAt: expect.any(String),
      })
    );
  });

  it("returns null for a missing session and the session with its id otherwise", async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false } as never);
    await expect(getConversationSession("u1", "x")).resolves.toBeNull();
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => true, id: "s1", data: () => ({ summary: "S" }) } as never);
    await expect(getConversationSession("u1", "s1")).resolves.toMatchObject({ id: "s1", summary: "S" });
  });

  it("saves a progress patch as-is", async () => {
    await saveConversationProgress("u1", "s1", { messages: [{ role: "ai", text: "Hi" }], goalsDone: [0] });
    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), { messages: [{ role: "ai", text: "Hi" }], goalsDone: [0] });
  });

  it("completes with a report, or flags reportError when the report is null", async () => {
    const report = { overall: 7 } as never;
    await completeConversationSession("u1", "s1", report);
    expect(updateDoc).toHaveBeenLastCalledWith(expect.anything(), { status: "completed", report, reportError: false });
    await completeConversationSession("u1", "s1", null);
    expect(updateDoc).toHaveBeenLastCalledWith(expect.anything(), { status: "completed", report: null, reportError: true });
  });

  it("deletes a session", async () => {
    await deleteConversationSession("u1", "s1");
    expect(deleteDoc).toHaveBeenCalled();
  });

  it("lists only completed sessions, capped at max", async () => {
    vi.mocked(getDocs).mockResolvedValue({
      docs: [
        { id: "a", data: () => ({ status: "completed" }) },
        { id: "b", data: () => ({ status: "in_progress" }) },
        { id: "c", data: () => ({ status: "completed" }) },
        { id: "d", data: () => ({ status: "completed" }) },
      ],
    } as never);
    const out = await listRecentConversationSessions("u1", 2);
    expect(out.map((s) => s.id)).toEqual(["a", "c"]);
  });
});
