import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMemoryPreference } from "./useMemoryPreference";
import { useSettingsContext } from "./SettingsContext";
import { DEFAULT_SETTINGS } from "./settings";

vi.mock("./SettingsContext", () => ({ useSettingsContext: vi.fn() }));

const save = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  save.mockResolvedValue(undefined);
});

describe("useMemoryPreference", () => {
  it("reads the stored value and defaults to true without settings", () => {
    vi.mocked(useSettingsContext).mockReturnValue({ settings: { ...DEFAULT_SETTINGS, memoryInPrep: false }, loading: false, error: null, save });
    expect(renderHook(() => useMemoryPreference("memoryInPrep")).result.current[0]).toBe(false);
    vi.mocked(useSettingsContext).mockReturnValue({ settings: null, loading: true, error: null, save });
    expect(renderHook(() => useMemoryPreference("memoryInPrep")).result.current[0]).toBe(true);
  });

  it("shows the new value at once and saves it", () => {
    vi.mocked(useSettingsContext).mockReturnValue({ settings: DEFAULT_SETTINGS, loading: false, error: null, save });
    const { result } = renderHook(() => useMemoryPreference("memoryInConversation"));
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(save).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, memoryInConversation: false });
  });

  it("keeps the on-screen value when saving fails", async () => {
    save.mockRejectedValueOnce(new Error("offline"));
    vi.mocked(useSettingsContext).mockReturnValue({ settings: DEFAULT_SETTINGS, loading: false, error: null, save });
    const { result } = renderHook(() => useMemoryPreference("memoryInInterview"));
    await act(async () => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });

  it("never saves while settings are still loading, but updates the value", () => {
    vi.mocked(useSettingsContext).mockReturnValue({ settings: DEFAULT_SETTINGS, loading: true, error: null, save });
    const { result } = renderHook(() => useMemoryPreference("memoryInPrep"));
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it("never saves after a failed settings load, but updates the value", () => {
    vi.mocked(useSettingsContext).mockReturnValue({ settings: DEFAULT_SETTINGS, loading: false, error: "x", save });
    const { result } = renderHook(() => useMemoryPreference("memoryInPrep"));
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
});
