"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_PROVIDER_ID } from "@/lib/providers";

export interface GeneratorDraft {
  prompt: string;
  styleId: string;
  paletteId: string;
  aspectId: string;
  count: number;
  /** null = use the project's first wall; "none" = no reference wall. */
  wallId: string | null;
  providerId: string;
  modelId: string;
}

interface GeneratorState extends GeneratorDraft {
  setDraft: (patch: Partial<GeneratorDraft>) => void;
}

/** Form state for the generator. Persisted so a reload doesn't lose the prompt. */
export const useGeneratorStore = create<GeneratorState>()(
  persist(
    (set) => ({
      prompt: "",
      styleId: "graffiti",
      paletteId: "free",
      aspectId: "wall",
      count: 2,
      wallId: null,
      providerId: DEFAULT_PROVIDER_ID,
      modelId: "",
      setDraft: (patch) => set(patch),
    }),
    {
      name: "muralgen:generator",
      version: 3,
      // Older drafts may point at a provider that no longer exists / was swapped for a better
      // default (Pollinations is parked, FLUX is now the default), so reset the provider fields.
      migrate: (persisted) => {
        const old = (persisted ?? {}) as Partial<GeneratorDraft>;
        return {
          ...old,
          wallId: null,
          modelId: "",
          providerId: DEFAULT_PROVIDER_ID,
        } as GeneratorState;
      },
      partialize: ({ setDraft: _ignored, ...rest }) => {
        void _ignored;
        return rest;
      },
    },
  ),
);
