"use client";

import { get } from "idb-keyval";
import { legacyBlobStore, putBlob } from "@/lib/blob-store";
import type { Composite, Design, Project, Wall } from "@/lib/types";
import { useAppStore } from "@/store/app-store";

/**
 * One-time import of the data the app kept in this browser before accounts existed
 * (localStorage `muralgen:v1` + IndexedDB `muralgen`). Nothing is deleted locally; the
 * import is marked per account so the banner doesn't come back.
 */

const LEGACY_KEY = "muralgen:v1";
const doneKey = (uid: string) => `muralgen:legacy-import:${uid}`;

interface LegacyData {
  projects: Record<string, Project>;
  walls: Record<string, Wall>;
  designs: Record<string, Design>;
  composites: Record<string, Composite>;
}

export function readLegacyData(): LegacyData | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const state = (JSON.parse(raw) as { state?: Partial<LegacyData> }).state;
    if (!state?.projects || Object.keys(state.projects).length === 0) return null;
    return {
      projects: state.projects,
      walls: state.walls ?? {},
      designs: state.designs ?? {},
      composites: state.composites ?? {},
    };
  } catch {
    return null;
  }
}

export function legacyImportHandled(uid: string): boolean {
  try {
    return localStorage.getItem(doneKey(uid)) !== null;
  } catch {
    return true;
  }
}

export function markLegacyHandled(uid: string, how: "imported" | "dismissed"): void {
  try {
    localStorage.setItem(doneKey(uid), how);
  } catch {
    /* ignore */
  }
}

export async function importLegacyData(
  uid: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ projects: number; images: number; missing: number }> {
  const data = readLegacyData();
  if (!data) return { projects: 0, images: 0, missing: 0 };

  const designs = Object.fromEntries(
    Object.entries(data.designs).map(([id, d]) => [
      id,
      d.status === "pending"
        ? { ...d, status: "error" as const, error: "Generation was interrupted." }
        : d,
    ]),
  );

  const blobIds = new Set<string>();
  for (const w of Object.values(data.walls)) [w.imageId, w.thumbId].forEach((i) => i && blobIds.add(i));
  for (const d of Object.values(designs)) [d.imageId, d.thumbId].forEach((i) => i && blobIds.add(i));
  for (const c of Object.values(data.composites))
    [c.maskId, c.resultId, c.thumbId].forEach((i) => i && blobIds.add(i));

  // Images first, so nothing in the cloud ever points at a missing file.
  const store = legacyBlobStore();
  let done = 0;
  let images = 0;
  let missing = 0;
  for (const id of blobIds) {
    const blob = await get<Blob>(id, store);
    if (blob) {
      await putBlob(id, blob);
      images++;
    } else {
      missing++;
    }
    onProgress?.(++done, blobIds.size);
  }

  useAppStore.getState().importData({
    projects: data.projects,
    walls: data.walls,
    designs,
    composites: data.composites,
  });
  markLegacyHandled(uid, "imported");
  return { projects: Object.keys(data.projects).length, images, missing };
}
