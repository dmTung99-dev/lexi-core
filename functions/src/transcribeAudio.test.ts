import { afterEach, describe, expect, it, vi } from "vitest";
import type { CallableRequest } from "firebase-functions/v2/https";

vi.mock("./services/cloudRunClient", async () => {
  const actual = await vi.importActual<typeof import("./services/cloudRunClient")>(
    "./services/cloudRunClient"
  );
  return { ...actual, transcribeViaCloudRun: vi.fn() };
});

import { transcribeViaCloudRun } from "./services/cloudRunClient";
import { transcribeAudioHandler, transcribeAudio } from "./transcribeAudio";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function makeRequest(data: unknown, authed = true): CallableRequest<unknown> {
  return {
    auth: authed ? { uid: "user-123" } : undefined,
    data,
  } as CallableRequest<unknown>;
}

describe("transcribeAudioHandler", () => {
  it("throws unauthenticated when there is no auth context", async () => {
    await expect(
      transcribeAudioHandler(makeRequest({ audioBase64: "aGVsbG8=" }, false))
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws invalid-argument for a malformed payload", async () => {
    await expect(transcribeAudioHandler(makeRequest({ audioBase64: "" }))).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("throws invalid-argument for an unsupported language", async () => {
    await expect(
      transcribeAudioHandler(makeRequest({ audioBase64: "aGVsbG8=", language: "fr" }))
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument for audioBase64 over 10MB", async () => {
    await expect(
      transcribeAudioHandler(makeRequest({ audioBase64: "a".repeat(10_000_001) }))
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument for a non-string prompt", async () => {
    await expect(
      transcribeAudioHandler(makeRequest({ audioBase64: "aGVsbG8=", prompt: 42 }))
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument for a prompt over 600 characters", async () => {
    await expect(
      transcribeAudioHandler(makeRequest({ audioBase64: "aGVsbG8=", prompt: "a".repeat(601) }))
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("forwards a valid prompt to Cloud Run", async () => {
    vi.stubEnv("TTS_STT_SERVICE_URL", "https://tts-stt.a.run.app");
    vi.mocked(transcribeViaCloudRun).mockResolvedValue({ text: "hi", language: "en" });

    await transcribeAudioHandler(
      makeRequest({ audioBase64: "aGVsbG8=", language: "en", prompt: "a".repeat(600) })
    );

    expect(transcribeViaCloudRun).toHaveBeenCalledWith(
      "https://tts-stt.a.run.app",
      expect.any(Buffer),
      "en",
      "a".repeat(600)
    );
  });

  it("throws failed-precondition when neither STT_SERVICE_URL nor TTS_STT_SERVICE_URL is set", async () => {
    vi.stubEnv("STT_SERVICE_URL", "");
    vi.stubEnv("TTS_STT_SERVICE_URL", "");
    await expect(
      transcribeAudioHandler(makeRequest({ audioBase64: "aGVsbG8=" }))
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("prefers STT_SERVICE_URL over TTS_STT_SERVICE_URL when both are set", async () => {
    vi.stubEnv("STT_SERVICE_URL", "https://stt.a.run.app");
    vi.stubEnv("TTS_STT_SERVICE_URL", "https://tts-stt.a.run.app");
    vi.mocked(transcribeViaCloudRun).mockResolvedValue({ text: "hi", language: "en" });

    await transcribeAudioHandler(makeRequest({ audioBase64: "aGVsbG8=", language: "en" }));

    expect(transcribeViaCloudRun).toHaveBeenCalledWith(
      "https://stt.a.run.app",
      expect.any(Buffer),
      "en",
      undefined
    );
  });

  it("falls back to TTS_STT_SERVICE_URL when STT_SERVICE_URL is unset", async () => {
    vi.stubEnv("STT_SERVICE_URL", "");
    vi.stubEnv("TTS_STT_SERVICE_URL", "https://tts-stt.a.run.app");
    vi.mocked(transcribeViaCloudRun).mockResolvedValue({ text: "hi", language: "en" });

    await transcribeAudioHandler(makeRequest({ audioBase64: "aGVsbG8=", language: "en" }));

    expect(transcribeViaCloudRun).toHaveBeenCalledWith(
      "https://tts-stt.a.run.app",
      expect.any(Buffer),
      "en",
      undefined
    );
  });

  it("decodes base64 audio and returns the transcript for a valid request", async () => {
    vi.stubEnv("TTS_STT_SERVICE_URL", "https://tts-stt.a.run.app");
    vi.mocked(transcribeViaCloudRun).mockResolvedValue({ text: "xin chao", language: "vi" });

    const result = await transcribeAudioHandler(
      makeRequest({ audioBase64: Buffer.from("wav-bytes").toString("base64"), language: "vi" })
    );

    expect(transcribeViaCloudRun).toHaveBeenCalledWith(
      "https://tts-stt.a.run.app",
      Buffer.from("wav-bytes"),
      "vi",
      undefined
    );
    expect(result).toEqual({ text: "xin chao", language: "vi" });
  });

  it("forwards an absent language as undefined so the service auto-detects en/vi", async () => {
    vi.stubEnv("TTS_STT_SERVICE_URL", "https://tts-stt.a.run.app");
    vi.mocked(transcribeViaCloudRun).mockResolvedValue({ text: "hi", language: "auto" });

    const result = await transcribeAudioHandler(makeRequest({ audioBase64: "aGVsbG8=" }));

    expect(transcribeViaCloudRun).toHaveBeenCalledWith(
      "https://tts-stt.a.run.app",
      expect.any(Buffer),
      undefined,
      undefined
    );
    expect(result).toEqual({ text: "hi", language: "auto" });
  });
});

describe("transcribeAudio region", () => {
  // Regression test: client (apps/web/src/lib/firebase.ts's
  // getFunctions(app, "asia-southeast1")) and server must agree on region,
  // or an onCall written without an explicit region option silently
  // defaults to us-central1 and becomes unreachable from the client.
  it("is configured for asia-southeast1, matching the client's getFunctions region", () => {
    expect(transcribeAudio.__endpoint.region).toEqual(["asia-southeast1"]);
  });
});
