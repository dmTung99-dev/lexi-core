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

  it("sends a trimmed prompt when given", async () => {
    callableMock.mockResolvedValue({ data: { text: "ok", language: "en" } });
    await transcribeAudio(new Blob(["hello"]), { prompt: "  Topic: travel.  " });
    expect(callableMock).toHaveBeenLastCalledWith({
      audioBase64: "aGVsbG8=",
      language: "en",
      prompt: "Topic: travel.",
    });
  });

  it("omits the prompt key when empty or whitespace", async () => {
    callableMock.mockResolvedValue({ data: { text: "ok", language: "en" } });
    await transcribeAudio(new Blob(["hello"]), { prompt: "   " });
    expect(callableMock).toHaveBeenLastCalledWith({ audioBase64: "aGVsbG8=", language: "en" });
    await transcribeAudio(new Blob(["hello"]), {});
    expect(callableMock).toHaveBeenLastCalledWith({ audioBase64: "aGVsbG8=", language: "en" });
  });

  it("caps the prompt at 600 chars keeping the tail", async () => {
    callableMock.mockResolvedValue({ data: { text: "ok", language: "en" } });
    await transcribeAudio(new Blob(["hello"]), { prompt: "a".repeat(100) + "b".repeat(600) });
    expect(callableMock).toHaveBeenLastCalledWith({
      audioBase64: "aGVsbG8=",
      language: "en",
      prompt: "b".repeat(600),
    });
  });

  it("cuts the 600 cap by code point so an emoji is never split", async () => {
    callableMock.mockResolvedValue({ data: { text: "ok", language: "en" } });
    await transcribeAudio(new Blob(["hello"]), { prompt: "😀".repeat(400) + "y" });
    const sent = callableMock.mock.calls.at(-1)![0].prompt as string;
    expect(sent.length).toBeLessThanOrEqual(600);
    expect(/\p{Surrogate}/u.test(sent)).toBe(false);
    expect(sent).toBe("😀".repeat(299) + "y");
  });
});
