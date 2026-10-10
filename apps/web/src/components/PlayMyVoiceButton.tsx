"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getRecordingUrls, hasRecordings } from "@/lib/recordedAudioStore";

export interface PlayMyVoiceButtonProps {
  /** A single recording key (see recordedAudioStore). */
  recordingKey?: string;
  /** Several keys played back to back, in order (missing keys are skipped). */
  recordingKeys?: string[];
  className?: string;
}

/**
 * "Nghe lại giọng tôi": replays the learner's own in-memory recording(s).
 * Renders nothing when there is no recording (typed answer, page reloaded).
 * Best-effort like the app's other audio: a failed play just resets.
 */
export function PlayMyVoiceButton({ recordingKey, recordingKeys, className = "cv-link" }: PlayMyVoiceButtonProps) {
  const keys = recordingKeys ?? (recordingKey !== undefined ? [recordingKey] : []);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Bumped on every start/stop so callbacks from a superseded run are ignored.
  const runRef = useRef(0);

  const stop = useCallback(() => {
    runRef.current += 1;
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    }
  }, []);

  useEffect(() => stop, [stop]);

  if (!keys.some((k) => hasRecordings(k))) return null;

  function handleClick() {
    if (playing) {
      stop();
      setPlaying(false);
      return;
    }
    const urls = keys.flatMap((k) => getRecordingUrls(k));
    if (urls.length === 0) return;
    stop();
    const run = runRef.current;
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    const finish = () => {
      if (runRef.current !== run) return;
      stop();
      setPlaying(false);
    };
    const playAt = (i: number) => {
      if (runRef.current !== run) return;
      if (i >= urls.length) {
        finish();
        return;
      }
      audio.onended = () => playAt(i + 1);
      audio.onerror = finish;
      audio.src = urls[i];
      audio.play().catch(finish);
    };
    setPlaying(true);
    playAt(0);
  }

  return (
    <button type="button" className={className} onClick={handleClick}>
      {playing ? "Dừng" : "Nghe lại giọng tôi"}
    </button>
  );
}
