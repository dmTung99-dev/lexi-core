import { describe, expect, it, vi } from "vitest";
import { httpsCallable } from "firebase/functions";
import { blobToBase64, transcribeAudio } from "./transcribeAudioClient";

const callableMock = vi.fn();
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn(() => callableMock) }));
vi.mock("./firebase", () => ({ getFirebaseFunctions: vi.fn(() => "fns") }));

describe("transcribeAudioClient", () => {
  it("base64-encodes a blob", async () => {
    await expect(blobToBase64(new Blob(["hello"]))).resolves.toBe("aGVsbG8=");
  });

  it("calls transcribeAudio with English and returns the text", async () => {
    callableMock.mockResolvedValue({ data: { text: "I built it.", language: "en" } });
    await expect(transcribeAudio(new Blob(["hello"]))).resolves.toBe("I built it.");
    expect(httpsCallable).toHaveBeenCalledWith("fns", "transcribeAudio");
    expect(callableMock).toHaveBeenCalledWith({ audioBase64: "aGVsbG8=", language: "en" });
  });
});
