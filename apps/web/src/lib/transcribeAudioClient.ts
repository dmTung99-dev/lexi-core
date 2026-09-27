import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "./firebase";

// Keep in sync with functions/src/transcribeAudio.ts.
interface TranscribeAudioRequest {
  audioBase64: string;
  language?: "vi" | "en";
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
export async function transcribeAudio(blob: Blob): Promise<string> {
  const callable = httpsCallable<TranscribeAudioRequest, TranscribeAudioResult>(
    getFirebaseFunctions(),
    "transcribeAudio"
  );
  const response = await callable({ audioBase64: await blobToBase64(blob), language: "en" });
  return response.data.text;
}
