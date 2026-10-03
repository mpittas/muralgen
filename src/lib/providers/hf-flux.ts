import { ProviderUnavailableError } from "./types";
import type { GenerateRequest, GenerateResult, ImageProvider } from "./types";

/**
 * FLUX.1 [schnell] via the official Black Forest Labs demo Space on Hugging Face.
 *
 * It exposes a public Gradio API (the Space's "Use via API" panel), answers CORS for
 * browser origins and needs no key. Verified Oct 2026: ~10 s for 1024×640.
 *
 * It's a shared ZeroGPU demo, so anonymous use is subject to per-IP GPU quotas and the
 * Space can be busy or move. That's fine for the free tier of the frontend phase; the
 * backend phase will add keyed providers and this stays as an option.
 */
const SPACE = "https://black-forest-labs-flux-1-schnell.hf.space";
const API = `${SPACE}/gradio_api`;
const TIMEOUT_MS = 150_000;
const MAX_ATTEMPTS = 2;

interface SseEvent {
  event: string;
  data: string;
}

function parseSse(text: string): SseEvent[] {
  return text
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const event = /^event: ?(.*)$/m.exec(block)?.[1]?.trim() ?? "";
      const data = /^data: ?(.*)$/m.exec(block)?.[1] ?? "";
      return { event, data };
    })
    .filter((e) => e.event);
}

/**
 * Quota problems won't fix themselves in seconds, so retrying is pointless. The Space answers
 * `event: error / data: null` once an anonymous connection has used up its daily ZeroGPU quota
 * (verified Oct 2026), so an empty error counts too. Anything else is worth a retry.
 */
const isQuotaError = (raw: string) => /quota|exceeded|GPU/i.test(raw) || !raw.trim() || raw.trim() === "null";

function friendlyError(raw: string): string {
  let msg = raw;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") msg = parsed;
  } catch {
    /* plain text */
  }
  if (isQuotaError(msg)) {
    return "The free FLUX demo has used up its daily GPU quota for your connection (it allows only a few images a day).";
  }
  return `FLUX demo: ${msg.slice(0, 160)}`;
}

export const hfFlux: ImageProvider = {
  id: "hf-flux",
  name: "FLUX.1 schnell",
  tagline: "Fast, high-quality images. Free, no account or key.",
  free: true,
  requiresKey: false,
  status: "available",
  models: [{ id: "schnell", label: "FLUX.1 [schnell]", description: "4-step, ~10 s" }],
  defaultModel: "schnell",
  minIntervalMs: 800,
  maxImagesPerBatch: 4,
  maxConcurrent: 1,
  maxSide: 1024,
  typicalSeconds: 12,
  fallbackProviderId: "ai-horde",
  limits:
    "Runs on a shared public demo (Hugging Face). It's quick, but it hits a daily GPU quota for your connection after a few images — when that happens, jobs automatically move to AI Horde. Prompts go to that service, never your photos.",

  constrainSize(width, height) {
    const max = 1024;
    const min = 256;
    const scale = Math.min(1, max / Math.max(width, height));
    const snap = (v: number) => Math.max(min, Math.min(max, Math.round((v * scale) / 32) * 32));
    return { width: snap(width), height: snap(height) };
  },

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
    const fail = (err: unknown): never => {
      if (req.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (timeout.aborted) throw new Error("The FLUX demo took too long to answer. Try again.");
      if ((err as Error).name === "AbortError") throw err;
      throw err instanceof Error && !(err instanceof TypeError)
        ? err
        : new Error("Couldn't reach the FLUX demo. Check your connection.");
    };

    // Queue the job and wait for its server-sent result, retrying transient failures.
    let imageUrl: string | null = null;
    let lastError = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !imageUrl; attempt++) {
      try {
        req.onProgress?.({
          phase: "generating",
          message: attempt === 1 ? "Painting with FLUX…" : `Painting with FLUX… (retry ${attempt - 1})`,
        });

        const queued = await fetch(`${API}/call/infer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // [prompt, seed, randomize_seed, width, height, steps]
          body: JSON.stringify({ data: [req.prompt, req.seed, false, req.width, req.height, 4] }),
          signal,
        });
        if (!queued.ok) {
          if (queued.status === 429) {
            throw new ProviderUnavailableError("The FLUX demo is rate-limiting your connection.", 5 * 60_000);
          }
          lastError = `The FLUX demo returned ${queued.status}.`;
        } else {
          const { event_id: eventId } = await queued.json();
          const res = await fetch(`${API}/call/infer/${eventId}`, { signal });
          const events = parseSse(await res.text());
          const complete = events.find((e) => e.event === "complete");
          if (complete) {
            const payload = JSON.parse(complete.data) as Array<{ url?: string; path?: string } | number>;
            const file = payload[0] as { url?: string; path?: string };
            imageUrl = file.url ?? `${API}/file=${file.path}`;
            break;
          }
          const raw = events.find((e) => e.event === "error")?.data ?? "";
          lastError = friendlyError(raw);
          if (isQuotaError(raw)) throw new ProviderUnavailableError(lastError); // retrying won't help
        }
      } catch (err) {
        return fail(err);
      }
      if (attempt < MAX_ATTEMPTS) {
        req.onProgress?.({ phase: "queued", message: "The demo is busy — trying again shortly…" });
        try {
          await new Promise<void>((resolve, reject) => {
            const t = setTimeout(resolve, 4000 * attempt);
            signal.addEventListener("abort", () => (clearTimeout(t), reject(new DOMException("Aborted", "AbortError"))), { once: true });
          });
        } catch (err) {
          return fail(err);
        }
      }
    }
    if (!imageUrl) throw new Error(lastError || "The FLUX demo didn't return an image.");

    // Download the image so it can live in local storage.
    try {
      const img = await fetch(imageUrl, { signal });
      if (!img.ok) throw new Error("The finished image couldn't be downloaded.");
      return { blob: await img.blob(), model: "FLUX.1 schnell" };
    } catch (err) {
      return fail(err);
    }
  },
};
