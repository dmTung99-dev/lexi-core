import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "./firebase";
import { tailByCodePoints } from "./sttPrompt";

// Keep in sync with functions/src/transcribeAudio.ts.
interface TranscribeAudioRequest {
  audioBase64: string;
  language?: "vi" | "en";
  prompt?: string;
}

interface TranscribeAudioResult {
  text: string;
  language: string;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Sends MediaRecorder output (webm/opus or mp4) as-is; faster-whisper
// decodes it via PyAV.
const MAX_PROMPT_CHARS = 600;

export async function transcribeAudio(
  blob: Blob,
  options: { prompt?: string } = {}
): Promise<string> {
  const callable = httpsCallable<TranscribeAudioRequest, TranscribeAudioResult>(
    getFirebaseFunctions(),
    "transcribeAudio"
  );
  const prompt = tailByCodePoints(options.prompt?.trim() ?? "", MAX_PROMPT_CHARS, MAX_PROMPT_CHARS);
  const response = await callable({
    audioBase64: await blobToBase64(blob),
    language: "en",
    ...(prompt ? { prompt } : {}),
  });
  return response.data.text;
}
