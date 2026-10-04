import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { firebase } from "@/lib/firebase/client";
import { useSettingsStore } from "@/store/settings-store";
import type { GenerateRequest, GenerateResult, ImageProvider } from "./types";

/**
 * OpenAI GPT Image 2.5 (Flare) through the `generateImage` Cloud Function (/functions).
 * The API key is a server-side secret; the function requires a signed-in user and enforces
 * a daily image allowance. Cost is driven by output pixels × quality, so we ask for about one
 * megapixel at `low` quality (~$0.005 per image, see settings for the `medium` option).
 */

const MODEL = "gpt-image-2.5-flare";

/** ~1 MP keeps output tokens (and cost) near the square-1024 figure; the API needs ≥ 655,360. */
const TARGET_PIXELS = 1_000_000;
const MIN_PIXELS = 655_360;
const MAX_RATIO = 3;
const STEP = 16;

interface CallInput {
  prompt: string;
  width: number;
  height: number;
  quality: "low" | "medium";
}
interface CallOutput {
  image: string;
  mimeType: string;
  model: string;
}

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

function friendly(err: unknown): Error {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case "functions/unauthenticated":
        return new Error("Sign in again to generate with OpenAI.");
      case "functions/not-found":
        return new Error(
          "OpenAI generation isn't deployed yet. Run: firebase deploy --only functions",
        );
      case "functions/unavailable":
      case "functions/deadline-exceeded":
        return new Error("Couldn't reach the image service. Check your connection and retry.");
      case "functions/internal":
        return new Error("OpenAI generation failed on the server. Try again.");
      default:
        // invalid-argument / resource-exhausted / failed-precondition carry a readable message.
        return new Error(err.message || "OpenAI generation failed.");
    }
  }
  return err instanceof Error ? err : new Error("OpenAI generation failed.");
}

export const openai: ImageProvider = {
  id: "openai",
  name: "OpenAI GPT Image 2.5",
  tagline: "Best prompt-following and text rendering. Paid, billed to the project's OpenAI account.",
  free: false,
  requiresKey: false, // the key is server-side
  status: "available",
  models: [{ id: MODEL, label: "GPT Image 2.5 Flare", description: "Fast, ~$0.005 / image at low quality" }],
  defaultModel: MODEL,
  minIntervalMs: 300,
  maxImagesPerBatch: 4,
  maxConcurrent: 2,
  maxSide: 1024,
  typicalSeconds: 15,
  limits:
    "Paid: about $0.005 per image at Low quality and about $0.05 at Medium (change it in Settings). Up to 60 images per day per account. Your prompt is sent to OpenAI.",

  constrainSize(width, height) {
    // Keep the aspect ratio, aim for TARGET_PIXELS, snap to multiples of 16, respect 3:1.
    const ratio = Math.min(MAX_RATIO, Math.max(1 / MAX_RATIO, width / height));
    let w = Math.round(Math.sqrt(TARGET_PIXELS * ratio) / STEP) * STEP;
    let h = Math.round(Math.sqrt(TARGET_PIXELS / ratio) / STEP) * STEP;
    while (w / h > MAX_RATIO) w -= STEP;
    while (h / w > MAX_RATIO) h -= STEP;
    while (w * h < MIN_PIXELS) {
      if (w >= h) w += STEP;
      else h += STEP;
    }
    return { width: w, height: h };
  },

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    if (req.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    req.onProgress?.({ phase: "generating", message: "Painting with GPT Image…" });

    const call = httpsCallable<CallInput, CallOutput>(firebase().functions, "generateImage", {
      timeout: 170_000,
    });
    const size = this.constrainSize(req.width, req.height);
    const pending = call({
      prompt: req.prompt,
      width: size.width,
      height: size.height,
      quality: useSettingsStore.getState().openaiQuality,
    });

    // The callable can't be cancelled, so stop waiting for it when the job is aborted.
    const aborted = new Promise<never>((_, reject) => {
      req.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });

    try {
      const { data } = await Promise.race([pending, aborted]);
      return { blob: base64ToBlob(data.image, data.mimeType || "image/jpeg"), model: data.model };
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      throw friendly(err);
    }
  },
};
