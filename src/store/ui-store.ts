"use client";

import { create } from "zustand";

interface UiState {
  newProjectOpen: boolean;
  setNewProjectOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  newProjectOpen: false,
  setNewProjectOpen: (newProjectOpen) => set({ newProjectOpen }),
}));
