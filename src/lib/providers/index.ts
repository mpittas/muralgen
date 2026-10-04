import { aiHorde } from "./ai-horde";
import { hfFlux } from "./hf-flux";
import { openai } from "./openai";
import { pollinations } from "./pollinations";
import type { ImageProvider } from "./types";

export type { ImageProvider, GenerateRequest, GenerateResult } from "./types";
export { ProviderUnavailableError } from "./types";

/** Placeholders so the UI can show what's coming. Wire them up in the backend phase. */
const comingSoon = (
  id: string,
  name: string,
  tagline: string,
): ImageProvider => ({
  id,
  name,
  tagline,
  free: false,
  requiresKey: true,
  status: "coming-soon",
  models: [],
  defaultModel: "",
  minIntervalMs: 0,
  maxImagesPerBatch: 4,
  maxConcurrent: 1,
  maxSide: 1024,
  constrainSize: (width, height) => ({ width, height }),
  generate: async () => {
    throw new Error(`${name} isn't connected yet.`);
  },
});

export const providers: ImageProvider[] = [
  hfFlux,
  aiHorde,
  pollinations,
  openai,
  comingSoon("google", "Google Imagen / Gemini", "High-fidelity generations via Firebase."),
  comingSoon("replicate", "Replicate (Flux, SDXL…)", "Open models, ControlNet and inpainting."),
  comingSoon("stability", "Stability AI", "Stable Diffusion with mask-based editing."),
];

export const DEFAULT_PROVIDER_ID = hfFlux.id;

export function getProvider(id: string): ImageProvider {
  return providers.find((p) => p.id === id) ?? hfFlux;
}

/** Like `getProvider`, but never returns one that can't generate yet (stale saved settings). */
export function getUsableProvider(id: string): ImageProvider {
  const p = getProvider(id);
  return p.status === "available" ? p : hfFlux;
}
