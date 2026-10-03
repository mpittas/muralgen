"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * False on the server and during hydration, true afterwards. The data layer lives in
 * the browser (localStorage / IndexedDB) so pages render skeletons until this flips.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
