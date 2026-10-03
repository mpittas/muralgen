/**
 * Domain model. Everything is keyed by string id and designed to map 1:1 onto
 * Firestore documents + Cloud Storage objects when the backend lands:
 *   - `imageId` / `thumbId` / `maskId`  -> Storage object keys
 *   - the rest                          -> document fields
 */

export type ProjectStatus =
  | "draft"
  | "designing"
  | "approved"
  | "painting"
  | "completed";

export interface Project {
  id: string;
  name: string;
  description: string;
  location: string;
  client: string;
  tags: string[];
  status: ProjectStatus;
  notes: string;
  starred: boolean;
  archived: boolean;
  /** Explicit cover override (a composite id). Falls back to best available image. */
  coverCompositeId?: string;
  createdAt: number;
  updatedAt: number;
}

export type WallSurface =
  | "brick"
  | "concrete"
  | "plaster"
  | "metal"
  | "wood"
  | "other";

export interface Wall {
  id: string;
  projectId: string;
  name: string;
  imageId: string;
  thumbId: string;
  /** Natural pixel size of the stored image. */
  width: number;
  height: number;
  /** Real-world size in metres (optional, used for the paint plan). */
  widthM?: number;
  heightM?: number;
  surface: WallSurface;
  notes: string;
  createdAt: number;
}

export type DesignStatus = "pending" | "ready" | "error";

export interface Design {
  id: string;
  projectId: string;
  /** Generation batch (designs created by one "Generate" click share this). */
  batchId: string;
  status: DesignStatus;
  error?: string;
  imageId?: string;
  thumbId?: string;
  width: number;
  height: number;
  prompt: string;
  /** The final prompt sent to the provider (user prompt + style + palette). */
  fullPrompt: string;
  styleId: string;
  paletteId: string;
  providerId: string;
  model: string;
  seed: number;
  wallId?: string;
  /** Display name for uploaded / sample designs (AI designs show their prompt). */
  title?: string;
  favorite: boolean;
  /** The design the user picked to be applied on the wall. One per project. */
  chosen: boolean;
  source: "ai" | "upload" | "sample";
  createdAt: number;
}

export type BlendMode =
  | "source-over"
  | "multiply"
  | "overlay"
  | "soft-light"
  | "hard-light";

export interface Point {
  x: number;
  y: number;
}

/** Corner order: top-left, top-right, bottom-right, bottom-left (normalised 0..1 of the wall). */
export type Quad = [Point, Point, Point, Point];

export interface CompositeSettings {
  quad: Quad;
  opacity: number; // 0..1
  blend: BlendMode;
  /** How much of the wall's own light/texture is mixed back on top. 0..1 */
  texture: number;
  brightness: number; // 1 = neutral
  contrast: number; // 1 = neutral
  saturation: number; // 1 = neutral
  /** Mask feather radius in working-resolution pixels. */
  feather: number;
  /** Fraction (0..0.4) cropped off every side of the design, e.g. to drop AI borders or corner logos. */
  trim: number;
}

export interface Composite {
  id: string;
  projectId: string;
  wallId: string;
  designId: string;
  name: string;
  settings: CompositeSettings;
  /** PNG alpha mask (white = design visible) at working resolution. */
  maskId?: string;
  resultId?: string;
  thumbId?: string;
  createdAt: number;
  updatedAt: number;
}
