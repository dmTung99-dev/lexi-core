/**
 * In-memory store of the learner's own voice recordings, keyed by
 * `conversation:<sessionId>:<messageIndex>` / `interview:<sessionId>:<turnIndex>`.
 *
 * Deliberately module-level (survives client-side navigation from a session
 * page to its report page) and deliberately NOT persisted: recordings live
 * only for the lifetime of the tab and are lost on reload. No browser globals
 * are touched at import time, so this is safe to import during SSR.
 */

interface Entry {
  blobs: Blob[];
  urls: (string | undefined)[];
}

const entries = new Map<string, Entry>();

/** Key of a user message's recording (index into session.messages). */
export function conversationRecordingKey(sessionId: string, messageIndex: number): string {
  return `conversation:${sessionId}:${messageIndex}`;
}

/** Key of an answered turn's recording (index into session.turns). */
export function interviewRecordingKey(sessionId: string, turnIndex: number): string {
  return `interview:${sessionId}:${turnIndex}`;
}

function revokeEntry(entry: Entry): void {
  for (const url of entry.urls) {
    if (url) URL.revokeObjectURL(url);
  }
}

export function saveRecordings(key: string, blobs: Blob[]): void {
  if (blobs.length === 0) return;
  const existing = entries.get(key);
  if (existing) revokeEntry(existing);
  entries.set(key, { blobs: [...blobs], urls: [] });
}

export function getRecordings(key: string): Blob[] {
  return [...(entries.get(key)?.blobs ?? [])];
}

export function hasRecordings(key: string): boolean {
  return (entries.get(key)?.blobs.length ?? 0) > 0;
}

/** Lazily creates (and caches) one object URL per blob. */
export function getRecordingUrls(key: string): string[] {
  const entry = entries.get(key);
  if (!entry) return [];
  return entry.blobs.map((blob, i) => {
    let url = entry.urls[i];
    if (!url) {
      url = URL.createObjectURL(blob);
      entry.urls[i] = url;
    }
    return url;
  });
}

/** Drops every entry whose key starts with `prefix` ("" clears all). */
export function clearRecordings(prefix: string): void {
  for (const [key, entry] of [...entries]) {
    if (!key.startsWith(prefix)) continue;
    revokeEntry(entry);
    entries.delete(key);
  }
}
