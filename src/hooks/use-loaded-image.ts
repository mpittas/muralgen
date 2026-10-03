"use client";

import { useEffect, useState } from "react";
import { loadImage } from "@/lib/image-utils";
import { useBlobUrl } from "@/hooks/use-blob-url";

/** Decoded `HTMLImageElement` for a stored image (null until ready). */
export function useLoadedImage(imageId: string | null | undefined) {
  const url = useBlobUrl(imageId);
  const [loaded, setLoaded] = useState<{ url: string; img: HTMLImageElement } | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    loadImage(url)
      .then((img) => {
        if (!cancelled) setLoaded({ url, img });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { img: loaded && loaded.url === url ? loaded.img : null, url };
}
