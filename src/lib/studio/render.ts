import { createCanvas } from "@/lib/image-utils";
import type { CompositeSettings, Point, Quad } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

export const DEFAULT_ADJUSTMENTS = {
  opacity: 1,
  blend: "source-over" as const,
  texture: 0.45,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  feather: 3,
  trim: 0,
};

/** Centre the design on the wall at ~80% of the wall width, preserving the design's aspect. */
export function defaultQuad(wallAspect: number, designAspect: number): Quad {
  // Work in normalised wall space (x: 0..1 of width, y: 0..1 of height).
  let w = 0.8;
  let h = (w * wallAspect) / designAspect;
  if (h > 0.8) {
    h = 0.8;
    w = (h * designAspect) / wallAspect;
  }
  const x0 = (1 - w) / 2;
  const y0 = (1 - h) / 2;
  return [
    { x: x0, y: y0 },
    { x: x0 + w, y: y0 },
    { x: x0 + w, y: y0 + h },
    { x: x0, y: y0 + h },
  ];
}

export function fullWallQuad(): Quad {
  return [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
}

export function defaultSettings(
  wallAspect: number,
  designAspect: number,
): CompositeSettings {
  return { quad: defaultQuad(wallAspect, designAspect), ...DEFAULT_ADJUSTMENTS };
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

type Mat3 = [number, number, number, number, number, number, number, number];

/** Projective map from the unit square to an arbitrary quad (Heckbert). */
function squareToQuad(q: Point[]): Mat3 {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    return [p1.x - p0.x, p3.x - p0.x, p0.x, p1.y - p0.y, p3.y - p0.y, p0.y, 0, 0];
  }
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const h = (dx1 * dy3 - dx3 * dy1) / det;
  return [
    p1.x - p0.x + g * p1.x,
    p3.x - p0.x + h * p3.x,
    p0.x,
    p1.y - p0.y + g * p1.y,
    p3.y - p0.y + h * p3.y,
    p0.y,
    g,
    h,
  ];
}

function projectPoint(m: Mat3, u: number, v: number): Point & { w: number } {
  const w = m[6] * u + m[7] * v + 1;
  return {
    x: (m[0] * u + m[1] * v + m[2]) / w,
    y: (m[3] * u + m[4] * v + m[5]) / w,
    w,
  };
}

function bilinear(q: Point[], u: number, v: number): Point {
  const top = { x: q[0].x + (q[1].x - q[0].x) * u, y: q[0].y + (q[1].y - q[0].y) * u };
  const bot = { x: q[3].x + (q[2].x - q[3].x) * u, y: q[3].y + (q[2].y - q[3].y) * u };
  return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v };
}

export function pointInQuad(p: Point, q: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const a = q[i];
    const b = q[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Draws source triangle `s` of `img` onto destination triangle `d` (affine). */
function drawTriangle(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  s: [Point, Point, Point],
  d: [Point, Point, Point],
  bleed: number,
) {
  const [s0, s1, s2] = s;
  const det =
    s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (Math.abs(det) < 1e-9) return;
  const [d0, d1, d2] = d;
  const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / det;
  const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / det;
  const e =
    (d0.x * (s1.x * s2.y - s2.x * s1.y) +
      d1.x * (s2.x * s0.y - s0.x * s2.y) +
      d2.x * (s0.x * s1.y - s1.x * s0.y)) /
    det;
  const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / det;
  const dd = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / det;
  const f =
    (d0.y * (s1.x * s2.y - s2.x * s1.y) +
      d1.y * (s2.x * s0.y - s0.x * s2.y) +
      d2.y * (s0.x * s1.y - s1.x * s0.y)) /
    det;

  // Push the clip triangle outward a hair so neighbouring triangles overlap (no seams).
  const cx = (d0.x + d1.x + d2.x) / 3;
  const cy = (d0.y + d1.y + d2.y) / 3;
  const grow = (p: Point): Point => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * bleed, y: p.y + (dy / len) * bleed };
  };
  const g0 = grow(d0);
  const g1 = grow(d1);
  const g2 = grow(d2);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(g0.x, g0.y);
  ctx.lineTo(g1.x, g1.y);
  ctx.lineTo(g2.x, g2.y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, dd, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/**
 * Perspective-warps `img` (cropped by `trim`, 0..0.4 of each side) into `quad` (pixel coords).
 * `grid` = subdivisions per side: higher is smoother and slower.
 */
export function drawWarped(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement,
  quad: Point[],
  grid = 16,
  trim = 0,
) {
  const iw = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const ih = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  const sx = iw * trim;
  const sy = ih * trim;
  const sw = iw - sx * 2;
  const sh = ih - sy * 2;
  if (sw < 2 || sh < 2) return;

  const H = squareToQuad(quad);
  // A degenerate/concave quad pushes w <= 0 somewhere; fall back to plain bilinear.
  let useProjective = true;
  const pts: Point[][] = [];
  for (let j = 0; j <= grid; j++) {
    const row: Point[] = [];
    for (let i = 0; i <= grid; i++) {
      const p = projectPoint(H, i / grid, j / grid);
      if (!(p.w > 0.02) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        useProjective = false;
      }
      row.push(p);
    }
    pts.push(row);
  }
  if (!useProjective) {
    for (let j = 0; j <= grid; j++) {
      for (let i = 0; i <= grid; i++) pts[j][i] = bilinear(quad, i / grid, j / grid);
    }
  }

  const src = (i: number, j: number): Point => ({
    x: sx + (i / grid) * sw,
    y: sy + (j / grid) * sh,
  });
  const bleed = 0.7;
  for (let j = 0; j < grid; j++) {
    for (let i = 0; i < grid; i++) {
      drawTriangle(
        ctx,
        img,
        [src(i, j), src(i + 1, j), src(i, j + 1)],
        [pts[j][i], pts[j][i + 1], pts[j + 1][i]],
        bleed,
      );
      drawTriangle(
        ctx,
        img,
        [src(i + 1, j), src(i + 1, j + 1), src(i, j + 1)],
        [pts[j][i + 1], pts[j + 1][i + 1], pts[j + 1][i]],
        bleed,
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Compositor                                                          */
/* ------------------------------------------------------------------ */

export interface RenderParams {
  wall: HTMLImageElement | HTMLCanvasElement;
  design: HTMLImageElement | HTMLCanvasElement;
  mask: HTMLCanvasElement | null;
  settings: CompositeSettings;
  /** Subdivisions for the warp (lower while dragging). */
  grid?: number;
  /** Skip the design entirely (shows the untouched wall). */
  original?: boolean;
}

const BLEND_TO_CANVAS: Record<string, GlobalCompositeOperation> = {
  "source-over": "source-over",
  multiply: "multiply",
  overlay: "overlay",
  "soft-light": "soft-light",
  "hard-light": "hard-light",
};

/**
 * Owns the scratch canvases so interactive rendering doesn't allocate every frame.
 *
 *   wall ──────────────────────────────────────────────▶ output
 *   design ─warp─▶ layer ─colour─▶ ─mask(feather)─▶ layer ─blend/opacity─▶ output
 *   wall(grey,contrast) ─clipped to layer─▶ ─soft-light × texture─────────▶ output
 */
export class Compositor {
  private layer = createCanvas(1, 1);
  private tmp = createCanvas(1, 1);

  private size(c: HTMLCanvasElement, w: number, h: number) {
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
  }

  render(target: HTMLCanvasElement, p: RenderParams): void {
    const W = target.width;
    const H = target.height;
    const ctx = target.getContext("2d")!;
    const s = p.settings;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.filter = "none";
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(p.wall, 0, 0, W, H);
    if (p.original) {
      ctx.restore();
      return;
    }

    this.size(this.layer, W, H);
    this.size(this.tmp, W, H);
    const lctx = this.layer.getContext("2d")!;
    const tctx = this.tmp.getContext("2d")!;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = "source-over";
    lctx.filter = "none";
    lctx.clearRect(0, 0, W, H);

    // 1. Warp the artwork into the quad.
    const quadPx = s.quad.map((q) => ({ x: q.x * W, y: q.y * H }));
    drawWarped(lctx, p.design, quadPx, p.grid ?? 18, s.trim);

    // 2. Colour adjustments.
    const filters: string[] = [];
    if (Math.abs(s.brightness - 1) > 0.005) filters.push(`brightness(${s.brightness})`);
    if (Math.abs(s.contrast - 1) > 0.005) filters.push(`contrast(${s.contrast})`);
    if (Math.abs(s.saturation - 1) > 0.005) filters.push(`saturate(${s.saturation})`);
    if (filters.length) {
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      tctx.globalCompositeOperation = "source-over";
      tctx.clearRect(0, 0, W, H);
      tctx.filter = filters.join(" ");
      tctx.drawImage(this.layer, 0, 0);
      tctx.filter = "none";
      lctx.clearRect(0, 0, W, H);
      lctx.drawImage(this.tmp, 0, 0);
    }

    // 3. Hand-painted mask (+ feather).
    if (p.mask) {
      lctx.globalCompositeOperation = "destination-in";
      const blur = s.feather * (W / p.mask.width);
      if (blur > 0.2) lctx.filter = `blur(${blur}px)`;
      lctx.drawImage(p.mask, 0, 0, W, H);
      lctx.filter = "none";
      lctx.globalCompositeOperation = "source-over";
    }

    // 4. Blend the artwork onto the wall.
    ctx.globalAlpha = s.opacity;
    ctx.globalCompositeOperation = BLEND_TO_CANVAS[s.blend] ?? "source-over";
    ctx.drawImage(this.layer, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // 5. Put the wall's own light / texture back on top of the paint.
    if (s.texture > 0.01) {
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      tctx.globalCompositeOperation = "source-over";
      tctx.clearRect(0, 0, W, H);
      tctx.filter = "grayscale(1) contrast(1.5)";
      tctx.drawImage(p.wall, 0, 0, W, H);
      tctx.filter = "none";
      tctx.globalCompositeOperation = "destination-in";
      tctx.drawImage(this.layer, 0, 0);
      tctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = Math.min(1, s.texture * s.opacity * 1.4);
      ctx.globalCompositeOperation = "soft-light";
      ctx.drawImage(this.tmp, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* Mask helpers (mask = canvas whose ALPHA channel is the visibility)  */
/* ------------------------------------------------------------------ */

export function createMask(width: number, height: number): HTMLCanvasElement {
  const c = createCanvas(width, height);
  resetMask(c);
  return c;
}

export function resetMask(mask: HTMLCanvasElement) {
  const ctx = mask.getContext("2d")!;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, mask.width, mask.height);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, mask.width, mask.height);
}

export type BrushMode = "hide" | "show";

/** One soft round dab. `radius` in mask pixels, `hardness` 0..1. */
function stamp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  hardness: number,
  mode: BrushMode,
) {
  ctx.globalCompositeOperation = mode === "hide" ? "destination-out" : "source-over";
  if (hardness >= 0.98) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const g = ctx.createRadialGradient(x, y, radius * hardness, x, y, radius);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** Paints a stroke segment by stamping dabs along it. */
export function paintSegment(
  mask: HTMLCanvasElement,
  from: Point,
  to: Point,
  size: number,
  hardness: number,
  mode: BrushMode,
) {
  const ctx = mask.getContext("2d")!;
  const radius = size / 2;
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const spacing = Math.max(1, radius * 0.18);
  const steps = Math.max(1, Math.ceil(dist / spacing));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    stamp(ctx, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, radius, hardness, mode);
  }
  ctx.globalCompositeOperation = "source-over";
}

export function paintDot(
  mask: HTMLCanvasElement,
  at: Point,
  size: number,
  hardness: number,
  mode: BrushMode,
) {
  const ctx = mask.getContext("2d")!;
  stamp(ctx, at.x, at.y, size / 2, hardness, mode);
  ctx.globalCompositeOperation = "source-over";
}

export function fillPolygon(mask: HTMLCanvasElement, points: Point[], mode: BrushMode) {
  if (points.length < 3) return;
  const ctx = mask.getContext("2d")!;
  ctx.globalCompositeOperation = mode === "hide" ? "destination-out" : "source-over";
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

export function invertMask(mask: HTMLCanvasElement) {
  const ctx = mask.getContext("2d")!;
  const img = ctx.getImageData(0, 0, mask.width, mask.height);
  for (let i = 3; i < img.data.length; i += 4) {
    img.data[i] = 255 - img.data[i];
    img.data[i - 1] = 255;
    img.data[i - 2] = 255;
    img.data[i - 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** Alpha-only snapshot (1 byte / px) used by undo/redo. */
export function snapshotMask(mask: HTMLCanvasElement): Uint8Array {
  const ctx = mask.getContext("2d")!;
  const { data } = ctx.getImageData(0, 0, mask.width, mask.height);
  const out = new Uint8Array(mask.width * mask.height);
  for (let i = 0, j = 3; i < out.length; i++, j += 4) out[i] = data[j];
  return out;
}

export function restoreMask(mask: HTMLCanvasElement, alpha: Uint8Array) {
  const ctx = mask.getContext("2d")!;
  const img = ctx.createImageData(mask.width, mask.height);
  for (let i = 0, j = 0; i < alpha.length; i++, j += 4) {
    img.data[j] = 255;
    img.data[j + 1] = 255;
    img.data[j + 2] = 255;
    img.data[j + 3] = alpha[i];
  }
  ctx.putImageData(img, 0, 0);
}
