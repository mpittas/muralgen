"use client";

/** Browser-side image helpers: decoding, thumbnails, palette extraction, sample art. */

export function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type = "image/jpeg",
  quality = 0.92,
): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode image"))),
      type,
      quality,
    );
  });
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  return c;
}

export function fitWithin(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number; scale: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

export async function loadImage(src: Blob | string): Promise<HTMLImageElement> {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  try {
    const img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    if (typeof src !== "string") {
      // Safe to revoke after decode(): the bitmap is already in memory.
      URL.revokeObjectURL(url);
    }
  }
}

export async function makeThumb(
  source: CanvasImageSource & { width?: number; height?: number },
  sourceWidth: number,
  sourceHeight: number,
  maxSide = 640,
): Promise<Blob> {
  const { width, height } = fitWithin(sourceWidth, sourceHeight, maxSide);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  return canvasToBlob(canvas, "image/jpeg", 0.82);
}

export interface PreparedImage {
  blob: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

/**
 * Decodes an uploaded file (honouring EXIF orientation), downsizes anything
 * above `maxSide` and produces a thumbnail.
 */
export async function prepareUpload(
  file: Blob,
  maxSide = 4096,
): Promise<PreparedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This file couldn't be read as an image.");
  }
  try {
    const { width, height, scale } = fitWithin(bitmap.width, bitmap.height, maxSide);
    const keepOriginal =
      scale === 1 && /^image\/(jpeg|png|webp)$/.test(file.type) && file.size < 8_000_000;
    let blob: Blob = file;
    if (!keepOriginal) {
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, width, height);
      blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
    }
    const thumb = await makeThumb(bitmap, bitmap.width, bitmap.height);
    return { blob, thumb, width, height };
  } finally {
    bitmap.close();
  }
}

export async function prepareFromCanvas(
  canvas: HTMLCanvasElement,
  type: "image/jpeg" | "image/png" = "image/jpeg",
): Promise<PreparedImage> {
  const blob = await canvasToBlob(canvas, type, 0.92);
  const thumb = await makeThumb(canvas, canvas.width, canvas.height);
  return { blob, thumb, width: canvas.width, height: canvas.height };
}

/* ------------------------------------------------------------------ */
/* Palette extraction                                                  */
/* ------------------------------------------------------------------ */

export interface PaletteColor {
  hex: string;
  /** Share of pixels (0..1) that are closest to this colour. */
  share: number;
}

const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/** Picks the dominant, visually distinct colours of an image. */
export async function extractPalette(
  blob: Blob,
  count = 6,
): Promise<PaletteColor[]> {
  const img = await loadImage(blob);
  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, 96);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  // 1. Histogram on a 16-levels-per-channel grid.
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bin.n++;
    bin.r += data[i];
    bin.g += data[i + 1];
    bin.b += data[i + 2];
    bins.set(key, bin);
  }
  const sorted = [...bins.values()]
    .map((b) => ({ n: b.n, r: b.r / b.n, g: b.g / b.n, b: b.b / b.n }))
    .sort((a, b) => b.n - a.n);

  // 2. Greedily keep the most common bins that are far enough from the ones already kept.
  const chosen: { r: number; g: number; b: number }[] = [];
  const minDist = 52;
  for (const c of sorted) {
    if (chosen.length >= count) break;
    const far = chosen.every(
      (k) => Math.hypot(k.r - c.r, k.g - c.g, k.b - c.b) >= minDist,
    );
    if (far) chosen.push(c);
  }
  if (chosen.length === 0) return [];

  // 3. Assign every pixel to its nearest chosen colour to compute coverage.
  const counts = new Array<number>(chosen.length).fill(0);
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < chosen.length; k++) {
      const d =
        (chosen[k].r - data[i]) ** 2 +
        (chosen[k].g - data[i + 1]) ** 2 +
        (chosen[k].b - data[i + 2]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    counts[best]++;
    total++;
  }
  return chosen
    .map((c, i) => ({ hex: toHex(c.r, c.g, c.b), share: counts[i] / Math.max(1, total) }))
    .sort((a, b) => b.share - a.share);
}

/* ------------------------------------------------------------------ */
/* Procedural sample art (so the app is explorable without any photos) */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A brick wall with a window and a drainpipe to practise masking around. */
export function renderSampleWall(width = 1600, height = 1000): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  const rnd = mulberry32(42);

  const horizon = height * 0.9;
  ctx.fillStyle = "#6e5a4c";
  ctx.fillRect(0, 0, width, height);

  const brickH = 34;
  const brickW = 104;
  const gap = 5;
  for (let row = 0, y = 0; y < horizon; row++, y += brickH + gap) {
    const offset = row % 2 ? brickW / 2 : 0;
    for (let x = -offset; x < width; x += brickW + gap) {
      const tone = rnd();
      const r = 150 + tone * 50 - row * 0.2;
      const g = 78 + tone * 30;
      const b = 58 + tone * 24;
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      ctx.fillRect(x, y, brickW, Math.min(brickH, horizon - y));
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(x, y, brickW, 3);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(x, y + brickH - 3, brickW, 3);
    }
  }

  // Window
  const wx = width * 0.64;
  const wy = height * 0.12;
  const ww = width * 0.15;
  const wh = height * 0.34;
  ctx.fillStyle = "#d9d3c7";
  ctx.fillRect(wx - 14, wy - 14, ww + 28, wh + 28);
  ctx.fillStyle = "#1c2733";
  ctx.fillRect(wx, wy, ww, wh);
  const sky = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
  sky.addColorStop(0, "rgba(120,160,200,0.35)");
  sky.addColorStop(1, "rgba(20,30,50,0)");
  ctx.fillStyle = sky;
  ctx.fillRect(wx, wy, ww, wh);
  ctx.fillStyle = "#d9d3c7";
  ctx.fillRect(wx + ww / 2 - 4, wy, 8, wh);
  ctx.fillRect(wx, wy + wh / 2 - 4, ww, 8);

  // Drainpipe
  const px = width * 0.09;
  const pipe = ctx.createLinearGradient(px, 0, px + 26, 0);
  pipe.addColorStop(0, "#4b4f55");
  pipe.addColorStop(0.45, "#9aa0a8");
  pipe.addColorStop(1, "#3c4046");
  ctx.fillStyle = pipe;
  ctx.fillRect(px, 0, 26, horizon);
  ctx.fillStyle = "#33373c";
  for (let y = 120; y < horizon; y += 260) ctx.fillRect(px - 5, y, 36, 10);

  // Pavement
  const ground = ctx.createLinearGradient(0, horizon, 0, height);
  ground.addColorStop(0, "#5d5a57");
  ground.addColorStop(1, "#3d3b39");
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, width, height - horizon);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, horizon, width, 6);

  // Grain + lighting falloff
  const img = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 16;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  const light = ctx.createRadialGradient(
    width * 0.35,
    height * 0.3,
    width * 0.1,
    width * 0.5,
    height * 0.5,
    width * 0.85,
  );
  light.addColorStop(0, "rgba(255,244,220,0.18)");
  light.addColorStop(1, "rgba(0,0,0,0.38)");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

const SAMPLE_PALETTES = [
  ["#ff3d81", "#ffb400", "#14d0c4", "#5b3df5", "#101010"],
  ["#ff6b35", "#f7c59f", "#2ec4b6", "#1a1a2e", "#e71d36"],
];

/** Bold pop-art style placeholder artwork. */
export function renderSampleDesign(
  variant = 0,
  width = 1536,
  height = 960,
): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  const pal = SAMPLE_PALETTES[variant % SAMPLE_PALETTES.length];
  const rnd = mulberry32(7 + variant * 31);

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, pal[3]);
  bg.addColorStop(1, pal[0]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Sunburst
  ctx.save();
  ctx.translate(width * 0.5, height * 0.62);
  for (let i = 0; i < 28; i++) {
    ctx.rotate((Math.PI * 2) / 28);
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(width, -60);
    ctx.lineTo(width, 60);
    ctx.fill();
  }
  ctx.restore();

  // Blobs
  for (let i = 0; i < 16; i++) {
    const x = rnd() * width;
    const y = rnd() * height;
    const r = 40 + rnd() * 150;
    ctx.fillStyle = pal[(i + 1) % 3] + "cc";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = pal[4];
    ctx.stroke();
  }

  // Waves
  for (let w = 0; w < 5; w++) {
    ctx.beginPath();
    const base = height * (0.66 + w * 0.07);
    ctx.moveTo(0, height);
    for (let x = 0; x <= width; x += 16) {
      ctx.lineTo(x, base + Math.sin(x / 90 + w + variant) * 22);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = pal[(w + 2) % 4];
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = pal[4];
    ctx.stroke();
  }

  // Lettering
  const word = variant % 2 === 0 ? "MURAL" : "PAINT";
  const fontSize = Math.min(width / 3.2, height * 0.46);
  ctx.font = `900 ${fontSize}px "Arial Black", Impact, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const tx = width / 2;
  const ty = height * 0.42;
  for (let d = 18; d > 0; d -= 3) {
    ctx.fillStyle = pal[4];
    ctx.fillText(word, tx + d, ty + d);
  }
  ctx.lineWidth = 26;
  ctx.strokeStyle = pal[4];
  ctx.strokeText(word, tx, ty);
  const fill = ctx.createLinearGradient(0, ty - fontSize / 2, 0, ty + fontSize / 2);
  fill.addColorStop(0, "#fff7d1");
  fill.addColorStop(0.5, pal[1]);
  fill.addColorStop(1, pal[2]);
  ctx.fillStyle = fill;
  ctx.fillText(word, tx, ty);

  // Spray speckle
  for (let i = 0; i < 4500; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.25})`;
    ctx.fillRect(rnd() * width, rnd() * height, 2, 2);
  }
  return canvas;
}
