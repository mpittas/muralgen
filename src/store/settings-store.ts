"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type OpenAiQuality = "low" | "medium";

interface SettingsState {
  /** Optional personal AI Horde key (free account). Empty = anonymous. Stored in this browser only. */
  hordeApiKey: string;
  setHordeApiKey: (key: string) => void;
  /** OpenAI image quality. `low` is ~10x cheaper than `medium`; the key itself lives server-side. */
  openaiQuality: OpenAiQuality;
  setOpenaiQuality: (quality: OpenAiQuality) => void;
}

/**
 * Per-browser preferences. Provider API keys that bill money (OpenAI) are NOT kept here:
 * they live in a Cloud Function secret (see /functions).
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      hordeApiKey: "",
      setHordeApiKey: (hordeApiKey) => set({ hordeApiKey: hordeApiKey.trim() }),
      openaiQuality: "low",
      setOpenaiQuality: (openaiQuality) => set({ openaiQuality }),
    }),
    {
      name: "muralgen:settings",
      version: 1,
      partialize: (s) => ({ hordeApiKey: s.hordeApiKey, openaiQuality: s.openaiQuality }),
    },
  ),
);
