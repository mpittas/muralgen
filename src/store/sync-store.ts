"use client";

import { create } from "zustand";

/** Ephemeral state of the Firestore / Storage sync, shown in the UI. */
interface SyncState {
  /** True once the first snapshot of every collection has arrived (cache or server). */
  ready: boolean;
  /** Fatal-ish sync problem (e.g. rules or permissions), shown to the user. */
  error: string | null;
  /** Images saved locally that haven't finished uploading to Cloud Storage yet. */
  pendingUploads: number;
  /** Last upload failure, if any (e.g. Storage not enabled). */
  uploadError: string | null;
  patch: (patch: Partial<Omit<SyncState, "patch">>) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  ready: false,
  error: null,
  pendingUploads: 0,
  uploadError: null,
  patch: (patch) => set(patch),
}));
