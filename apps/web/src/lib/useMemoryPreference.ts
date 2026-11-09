"use client";

import { useState } from "react";
import { useSettingsContext } from "./SettingsContext";

export type MemoryPreferenceField = "memoryInConversation" | "memoryInInterview" | "memoryInPrep";

/** The "Dùng trí nhớ" choice for one start screen, remembered in Settings. A failed save keeps the on-screen value. */
export function useMemoryPreference(field: MemoryPreferenceField): [boolean, (next: boolean) => void] {
  const { settings, save } = useSettingsContext();
  const [local, setLocal] = useState<boolean | null>(null);
  const value = local ?? settings?.[field] ?? true;

  function set(next: boolean) {
    setLocal(next);
    if (settings) void save({ ...settings, [field]: next }).catch(() => {});
  }

  return [value, set];
}
