"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Returns a stable getter for the latest value, for use inside long-lived handlers
 * (rAF callbacks, window listeners, async work) without re-subscribing on every change.
 */
export function useLatest<T>(value: T): () => T {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return useCallback(() => ref.current, []);
}
