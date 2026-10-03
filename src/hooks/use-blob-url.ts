"use client";

import { useEffect, useSyncExternalStore } from "react";
import { loadBlobUrl, peekBlobUrl, subscribeBlobUrls } from "@/lib/blob-store";

/** Object URL for an image stored in the blob store (null while loading / when missing). */
export function useBlobUrl(id: string | null | undefined): string | null {
  const url = useSyncExternalStore(
    subscribeBlobUrls,
    () => peekBlobUrl(id),
    () => null,
  );

  useEffect(() => {
    if (id) void loadBlobUrl(id);
  }, [id]);

  return url;
}
