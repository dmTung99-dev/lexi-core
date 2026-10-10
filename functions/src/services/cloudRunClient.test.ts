import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";

const getIdTokenClientMock = vi.fn();

vi.mock("google-auth-library", () => {
  const GoogleAuthClass = class {
    getIdTokenClient: any;
    constructor() {
      this.getIdTokenClient = getIdTokenClientMock;
    }
  };
  return {
    GoogleAuth: GoogleAuthClass,
  };
});

import {
  CloudRunCallError,
  synthesizeViaCloudRun,
  transcribeViaCloudRun,
  toHttpsError,
} from "./cloudRunClient";

afterEach(() => {
  getIdTokenClientMock.mockClear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("synthesizeViaCloudRun", () => {
  it("mints an ID token and returns audio bytes for an https service URL", async () => {
    const requestMock = vi.fn().mockResolvedValue({ data: Buffer.from("wav-bytes") });
    getIdTokenClientMock.mockResolvedValue({ request: requestMock });

    const result = await synthesizeViaCloudRun("https://tts-stt-abc.a.run.app", "xin chao", "vi");

    expect(getIdTokenClientMock).toHaveBeenCalledWith("https://tts-stt-abc.a.run.app");
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://tts-stt-abc.a.run.app/synthesize",
        method: "POST",
        responseType: "arraybuffer",
      })
    );
    expect(result).toEqual(Buffer.from("wav-bytes"));
  });

  it("skips IAM auth for a local http service URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode("wav-bytes").buffer,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await synthesizeViaCloudRun("http://localhost:8080", "xin chao", "vi");

    expect(getIdTokenClientMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/synthesize",
      expect.objectContaining({ method: "POST" })
    );
    expect(Buffer.from(result).toString()).toBe("wav-bytes");
  });

  it("wraps a non-2xx response as CloudRunCallError with status", async () => {
    const requestMock = vi.fn().mockRejectedValue({
      response: { status: 503 },
      message: "Service Unavailable",
    });
    getIdTokenClientMock.mockResolvedValue({ request: requestMock });

    await expect(
      synthesizeViaCloudRun("https://tts-stt-abc.a.run.app", "xin chao", "vi")
    ).rejects.toMatchObject({ status: 503 });
  });
});

describe("transcribeViaCloudRun", () => {
  it("posts audio bytes and returns the transcript JSON", async () => {
    const requestMock = vi.fn().mockResolvedValue({ data: { text: "xin chao", language: "vi" } });
    getIdTokenClientMock.mockResolvedValue({ request: requestMock });

    const result = await transcribeViaCloudRun(
      "https://tts-stt-abc.a.run.app",
      Buffer.from("wav-bytes"),
      "vi"
    );

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://tts-stt-abc.a.run.app/transcribe?language=vi",
        method: "POST",
      })
    );
    expect(result).toEqual({ text: "xin chao", language: "vi" });
  });
});

describe("transcribeViaCloudRun malformed prompt", () => {
  it("strips lone surrogates and still sends the rest of the prompt", async () => {
    const requestMock = vi.fn().mockResolvedValue({ data: { text: "hi", language: "en" } });
    getIdTokenClientMock.mockResolvedValue({ request: requestMock });

    await transcribeViaCloudRun("https://x.a.run.app", Buffer.from("w"), "en", "\uDE00ok \uD83D");

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://x.a.run.app/transcribe?language=en&prompt=ok%20" })
    );
  });

  it("keeps valid emoji intact", async () => {
    const requestMock = vi.fn().mockResolvedValue({ data: { text: "hi", language: "en" } });
    getIdTokenClientMock.mockResolvedValue({ request: requestMock });

    await transcribeViaCloudRun("https://x.a.run.app", Buffer.from("w"), "en", "😀");

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://x.a.run.app/transcribe?language=en&prompt=%F0%9F%98%80",
      })
    );
  });

  it("omits the prompt when nothing is left after cleaning", async () => {
    const requestMock = vi.fn().mockResolvedValue({ data: { text: "hi", language: "en" } });
    getIdTokenClientMock.mockResolvedValue({ request: requestMock });

    await transcribeViaCloudRun("https://x.a.run.app", Buffer.from("w"), "en", "\uDE00");

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://x.a.run.app/transcribe?language=en" })
    );
  });
});

describe("transcribeViaCloudRun prompt", () => {
  it("appends a URL-encoded prompt query param after language", async () => {
    const requestMock = vi.fn().mockResolvedValue({ data: { text: "hi", language: "en" } });
    getIdTokenClientMock.mockResolvedValue({ request: requestMock });

    await transcribeViaCloudRun(
      "https://tts-stt-abc.a.run.app",
      Buffer.from("wav-bytes"),
      "en",
      "Topic: travel & food."
    );

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://tts-stt-abc.a.run.app/transcribe?language=en&prompt=Topic%3A%20travel%20%26%20food.",
      })
    );
  });

  it("sends only the prompt param when there is no language", async () => {
    const requestMock = vi.fn().mockResolvedValue({ data: { text: "hi", language: "auto" } });
    getIdTokenClientMock.mockResolvedValue({ request: requestMock });

    await transcribeViaCloudRun("https://x.a.run.app", Buffer.from("w"), undefined, "hello");

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://x.a.run.app/transcribe?prompt=hello" })
    );
  });

  it("keeps the old URL exactly when the prompt is omitted or empty", async () => {
    const requestMock = vi.fn().mockResolvedValue({ data: { text: "hi", language: "en" } });
    getIdTokenClientMock.mockResolvedValue({ request: requestMock });

    await transcribeViaCloudRun("https://x.a.run.app", Buffer.from("w"), "en");
    await transcribeViaCloudRun("https://x.a.run.app", Buffer.from("w"), "en", "");

    expect(requestMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ url: "https://x.a.run.app/transcribe?language=en" })
    );
    expect(requestMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ url: "https://x.a.run.app/transcribe?language=en" })
    );
  });

  it("sends no query at all when neither language nor prompt is given", async () => {
    const requestMock = vi.fn().mockResolvedValue({ data: { text: "hi", language: "auto" } });
    getIdTokenClientMock.mockResolvedValue({ request: requestMock });

    await transcribeViaCloudRun("https://x.a.run.app", Buffer.from("w"));

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://x.a.run.app/transcribe" })
    );
  });
});

describe("toHttpsError", () => {
  it("passes an existing HttpsError through unchanged", () => {
    const original = new HttpsError("invalid-argument", "bad input");
    expect(toHttpsError(original, "fallback")).toBe(original);
  });

  it("maps a 503/504 CloudRunCallError to 'unavailable'", () => {
    const mapped = toHttpsError(new CloudRunCallError("boom", 503), "fallback");
    expect(mapped.code).toBe("unavailable");
  });

  it("maps any other error to 'internal' with the fallback message", () => {
    const mapped = toHttpsError(new Error("boom"), "fallback message");
    expect(mapped.code).toBe("internal");
    expect(mapped.message).toBe("fallback message");
  });
});
