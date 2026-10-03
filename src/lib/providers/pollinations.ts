import type { GenerateRequest, GenerateResult, ImageProvider } from "./types";

const ENDPOINT = "https://image.pollinations.ai/prompt";

/**
 * Pollinations.ai: kept for the backend phase.
 *
 * Findings (Oct 2026): the keyless endpoint answers 200 to plain HTTP clients but returns
 * `403 {"error":"Missing Turnstile token"}` to requests that come from a browser page
 * (a Cloudflare Turnstile bot check). It only works there with a Pollinations API key,
 * which is best held server-side, so it's parked here as "coming soon" until we have a backend.
 * Also: `private=true` / `nologo=true` are paid features, and the free tier stamps a logo.
 */
export const pollinations: ImageProvider = {
  id: "pollinations",
  name: "Pollinations",
  tagline: "Fast Flux/Sana images. Needs an API key from the backend.",
  free: true,
  requiresKey: true,
  status: "coming-soon",
  models: [{ id: "auto", label: "Auto" }],
  defaultModel: "auto",
  minIntervalMs: 16_000,
  maxImagesPerBatch: 4,
  maxConcurrent: 1,
  maxSide: 1280,
  typicalSeconds: 20,
  limits: "Browser requests are bot-checked (Cloudflare Turnstile); enabled once the backend can hold a key.",

  constrainSize(width, height) {
    const max = 1280;
    const min = 384;
    const scale = Math.min(1, max / Math.max(width, height));
    const snap = (v: number) => Math.max(min, Math.min(max, Math.round((v * scale) / 32) * 32));
    return { width: snap(width), height: snap(height) };
  },

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const params = new URLSearchParams({
      width: String(req.width),
      height: String(req.height),
      seed: String(req.seed),
    });
    const res = await fetch(`${ENDPOINT}/${encodeURIComponent(req.prompt)}?${params}`, {
      signal: req.signal,
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}) as { error?: string });
      throw new Error(
        `Pollinations returned ${res.status}${detail?.error ? `: ${detail.error}` : ""}.`,
      );
    }
    return { blob: await res.blob(), model: res.headers.get("x-model-used") ?? "auto" };
  },
};
