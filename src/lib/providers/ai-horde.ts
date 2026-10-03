import { useSettingsStore } from "@/store/settings-store";
import type { GenerateRequest, GenerateResult, ImageProvider } from "./types";

const API = "https://aihorde.net/api/v2";
/** The documented anonymous key. Anonymous jobs run at the lowest priority. */
const ANONYMOUS_KEY = "0000000000";
const CLIENT_AGENT = "muralgen:0.1:local-dev";

const POLL_MS = 3000;
const MAX_WAIT_MS = 15 * 60_000;

/**
 * Auto mode gives up on a job that's still this many places back in the queue after
 * STALL_CHECKS polls, and resubmits it to the next group below. These are multi-worker models
 * that started at once in every Oct 2026 test (the queue itself is volatile).
 */
const STALL_POSITION = 40;
const STALL_CHECKS = 2;
const STALL_GROUPS = [
  ["Dreamshaper", "Deliberate"],
  ["Flat-2D Animerge", "Midjourney PaintArt"],
];

/** Things we never want in a wall design (negative prompts work on these SD models). */
const NEGATIVE =
  "text, watermark, signature, logo, caption, frame, border, vignette, photograph, brick wall, building, street, blurry, low quality, deformed";

/**
 * Curated general-purpose art models, in order of how well they suit flat, bold
 * mural artwork. "Auto" picks the ones with the shortest live queue, because the popular
 * models (Deliberate, Dreamshaper…) are often hundreds of jobs deep while niche ones
 * with an idle worker start immediately.
 */
const AUTO_POOL = [
  "Dan Mumford Style",
  "ModernArt Diffusion",
  "Midjourney PaintArt",
  "Epic Diffusion",
  "Dreamlike Diffusion",
  "NeverEnding Dream",
  "Dreamshaper",
  "Deliberate",
  "Comic-Diffusion",
  "Flat-2D Animerge",
  "Inkpunk Diffusion",
  "stable_diffusion",
];

const authHeaders = (): Record<string, string> => ({
  apikey: useSettingsStore.getState().hordeApiKey || ANONYMOUS_KEY,
  "Client-Agent": CLIENT_AGENT,
  "Content-Type": "application/json",
});

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function api<T>(
  path: string,
  init: RequestInit & { signal?: AbortSignal } = {},
): Promise<{ status: number; data: T }> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { ...authHeaders(), ...init.headers },
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new Error("Couldn't reach AI Horde. Check your connection.");
  }
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

interface CheckResponse {
  finished: number;
  processing: number;
  waiting: number;
  faulted: boolean;
  is_possible: boolean;
  queue_position: number;
  wait_time: number;
}

interface StatusResponse {
  generations?: Array<{ img: string; model: string; censored: boolean; state: string }>;
}

interface ModelInfo {
  name: string;
  /** Workers serving the model. */
  count: number;
  /** Estimated seconds to clear the queue. Understates it for single-worker models. */
  eta: number;
  /** Queued work in pixel-steps; 0 means a worker can start immediately. */
  queued: number;
  /** Recent throughput of the model's workers; 0 = they're listed but not actually completing jobs. */
  performance: number;
}

let modelCache: { at: number; models: string[] } | null = null;

/** Up to three pool models with the shortest live queue. */
async function pickFastModels(signal?: AbortSignal): Promise<string[]> {
  if (modelCache && Date.now() - modelCache.at < 60_000) return modelCache.models;
  try {
    const res = await fetch(`${API}/status/models?type=image&min_count=1`, { signal });
    const live = (await res.json()) as ModelInfo[];
    const byName = new Map(live.map((m) => [m.name, m]));
    const candidates = AUTO_POOL.map((name, rank) => ({ name, rank, info: byName.get(name) }))
      // Skip models whose worker is listed but idle/stalled (`performance` 0): jobs sent there
      // wait in the general queue (hundreds ahead) even though `eta` looks tiny.
      .filter((c): c is { name: string; rank: number; info: ModelInfo } => !!c.info && c.info.performance > 0)
      // Only an empty queue counts as "idle": `eta` alone is misleading (a single-worker model
      // with 700 jobs ahead can still report ~14 s). Among idle models prefer the better-suited one.
      .sort((a, b) => {
        const ea = a.info.queued > 0 ? 1 + a.info.eta : 0;
        const eb = b.info.queued > 0 ? 1 + b.info.eta : 0;
        return ea - eb || a.rank - b.rank;
      });
    const models = candidates.slice(0, 3).map((c) => c.name);
    if (models.length > 0) {
      modelCache = { at: Date.now(), models };
      return models;
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
  }
  return ["Dreamshaper", "Deliberate", "stable_diffusion"];
}

/**
 * AI Horde (aihorde.net): a volunteer-run network of GPUs. Free and keyless,
 * CORS-enabled, and supports negative prompts. The trade-off is time: anonymous jobs
 * share a community queue, so waits range from ~10 s to many minutes.
 *
 * Privacy: the prompt (never your photos) is processed by community workers.
 */
export const aiHorde: ImageProvider = {
  id: "ai-horde",
  name: "AI Horde (Stable Diffusion)",
  tagline: "Free community GPUs — slower, but no limits per day.",
  free: true,
  requiresKey: false,
  status: "available",
  models: [
    {
      id: "auto",
      label: "Auto · fastest available",
      description: "Picks art models with the shortest queue",
    },
    { id: "Dan Mumford Style", label: "Poster illustration", description: "Dan Mumford style" },
    { id: "ModernArt Diffusion", label: "Modern art" },
    { id: "Midjourney PaintArt", label: "Paint art" },
    { id: "Dreamshaper", label: "Dreamshaper", description: "Clean illustration" },
    { id: "Deliberate", label: "Deliberate", description: "Versatile, detailed" },
    { id: "stable_diffusion", label: "Stable Diffusion 1.5" },
  ],
  defaultModel: "auto",
  minIntervalMs: 1500,
  maxImagesPerBatch: 4,
  maxConcurrent: 2,
  maxSide: 640,
  typicalSeconds: 45,
  limits:
    "Free community network: waits range from about 10 seconds to several minutes depending on demand. Prompts are processed by volunteer workers, so don't include anything private. Add your own free key in Settings for better priority.",

  constrainSize(width, height) {
    // Stable Diffusion 1.5 models need multiples of 64 and degrade past ~768px.
    const max = 640;
    const min = 256;
    const scale = Math.min(1, max / Math.max(width, height));
    const snap = (v: number) => Math.max(min, Math.min(max, Math.round((v * scale) / 64) * 64));
    return { width: snap(width), height: snap(height) };
  },

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const wanted = req.model || this.defaultModel;
    const auto = wanted === "auto";
    let models = auto ? await pickFastModels(req.signal) : [wanted];

    // 1. Submit (retry politely when the account is throttled).
    const submit = async (modelList: string[]): Promise<string> => {
      const payload = {
        prompt: `${req.prompt} ### ${NEGATIVE}`,
        params: {
          width: req.width,
          height: req.height,
          steps: 25,
          n: 1,
          cfg_scale: 7.5,
          sampler_name: "k_euler_a",
          seed: String(req.seed),
        },
        models: modelList,
        nsfw: false,
        censor_nsfw: true,
        slow_workers: true,
        // Ask for base64 in the response: the R2 download links aren't CORS-readable.
        r2: false,
        shared: false,
      };
      for (let attempt = 1; attempt <= 12; attempt++) {
        const { status, data } = await api<{ id?: string; message?: string }>("/generate/async", {
          method: "POST",
          body: JSON.stringify(payload),
          signal: req.signal,
        });
        if (status === 202 && data.id) return data.id;
        if (status === 429 || status === 503) {
          req.onProgress?.({ phase: "queued", message: "The community queue is busy — retrying…" });
          await sleep(5000, req.signal);
          continue;
        }
        throw new Error(data.message || `AI Horde rejected the request (${status}).`);
      }
      throw new Error("AI Horde is too busy right now. Try again in a minute.");
    };

    let id = await submit(models);

    // 2. Poll until it's painted. If the user cancels, release the job on the network.
    const cancelRemote = () =>
      void fetch(`${API}/generate/status/${id}`, { method: "DELETE", headers: authHeaders() }).catch(
        () => {},
      );
    req.signal?.addEventListener("abort", cancelRemote, { once: true });

    const started = Date.now();
    let stalledChecks = 0;
    let nextGroup = 0;
    while (true) {
      await sleep(POLL_MS, req.signal);
      if (Date.now() - started > MAX_WAIT_MS) {
        cancelRemote();
        throw new Error("This took longer than 15 minutes, so we gave up. Try again or pick another model.");
      }
      const { data } = await api<CheckResponse>(`/generate/check/${id}`, { signal: req.signal });
      if (data.faulted) throw new Error("The worker failed to paint this one. Try again.");
      if (data.is_possible === false) {
        cancelRemote();
        throw new Error("No worker can run that model/size right now. Try another model.");
      }
      if (data.finished >= 1) break;

      // Auto mode: a job stuck behind hundreds of others means the models we picked have no free
      // worker, whatever the model stats say. Move it to another group instead of waiting an hour.
      const stalled = data.processing < 1 && (data.queue_position ?? 0) > STALL_POSITION;
      stalledChecks = stalled ? stalledChecks + 1 : 0;
      if (auto && stalledChecks >= STALL_CHECKS && nextGroup < STALL_GROUPS.length) {
        cancelRemote();
        models = STALL_GROUPS[nextGroup++];
        stalledChecks = 0;
        req.onProgress?.({ phase: "queued", message: "Those models are busy — trying others…" });
        id = await submit(models);
        continue;
      }

      const eta = Math.max(0, data.wait_time ?? 0);
      const etaText = eta >= 90 ? `~${Math.round(eta / 60)} min` : eta > 0 ? `~${eta}s` : "";
      if (data.processing >= 1) {
        req.onProgress?.({
          phase: "generating",
          message: eta > 1 ? `Painting… about ${eta}s left` : "Painting… almost there",
        });
      } else {
        const pos = data.queue_position ?? 0;
        req.onProgress?.({
          phase: "queued",
          message:
            pos > 0
              ? `Community queue: ${pos} ahead${etaText ? ` · ${etaText}` : ""}`
              : `Waiting for a free worker${etaText ? ` · ${etaText}` : ""}`,
        });
      }
    }

    // 3. Fetch the finished image (base64 webp).
    const { data } = await api<StatusResponse>(`/generate/status/${id}`, { signal: req.signal });
    const gen = data.generations?.[0];
    if (!gen?.img) throw new Error("AI Horde returned no image.");
    if (gen.censored) {
      throw new Error("The image was filtered by the safety check. Try rewording the prompt.");
    }
    const blob = gen.img.startsWith("http")
      ? await (await fetch(gen.img)).blob()
      : base64ToBlob(gen.img, "image/webp");
    return { blob, model: gen.model || models[0] };
  },
};
