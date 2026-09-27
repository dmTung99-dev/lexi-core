import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc } from "firebase/firestore";
import {
  completeInterviewSession,
  createInterviewSession,
  deleteInterviewSession,
  getInterviewSession,
  listRecentInterviewSessions,
  saveInterviewPlan,
  saveInterviewTurns,
} from "./interviewSessions";
import type { InterviewSetup } from "./interviewTypes";

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

const SETUP: InterviewSetup = {
  role: "SE",
  level: "junior",
  type: "behavioral",
  questionCount: 5,
  voice: "male2",
  jd: "",
  cvSummary: null,
  reviewTranscript: true,
};

beforeEach(() => vi.clearAllMocks());

describe("interviewSessions", () => {
  it("creates an in_progress session with empty plan and turns and returns its id", async () => {
    vi.mocked(doc).mockReturnValue({ id: "new-id" } as never);
    const id = await createInterviewSession("u1", SETUP);
    expect(id).toBe("new-id");
    expect(setDoc).toHaveBeenCalledWith(
      { id: "new-id" },
      expect.objectContaining({
        id: "new-id",
        status: "in_progress",
        setup: SETUP,
        plan: [],
        turns: [],
        report: null,
        reportError: false,
        createdAt: expect.any(String),
      })
    );
  });

  it("returns null for a missing session", async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    await expect(getInterviewSession("u1", "x")).resolves.toBeNull();
  });

  it("returns the session with its id", async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => true, id: "s1", data: () => ({ plan: ["Q"] }) } as never);
    await expect(getInterviewSession("u1", "s1")).resolves.toEqual({ plan: ["Q"], id: "s1" });
  });

  it("updates plan, turns, and completion", async () => {
    await saveInterviewPlan("u1", "s1", ["Q1"]);
    expect(updateDoc).toHaveBeenLastCalledWith(expect.anything(), { plan: ["Q1"] });
    await saveInterviewTurns("u1", "s1", []);
    expect(updateDoc).toHaveBeenLastCalledWith(expect.anything(), { turns: [] });
    await completeInterviewSession("u1", "s1", null);
    expect(updateDoc).toHaveBeenLastCalledWith(expect.anything(), {
      status: "completed",
      report: null,
      reportError: true,
    });
  });

  it("deletes", async () => {
    await deleteInterviewSession("u1", "s1");
    expect(deleteDoc).toHaveBeenCalled();
  });

  it("lists recent completed sessions newest first", async () => {
    vi.mocked(getDocs).mockResolvedValue({
      docs: [
        { id: "a", data: () => ({ status: "completed", createdAt: "2026-09-02" }) },
        { id: "b", data: () => ({ status: "in_progress", createdAt: "2026-09-01" }) },
        { id: "c", data: () => ({ status: "completed", createdAt: "2026-08-30" }) },
      ],
    } as never);
    const list = await listRecentInterviewSessions("u1", 5);
    expect(list.map((s) => s.id)).toEqual(["a", "c"]);
    expect(orderBy).toHaveBeenCalledWith("createdAt", "desc");
    expect(limit).toHaveBeenCalledWith(20);
    expect(query).toHaveBeenCalled();
  });
});
