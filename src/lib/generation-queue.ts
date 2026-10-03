"use client";

import { create } from "zustand";
import { newId, putBlob } from "@/lib/blob-store";
import { prepareUpload } from "@/lib/image-utils";
import { getProvider, ProviderUnavailableError } from "@/lib/providers";
import { useAppStore } from "@/store/app-store";

/**
 * Module-level generation queue. It lives outside React so a batch keeps running while
 * the user navigates between pages, and so rate limits are handled in one place.
 * Concurrency is per provider (`maxConcurrent`): slow community networks can take a couple
 * of jobs at once, while a shared demo GPU should only see one.
 */

export interface GenStatus {
  phase: "queued" | "generating" | "waiting";
  message?: string;
}

interface StatusStore {
  byId: Record<string, GenStatus>;
  set: (id: string, s: GenStatus | null) => void;
}

/** Ephemeral (non-persisted) per-design progress, read by the UI. */
export const useGenStatus = create<StatusStore>((set) => ({
  byId: {},
  set: (id, s) =>
    set((state) => {
      const byId = { ...state.byId };
      if (s) byId[id] = s;
      else delete byId[id];
      return { byId };
    }),
}));

const queue: string[] = [];
const controllers = new Map<string, AbortController>();
const activeByProvider = new Map<string, number>();
/** Providers that reported being out of quota / rate-limited, and when to try them again. */
const unavailableUntil = new Map<string, number>();
let nextStartAt = 0;

const setStatus = (id: string, s: GenStatus | null) =>
  useGenStatus.getState().set(id, s);

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export function enqueueGenerations(designIds: string[]): void {
  for (const id of designIds) {
    queue.push(id);
    setStatus(id, { phase: "queued" });
  }
  pump();
}

/** Stops a queued or running generation and removes its placeholder. */
export function cancelGeneration(id: string): void {
  const qi = queue.indexOf(id);
  if (qi >= 0) queue.splice(qi, 1);
  controllers.get(id)?.abort();
  setStatus(id, null);
  useAppStore.getState().removeDesign(id);
}

/** Re-runs a failed generation, optionally on a different provider (size is re-fitted to it). */
export function retryGeneration(id: string, providerId?: string): void {
  const { updateDesign, designs } = useAppStore.getState();
  const design = designs[id];
  if (!design) return;
  if (providerId && providerId !== design.providerId) {
    const provider = getProvider(providerId);
    const size = provider.constrainSize(design.width, design.height);
    updateDesign(id, {
      providerId: provider.id,
      model: provider.defaultModel,
      width: size.width,
      height: size.height,
    });
  }
  updateDesign(id, { status: "pending", error: undefined });
  enqueueGenerations([id]);
}

/**
 * Moves a design to its provider's fallback (e.g. FLUX → AI Horde) and re-fits the size.
 * Returns false when the provider has no usable fallback.
 */
function moveToFallback(id: string, fromId: string): boolean {
  const fallbackId = getProvider(fromId).fallbackProviderId;
  const design = useAppStore.getState().designs[id];
  if (!fallbackId || !design) return false;
  const fallback = getProvider(fallbackId);
  if (fallback.id === fromId || fallback.status !== "available") return false;
  const size = fallback.constrainSize(design.width, design.height);
  useAppStore.getState().updateDesign(id, {
    providerId: fallback.id,
    model: fallback.defaultModel,
    width: size.width,
    height: size.height,
  });
  return true;
}

function pump() {
  for (let i = 0; i < queue.length; ) {
    const id = queue[i];
    let design = useAppStore.getState().designs[id];
    if (!design) {
      queue.splice(i, 1);
      setStatus(id, null);
      continue;
    }
    // Skip a provider we already know is out of quota instead of failing on it again.
    if ((unavailableUntil.get(design.providerId) ?? 0) > Date.now() && moveToFallback(id, design.providerId)) {
      design = useAppStore.getState().designs[id];
    }
    const provider = getProvider(design.providerId);
    const active = activeByProvider.get(provider.id) ?? 0;
    if (active >= provider.maxConcurrent) {
      i++; // this provider is full; a later job may use another one
      continue;
    }
    queue.splice(i, 1);
    activeByProvider.set(provider.id, active + 1);
    void runJob(id).finally(() => {
      activeByProvider.set(provider.id, Math.max(0, (activeByProvider.get(provider.id) ?? 1) - 1));
      pump();
    });
  }
}

async function runJob(id: string) {
  const design = useAppStore.getState().designs[id];
  if (!design || design.status !== "pending") {
    setStatus(id, null);
    return;
  }
  const provider = getProvider(design.providerId);
  const ctrl = new AbortController();
  controllers.set(id, ctrl);
  let rerouted = false;

  try {
    // Space request starts out so we don't hammer the provider.
    const startAt = Math.max(Date.now(), nextStartAt);
    nextStartAt = startAt + provider.minIntervalMs;
    const gap = startAt - Date.now();
    if (gap > 50) {
      setStatus(id, { phase: "waiting", message: "Lining up your request…" });
      await sleep(gap, ctrl.signal);
    }
    setStatus(id, { phase: "generating", message: "Sending to the model…" });

    const result = await provider.generate({
      prompt: design.fullPrompt,
      width: design.width,
      height: design.height,
      seed: design.seed,
      model: design.model,
      signal: ctrl.signal,
      onProgress: ({ phase, message }) =>
        setStatus(id, { phase: phase === "queued" ? "waiting" : "generating", message }),
    });
    setStatus(id, { phase: "generating", message: "Saving…" });

    const prepared = await prepareUpload(result.blob);
    const imageId = newId("img");
    const thumbId = newId("thm");
    await Promise.all([
      putBlob(imageId, prepared.blob),
      putBlob(thumbId, prepared.thumb),
    ]);

    // The placeholder may have been cancelled/deleted while we were saving.
    if (!useAppStore.getState().designs[id]) return;
    useAppStore.getState().updateDesign(id, {
      status: "ready",
      imageId,
      thumbId,
      width: prepared.width,
      height: prepared.height,
      model: result.model,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    if (err instanceof ProviderUnavailableError) {
      unavailableUntil.set(provider.id, Date.now() + err.retryAfterMs);
      // The job isn't lost: hand it to the fallback provider and run it there.
      if (useAppStore.getState().designs[id] && moveToFallback(id, provider.id)) {
        const fallback = getProvider(useAppStore.getState().designs[id].providerId);
        queue.push(id);
        setStatus(id, { phase: "waiting", message: `${provider.name} is out of quota — switching to ${fallback.name}…` });
        rerouted = true;
        return;
      }
    }
    if (useAppStore.getState().designs[id]) {
      useAppStore.getState().updateDesign(id, {
        status: "error",
        error: err instanceof Error ? err.message : "Generation failed.",
      });
    }
  } finally {
    controllers.delete(id);
    if (!rerouted) setStatus(id, null);
  }
}
