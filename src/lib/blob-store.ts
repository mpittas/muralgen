"use client";

import { createStore, del, get, set, clear, type UseStore } from "idb-keyval";

/**
 * Local image storage (IndexedDB). This is the seam to swap for Firebase Storage:
 * keep the same `putBlob / getBlob / deleteBlob` surface and the UI won't notice.
 */

let store: UseStore | null = null;
function getStore(): UseStore {
  if (!store) store = createStore("muralgen", "blobs");
  return store;
}

const urls = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function newId(prefix = "id"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  return `${prefix}_${rand}`;
}

export async function putBlob(id: string, blob: Blob): Promise<void> {
  await set(id, blob, getStore());
  const prev = urls.get(id);
  urls.set(id, URL.createObjectURL(blob));
  if (prev) URL.revokeObjectURL(prev);
  emit();
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  return get<Blob>(id, getStore());
}

export async function deleteBlob(id: string | undefined): Promise<void> {
  if (!id) return;
  await del(id, getStore());
  const prev = urls.get(id);
  if (prev) URL.revokeObjectURL(prev);
  urls.delete(id);
  emit();
}

export async function deleteBlobs(ids: Array<string | undefined>): Promise<void> {
  await Promise.all(ids.map((id) => deleteBlob(id)));
}

export async function clearAllBlobs(): Promise<void> {
  await clear(getStore());
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls.clear();
  emit();
}

/** Resolves (and caches) an object URL for a stored blob. */
export function loadBlobUrl(id: string): Promise<string | null> {
  const cached = urls.get(id);
  if (cached) return Promise.resolve(cached);
  let p = inflight.get(id);
  if (!p) {
    p = getBlob(id)
      .then((blob) => {
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        urls.set(id, url);
        emit();
        return url;
      })
      .catch(() => null)
      .finally(() => inflight.delete(id));
    inflight.set(id, p);
  }
  return p;
}

export function peekBlobUrl(id: string | null | undefined): string | null {
  return id ? (urls.get(id) ?? null) : null;
}

export function subscribeBlobUrls(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
