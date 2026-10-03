/**
 * Image-generation provider contract. Adding a provider = implementing this
 * interface and registering it in `./index.ts`. The UI reads everything it needs
 * (limits, models, availability) from here, so no UI changes are required.
 */

export interface ProviderModel {
  id: string;
  label: string;
  description?: string;
}

export type ProviderPhase = "queued" | "generating";

export interface GenerateRequest {
  prompt: string;
  width: number;
  height: number;
  seed: number;
  model?: string;
  signal?: AbortSignal;
  /** Human-readable progress while the provider queues / paints / backs off. */
  onProgress?: (info: { phase: ProviderPhase; message: string }) => void;
}

export interface GenerateResult {
  blob: Blob;
  /** The model that actually produced the image (providers may fall back). */
  model: string;
}

/**
 * Thrown when a provider can't serve requests for a while (quota used up, rate-limited).
 * The queue reacts by moving the job to `fallbackProviderId` instead of showing an error.
 */
export class ProviderUnavailableError extends Error {
  constructor(
    message: string,
    /** How long to avoid this provider before trying it again (ms). */
    readonly retryAfterMs = 30 * 60_000,
  ) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

export interface ImageProvider {
  id: string;
  name: string;
  tagline: string;
  /** Free to use with no account. */
  free: boolean;
  requiresKey: boolean;
  status: "available" | "coming-soon";
  models: ProviderModel[];
  defaultModel: string;
  /** Minimum gap between two request starts (ms), to respect rate limits. */
  minIntervalMs: number;
  maxImagesPerBatch: number;
  /** How many requests may run at once for this provider. */
  maxConcurrent: number;
  /** Largest side we ask the provider for. */
  maxSide: number;
  /** Human-readable limitation shown in the UI. */
  limits?: string;
  /** Rough seconds per image, for the "about N s" hint. */
  typicalSeconds?: number;
  /** Provider to move a job to when this one reports `ProviderUnavailableError`. */
  fallbackProviderId?: string;
  /** Clamp a requested size to something the provider supports. */
  constrainSize(width: number, height: number): { width: number; height: number };
  generate(req: GenerateRequest): Promise<GenerateResult>;
}
