"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { splitSentences } from "./splitSentences";
import { synthesizeSpeech, toAudioDataUrl } from "./synthesizeSpeechClient";
import type { InterviewVoice } from "./interviewTypes";

export interface InterviewAudio {
  speak(text: string): Promise<boolean>;
  prefetch(key: string, text: string): void;
  playPrefetched(key: string, text: string): Promise<boolean>;
  stop(): void;
}

type Clip = Promise<string | null>;

// Every chunk's synthesis starts immediately; playback awaits them in order,
// so chunk 1 plays while later chunks are still synthesizing.
export function useInterviewAudio(voice: InterviewVoice): InterviewAudio {
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prefetchedRef = useRef(new Map<string, Clip[]>());
  const generationRef = useRef(0);
  const cancelCurrentRef = useRef<(() => void) | null>(null);

  const synthesize = useCallback((text: string): Clip[] => {
    return splitSentences(text).map((chunk) =>
      synthesizeSpeech({ text: chunk, language: "en", voice: voiceRef.current })
        .then((r) => toAudioDataUrl(r.audioBase64))
        .catch(() => null)
    );
  }, []);

  const playUrl = useCallback((url: string): Promise<boolean> => {
    audioRef.current ??= new Audio();
    const audio = audioRef.current;
    return new Promise((resolve) => {
      const done = (ok: boolean) => {
        audio.onended = null;
        audio.onerror = null;
        cancelCurrentRef.current = null;
        resolve(ok);
      };
      audio.onended = () => done(true);
      audio.onerror = () => done(false);
      cancelCurrentRef.current = () => done(false);
      audio.src = url;
      audio.play().catch(() => done(false));
    });
  }, []);

  const playClips = useCallback(
    async (clips: Clip[]): Promise<boolean> => {
      // A new play call supersedes whatever is currently playing/pending:
      // force-settle it (resolving its caller's promise with false) before
      // starting anything new, so no in-flight play() is ever left hanging.
      generationRef.current++;
      audioRef.current?.pause();
      cancelCurrentRef.current?.();

      const generation = generationRef.current;
      if (clips.length === 0) return false;
      for (const clip of clips) {
        const url = await clip;
        if (generation !== generationRef.current || !url) return false;
        const ok = await playUrl(url);
        if (!ok || generation !== generationRef.current) return false;
      }
      return true;
    },
    [playUrl]
  );

  const stop = useCallback(() => {
    generationRef.current++;
    audioRef.current?.pause();
    cancelCurrentRef.current?.();
  }, []);

  useEffect(() => stop, [stop]);

  return useMemo(
    () => ({
      speak: (text: string) => playClips(synthesize(text)),
      prefetch: (key: string, text: string) => {
        if (!prefetchedRef.current.has(key)) prefetchedRef.current.set(key, synthesize(text));
      },
      playPrefetched: (key: string, text: string) => {
        const clips = prefetchedRef.current.get(key) ?? synthesize(text);
        prefetchedRef.current.delete(key);
        return playClips(clips);
      },
      stop,
    }),
    [playClips, synthesize, stop]
  );
}
