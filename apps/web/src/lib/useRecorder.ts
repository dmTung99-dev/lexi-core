"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface RecordedAudio {
  blob: Blob;
  seconds: number;
}

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<"denied" | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);
  // Bumped by cancel() so a start() whose getUserMedia() was still pending
  // when Skip/Replay/End cancelled it can tell, once the prompt resolves,
  // that it is orphaned — it must release the stream it just got instead of
  // handing it to whatever start() (if any) runs next.
  const startGenRef = useRef(0);

  const release = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    busyRef.current = false;
    setRecording(false);
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    // Prevent concurrent starts
    if (busyRef.current) return false;
    busyRef.current = true;
    const gen = startGenRef.current;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      busyRef.current = false;
      setError("denied");
      return false;
    }
    if (gen !== startGenRef.current) {
      // cancel() ran while getUserMedia() was pending — this stream is
      // orphaned (the caller moved on without us); release it and leave
      // busyRef/streamRef alone in case a newer start() is already running.
      stream.getTracks().forEach((t) => t.stop());
      busyRef.current = false;
      return false;
    }
    try {
      setError(null);
      const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.start();
      startedAtRef.current = Date.now();
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 250);
      setRecording(true);
      return true;
    } catch {
      // Release stream if recorder setup fails
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
      busyRef.current = false;
      return false;
    }
  }, []);

  const stop = useCallback((): Promise<RecordedAudio | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return Promise.resolve(null);
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const seconds = Math.round((Date.now() - startedAtRef.current) / 1000);
        release();
        resolve({ blob, seconds });
      };
      recorder.stop();
    });
  }, [release]);

  const cancel = useCallback(() => {
    startGenRef.current++;
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        // already stopped
      }
    }
    release();
  }, [release]);

  useEffect(() => cancel, [cancel]);

  return { recording, elapsed, error, start, stop, cancel };
}
