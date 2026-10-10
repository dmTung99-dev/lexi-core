import { GoogleAuth } from "google-auth-library";
import { HttpsError } from "firebase-functions/v2/https";

let cachedAuth: GoogleAuth | undefined;

function getAuth(): GoogleAuth {
  return (cachedAuth ??= new GoogleAuth());
}

export class CloudRunCallError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "CloudRunCallError";
  }
}

interface CloudRunRequestOptions {
  path: string;
  body: BodyInit | Record<string, unknown> | Buffer;
  headers: Record<string, string>;
  responseType: "json" | "arraybuffer";
}

async function callCloudRun<T>(serviceUrl: string, options: CloudRunRequestOptions): Promise<T> {
  const url = `${serviceUrl}${options.path}`;
  try {
    if (serviceUrl.startsWith("http://")) {
      // Local dev against `uvicorn app.main:app` — no IAM identity token available there.
      const res = await fetch(url, {
        method: "POST",
        headers: options.headers,
        body: options.body as BodyInit,
      });
      if (!res.ok) {
        throw new CloudRunCallError(`Cloud Run service returned ${res.status}`, res.status);
      }
      return options.responseType === "arraybuffer"
        ? (Buffer.from(await res.arrayBuffer()) as unknown as T)
        : ((await res.json()) as T);
    }

    const client = await getAuth().getIdTokenClient(serviceUrl);
    const res = await client.request<T>({
      url,
      method: "POST",
      data: options.body,
      headers: options.headers,
      responseType: options.responseType,
    });
    return res.data;
  } catch (err) {
    if (err instanceof CloudRunCallError) {
      throw err;
    }
    const status = (err as { response?: { status?: number } })?.response?.status;
    throw new CloudRunCallError(err instanceof Error ? err.message : String(err), status);
  }
}

export async function synthesizeViaCloudRun(
  serviceUrl: string,
  text: string,
  language: "vi" | "en",
  voice?: "male1" | "male2" | "female1" | "female2"
): Promise<Buffer> {
  const data = await callCloudRun<ArrayBuffer | Buffer>(serviceUrl, {
    path: "/synthesize",
    body: JSON.stringify({ text, language, voice }),
    headers: { "Content-Type": "application/json" },
    responseType: "arraybuffer",
  });
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

// Unpaired surrogates make encodeURIComponent throw URIError. Drop them.
function stripLoneSurrogates(text: string): string {
  return text.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    ""
  );
}

function encodePromptParam(prompt: string | undefined): string | undefined {
  if (!prompt) return undefined;
  try {
    const cleaned = stripLoneSurrogates(prompt);
    return cleaned ? `prompt=${encodeURIComponent(cleaned)}` : undefined;
  } catch {
    // A bad hint must never fail the transcription itself.
    return undefined;
  }
}

export async function transcribeViaCloudRun(
  serviceUrl: string,
  audio: Buffer,
  language?: string,
  prompt?: string
): Promise<{ text: string; language: string }> {
  const params: string[] = [];
  if (language) params.push(`language=${encodeURIComponent(language)}`);
  const promptParam = encodePromptParam(prompt);
  if (promptParam) params.push(promptParam);
  const query = params.length > 0 ? `?${params.join("&")}` : "";
  return callCloudRun<{ text: string; language: string }>(serviceUrl, {
    path: `/transcribe${query}`,
    body: audio,
    headers: { "Content-Type": "audio/wav" },
    responseType: "json",
  });
}

export function toHttpsError(err: unknown, fallbackMessage: string): HttpsError {
  if (err instanceof HttpsError) {
    return err;
  }
  if (err instanceof CloudRunCallError && (err.status === 503 || err.status === 504)) {
    return new HttpsError(
      "unavailable",
      "TTS/STT service is warming up or busy. Try again in a moment."
    );
  }
  return new HttpsError("internal", fallbackMessage);
}

// GET /health — used only to wake a scaled-to-zero service. Same IAM
// ID-token path as callCloudRun (which only POSTs).
export async function pingCloudRun(serviceUrl: string): Promise<void> {
  const url = `${serviceUrl}/health`;
  if (serviceUrl.startsWith("http://")) {
    await fetch(url);
    return;
  }
  const client = await getAuth().getIdTokenClient(serviceUrl);
  await client.request({ url, method: "GET" });
}
