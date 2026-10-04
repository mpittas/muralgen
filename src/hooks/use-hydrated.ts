"use client";

import { useSyncStore } from "@/store/sync-store";

/**
 * True once the signed-in user's data has loaded from Firestore (first snapshot of every
 * collection, served from the offline cache or the server). False on the server, during
 * hydration and while loading, so pages render skeletons until then.
 */
export function useHydrated(): boolean {
  return useSyncStore((s) => s.ready);
}
