import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDoc, getDoc, setDoc } from "firebase/firestore";
import { deleteCvProfile, getCvProfile, saveCvProfile } from "./cvProfile";

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => "ref"),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));
vi.mock("./firebase", () => ({ getFirebaseDb: vi.fn(() => "db") }));

const PROFILE = { fileName: "cv.pdf", text: "t", summary: "s", topics: ["a"], updatedAt: "2026-09-27" };

beforeEach(() => vi.clearAllMocks());

describe("cvProfile", () => {
  it("returns null when missing", async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    await expect(getCvProfile("u1")).resolves.toBeNull();
  });

  it("returns stored data", async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => PROFILE } as never);
    await expect(getCvProfile("u1")).resolves.toEqual(PROFILE);
  });

  it("saves and deletes", async () => {
    await saveCvProfile("u1", PROFILE);
    expect(setDoc).toHaveBeenCalledWith("ref", PROFILE);
    await deleteCvProfile("u1");
    expect(deleteDoc).toHaveBeenCalledWith("ref");
  });
});
