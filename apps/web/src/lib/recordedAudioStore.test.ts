import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRecordings,
  conversationRecordingKey,
  getRecordingUrls,
  getRecordings,
  hasRecordings,
  interviewRecordingKey,
  saveRecordings,
} from "./recordedAudioStore";

function blob(label: string): Blob {
  return new Blob([label], { type: "audio/webm" });
}

describe("recordedAudioStore", () => {
  let counter = 0;
  const create = vi.fn(() => `blob:url-${++counter}`);
  const revoke = vi.fn();

  beforeEach(() => {
    counter = 0;
    create.mockClear();
    revoke.mockClear();
    URL.createObjectURL = create as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    clearRecordings("");
  });

  it("saves, gets and reports recordings", () => {
    const a = blob("a");
    const b = blob("b");
    expect(hasRecordings("k")).toBe(false);
    expect(getRecordings("k")).toEqual([]);
    saveRecordings("k", [a, b]);
    expect(hasRecordings("k")).toBe(true);
    expect(getRecordings("k")).toEqual([a, b]);
  });

  it("replaces an existing entry", () => {
    const a = blob("a");
    const b = blob("b");
    saveRecordings("k", [a]);
    saveRecordings("k", [b]);
    expect(getRecordings("k")).toEqual([b]);
  });

  it("ignores empty arrays", () => {
    const a = blob("a");
    saveRecordings("k", [a]);
    saveRecordings("k", []);
    expect(getRecordings("k")).toEqual([a]);
    saveRecordings("empty", []);
    expect(hasRecordings("empty")).toBe(false);
  });

  it("does not share the caller's array", () => {
    const list = [blob("a")];
    saveRecordings("k", list);
    list.push(blob("b"));
    expect(getRecordings("k")).toHaveLength(1);
  });

  it("creates and caches one object URL per blob", () => {
    saveRecordings("k", [blob("a"), blob("b")]);
    const first = getRecordingUrls("k");
    const second = getRecordingUrls("k");
    expect(first).toEqual(["blob:url-1", "blob:url-2"]);
    expect(second).toEqual(first);
    expect(create).toHaveBeenCalledTimes(2);
    expect(getRecordingUrls("missing")).toEqual([]);
  });

  it("revokes cached URLs when an entry is replaced", () => {
    saveRecordings("k", [blob("a")]);
    getRecordingUrls("k");
    saveRecordings("k", [blob("b")]);
    expect(revoke).toHaveBeenCalledWith("blob:url-1");
    expect(getRecordingUrls("k")).toEqual(["blob:url-2"]);
  });

  it("builds the conversation and interview keys", () => {
    expect(conversationRecordingKey("s1", 3)).toBe("conversation:s1:3");
    expect(interviewRecordingKey("s1", 0)).toBe("interview:s1:0");
  });

  it("clears by prefix and revokes cached URLs", () => {
    saveRecordings("conversation:s1:1", [blob("a")]);
    saveRecordings("conversation:s1:3", [blob("b")]);
    saveRecordings("conversation:s2:1", [blob("c")]);
    getRecordingUrls("conversation:s1:1");
    getRecordingUrls("conversation:s1:3");
    clearRecordings("conversation:s1:");
    expect(hasRecordings("conversation:s1:1")).toBe(false);
    expect(hasRecordings("conversation:s1:3")).toBe(false);
    expect(hasRecordings("conversation:s2:1")).toBe(true);
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenCalledWith("blob:url-1");
    expect(revoke).toHaveBeenCalledWith("blob:url-2");
  });
});
