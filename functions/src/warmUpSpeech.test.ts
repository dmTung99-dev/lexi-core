import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CallableRequest } from "firebase-functions/v2/https";

vi.mock("./services/cloudRunClient", async () => {
  const actual = await vi.importActual<typeof import("./services/cloudRunClient")>(
    "./services/cloudRunClient"
  );
  return { ...actual, pingCloudRun: vi.fn() };
});

import { pingCloudRun } from "./services/cloudRunClient";
import { warmUpSpeechHandler } from "./warmUpSpeech";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function makeRequest(authed = true): CallableRequest<unknown> {
  return { auth: authed ? { uid: "u1" } : undefined, data: {} } as CallableRequest<unknown>;
}

describe("warmUpSpeechHandler", () => {
  it("throws unauthenticated without auth", async () => {
    await expect(warmUpSpeechHandler(makeRequest(false))).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("pings both distinct service URLs", async () => {
    vi.stubEnv("TTS_STT_SERVICE_URL", "https://tts-stt.a.run.app");
    vi.stubEnv("STT_SERVICE_URL", "https://stt.a.run.app");
    vi.mocked(pingCloudRun).mockResolvedValue(undefined);

    await expect(warmUpSpeechHandler(makeRequest())).resolves.toEqual({ ok: true });

    expect(pingCloudRun).toHaveBeenCalledTimes(2);
    expect(pingCloudRun).toHaveBeenCalledWith("https://tts-stt.a.run.app");
    expect(pingCloudRun).toHaveBeenCalledWith("https://stt.a.run.app");
  });

  it("pings once when STT_SERVICE_URL is unset", async () => {
    vi.stubEnv("TTS_STT_SERVICE_URL", "https://tts-stt.a.run.app");
    vi.stubEnv("STT_SERVICE_URL", "");
    vi.mocked(pingCloudRun).mockResolvedValue(undefined);

    await warmUpSpeechHandler(makeRequest());

    expect(pingCloudRun).toHaveBeenCalledTimes(1);
  });

  it("still returns ok when a ping fails", async () => {
    vi.stubEnv("TTS_STT_SERVICE_URL", "https://tts-stt.a.run.app");
    vi.stubEnv("STT_SERVICE_URL", "https://stt.a.run.app");
    vi.mocked(pingCloudRun)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);

    await expect(warmUpSpeechHandler(makeRequest())).resolves.toEqual({ ok: true });
  });
});
