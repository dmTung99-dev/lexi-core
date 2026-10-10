import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { transcribeViaCloudRun, toHttpsError } from "./services/cloudRunClient";

export interface TranscribeAudioRequest {
  audioBase64: string;
  language?: "vi" | "en";
  /** Optional context for Whisper's initial_prompt (max 600 chars). */
  prompt?: string;
}

function isTranscribeAudioRequest(data: unknown): data is TranscribeAudioRequest {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.audioBase64 === "string" &&
    d.audioBase64.length > 0 &&
    d.audioBase64.length <= 10_000_000 &&
    (d.language === undefined || d.language === "vi" || d.language === "en") &&
    (d.prompt === undefined || (typeof d.prompt === "string" && d.prompt.length <= 600))
  );
}

export async function transcribeAudioHandler(
  request: CallableRequest<unknown>
): Promise<{ text: string; language: string }> {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  if (!isTranscribeAudioRequest(request.data)) {
    throw new HttpsError(
      "invalid-argument",
      "Expected { audioBase64: string, language?: 'vi'|'en', prompt?: string (<=600 chars) }."
    );
  }
  // Whisper runs on its own Cloud Run service (`stt`, concurrency=1) so it
  // never time-slices a vCPU with Piper TTS. Local dev runs one uvicorn for
  // both, so fall back to the shared URL when STT_SERVICE_URL is unset.
  const serviceUrl = process.env.STT_SERVICE_URL || process.env.TTS_STT_SERVICE_URL || "";
  if (!serviceUrl) {
    throw new HttpsError("failed-precondition", "TTS/STT service URL is not configured.");
  }

  try {
    const audio = Buffer.from(request.data.audioBase64, "base64");
    return await transcribeViaCloudRun(serviceUrl, audio, request.data.language, request.data.prompt);
  } catch (err) {
    throw toHttpsError(err, "Transcription failed. Please try again.");
  }
}

export const transcribeAudio = onCall(
  { region: "asia-southeast1", maxInstances: 10, timeoutSeconds: 60 },
  transcribeAudioHandler
);
