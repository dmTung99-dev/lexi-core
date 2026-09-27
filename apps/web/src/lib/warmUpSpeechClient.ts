import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "./firebase";

// Best-effort wake-up of the TTS/STT Cloud Run services. Never throws.
export async function warmUpSpeech(): Promise<void> {
  try {
    await httpsCallable(getFirebaseFunctions(), "warmUpSpeech")({});
  } catch {
    // ignore — the real calls will simply pay the cold start
  }
}
