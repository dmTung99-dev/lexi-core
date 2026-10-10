"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getRecordingUrls, hasRecordings } from "@/lib/recordedAudioStore";

export interface PlayMyVoiceButtonProps {
  /** A single recording key (see recordedAudioStore). */
  recordingKey?: string;
  /** Several keys played back to back, in order (missing keys are skipped). */
  recordingKeys?: string[];
  /**
   * Unsent blobs (e.g. the take under review). Object URLs are created at click
   * time and revoked when playback ends, is stopped, fails or the button unmounts.
   * The array identity may change on every render.
   */
  blobs?: Blob[];
  className?: string;
}

/**
 * "Nghe lại giọng tôi": replays the learner's own in-memory recording(s).
 * Renders nothing when there is no recording (typed answer, page reloaded).
 * Best-effort like the app's other audio: a failed play just resets.
 */
export function PlayMyVoiceButton({ recordingKey, recordingKeys, blobs, className = "cv-link" }: PlayMyVoiceButtonProps) {
  const keys = recordingKeys ?? (recordingKey !== undefined ? [recordingKey] : []);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Bumped on every start/stop so callbacks from a superseded run are ignored.
  const runRef = useRef(0);
  // Object URLs this component created itself (blobs mode); revoked in stop().
  const ownedUrlsRef = useRef<string[]>([]);

  const stop = useCallback(() => {
    runRef.current += 1;
    for (const url of ownedUrlsRef.current) URL.revokeObjectURL(url);
    ownedUrlsRef.current = [];
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    }
  }, []);

  useEffect(() => stop, [stop]);

  const useBlobs = blobs !== undefined;
  if (useBlobs ? blobs.length === 0 : !keys.some((k) => hasRecordings(k))) return null;

  function handleClick() {
    if (playing) {
      stop();
      setPlaying(false);
      return;
    }
    if (useBlobs && blobs.length === 0) return;
    if (!useBlobs && !keys.some((k) => hasRecordings(k))) return;
    stop();
    let urls: string[];
    if (useBlobs) {
      urls = blobs.map((b) => URL.createObjectURL(b));
      ownedUrlsRef.current = urls;
    } else {
      urls = keys.flatMap((k) => getRecordingUrls(k));
      if (urls.length === 0) return;
    }
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
