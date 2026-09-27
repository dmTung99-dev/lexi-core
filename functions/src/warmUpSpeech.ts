import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { pingCloudRun } from "./services/cloudRunClient";

// Best-effort: wakes the TTS and STT Cloud Run services while the user is
// still on the interview Setup screen, so the first real call skips most of
// the cold start. Never fails the caller.
export async function warmUpSpeechHandler(
  request: CallableRequest<unknown>
): Promise<{ ok: true }> {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const urls = new Set(
    [process.env.TTS_STT_SERVICE_URL, process.env.STT_SERVICE_URL].filter(
      (u): u is string => typeof u === "string" && u.length > 0
    )
  );
  await Promise.allSettled([...urls].map((u) => pingCloudRun(u)));
  return { ok: true };
}

export const warmUpSpeech = onCall(
  { region: "asia-southeast1", maxInstances: 10, timeoutSeconds: 60 },
  warmUpSpeechHandler
);
