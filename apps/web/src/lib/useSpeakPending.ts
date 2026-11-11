"use client";

import { useCallback, useState } from "react";
import type { InterviewAudio } from "./useInterviewAudio";

export interface SpeakPending {
  /** Key of the speak call still waiting for TTS (null once audio starts). */
  pendingKey: string | null;
  /** Stops whatever is playing and speaks `text`; `key` (default: `text`)
   * identifies which button shows the loading state. */
  speak(text: string, key?: string): void;
}

/** Wraps `useInterviewAudio` so a speaker button can show a spinner while
 * its audio is being synthesized. Kept outside the audio hook so the audio
 * object's identity stays stable for the session pages' effects. */
export function useSpeakPending(audio: InterviewAudio): SpeakPending {
  const [pending, setPending] = useState<{ key: string; token: object } | null>(null);

  const speak = useCallback(
    (text: string, key: string = text) => {
      // A per-call token, so a superseded call settling late never clears
      // a newer call's spinner (even one for the same key).
      const token = {};
      const clear = () => setPending((p) => (p?.token === token ? null : p));
      setPending({ key, token });
      audio.stop();
      void audio.speak(text, clear).finally(clear);
    },
    [audio]
  );

  return { pendingKey: pending?.key ?? null, speak };
}
