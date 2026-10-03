"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  /** Optional personal AI Horde key (free account). Empty = anonymous. Stored in this browser only. */
  hordeApiKey: string;
  setHordeApiKey: (key: string) => void;
}

/**
 * Local-only settings. API keys belong server-side; this exists for the
 * frontend-only phase and goes away once the backend holds provider credentials.
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      hordeApiKey: "",
      setHordeApiKey: (hordeApiKey) => set({ hordeApiKey: hordeApiKey.trim() }),
    }),
    {
      name: "muralgen:settings",
      version: 1,
      partialize: (s) => ({ hordeApiKey: s.hordeApiKey }),
    },
  ),
);
