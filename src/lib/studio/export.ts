"use client";

import { getBlob } from "@/lib/blob-store";
import { canvasToBlob, createCanvas, fitWithin, loadImage } from "@/lib/image-utils";
import type { Composite, Design, Wall } from "@/lib/types";
import { Compositor } from "./render";

async function requireImage(id: string | undefined, what: string) {
  const blob = id ? await getBlob(id) : undefined;
  if (!blob) throw new Error(`The ${what} image is missing from local storage.`);
  return loadImage(blob);
}

/** Re-renders a saved composite from its stored assets (used for downloads). */
export async function renderCompositeBlob(
  composite: Composite,
  wall: Wall,
  design: Design,
  opts: { maxSide?: number; type?: "image/png" | "image/jpeg" } = {},
): Promise<Blob> {
  const [wallImg, designImg] = await Promise.all([
    requireImage(wall.imageId, "wall"),
    requireImage(design.imageId, "design"),
  ]);

  let mask: HTMLCanvasElement | null = null;
  if (composite.maskId) {
    const maskBlob = await getBlob(composite.maskId);
    if (maskBlob) {
      const maskImg = await loadImage(maskBlob);
      mask = createCanvas(maskImg.naturalWidth, maskImg.naturalHeight);
      mask.getContext("2d")!.drawImage(maskImg, 0, 0);
    }
  }

  const { width, height } = fitWithin(
    wallImg.naturalWidth,
    wallImg.naturalHeight,
    opts.maxSide ?? 4096,
  );
  const out = createCanvas(width, height);
  new Compositor().render(out, {
    wall: wallImg,
    design: designImg,
    mask,
    settings: composite.settings,
    grid: 28,
  });
  return canvasToBlob(out, opts.type ?? "image/png", 0.95);
}
