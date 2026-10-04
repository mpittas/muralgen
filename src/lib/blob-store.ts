"use client";

import { createStore, del, get, set, clear, keys, type UseStore } from "idb-keyval";
import {
  deleteObject,
  getBlob as downloadBlob,
  listAll,
  ref,
  uploadBytes,
} from "firebase/storage";
import { FirebaseError } from "firebase/app";
import { firebase } from "@/lib/firebase/client";
import { useSyncStore } from "@/store/sync-store";

/**
 * Image storage. IndexedDB is a per-user local cache; Cloud Storage
 * (`users/{uid}/blobs/{id}`) is the source of truth.
 *
 *  - `putBlob` writes locally first (instant UI), then uploads in the background. Ids that
 *    haven't uploaded yet are remembered in a second IndexedDB so a closed tab or a failed
 *    upload is retried on the next sign-in (`resumeUploads`).
 *  - `getBlob` / `loadBlobUrl` read the cache and fall back to downloading from Storage.
 *
 * The surface (`putBlob / getBlob / deleteBlob / loadBlobUrl`) is the same as the
 * local-only version, so no UI code had to change.
 */

const LEGACY_DB = "muralgen"; // pre-account local data (see lib/firebase/migrate.ts)
const dbName = (uid: string | null) => (uid ? `muralgen-u-${uid}` : "muralgen-signed-out");

let ownerUid: string | null = null;
let blobsDb: UseStore | null = null;
let pendingDb: UseStore | null = null;

function blobsStore(): UseStore {
  blobsDb ??= createStore(dbName(ownerUid), "blobs");
  return blobsDb;
}
function pendingStore(): UseStore {
  pendingDb ??= createStore(`${dbName(ownerUid)}-uploads`, "pending");
  return pendingDb;
}

/** A read-only handle on the pre-account local database, for the one-time import. */
export function legacyBlobStore(): UseStore {
  return createStore(LEGACY_DB, "blobs");
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

/** Switch the active account: separate cache per user, no object URLs carried over. */
export function setBlobOwner(uid: string | null): void {
  if (uid === ownerUid) return;
  ownerUid = uid;
  blobsDb = null;
  pendingDb = null;
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls.clear();
  inflight.clear();
  uploadQueue.length = 0;
  emit();
}

/* ------------------------------ uploads ------------------------------ */

const objectRef = (uid: string, id: string) =>
  ref(firebase().storage, `users/${uid}/blobs/${id}`);

const uploadQueue: string[] = [];
let uploading = 0;
const MAX_UPLOADS = 3;
const MAX_ATTEMPTS = 3;

async function refreshPendingCount() {
  try {
    const n = (await keys(pendingStore())).length;
    useSyncStore.getState().patch({ pendingUploads: n });
  } catch {
    /* IndexedDB unavailable: counter stays as is */
  }
}

function pumpUploads(uid: string) {
  while (uploading < MAX_UPLOADS && uploadQueue.length) {
    const id = uploadQueue.shift()!;
    uploading++;
    void uploadOne(uid, id).finally(() => {
      uploading--;
      pumpUploads(uid);
    });
  }
}

async function uploadOne(uid: string, id: string) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (uid !== ownerUid) return; // user switched; the new owner resumes their own queue
    try {
      const blob = await get<Blob>(id, blobsStore());
      if (!blob) {
        await del(id, pendingStore()); // deleted before it uploaded
        break;
      }
      await uploadBytes(objectRef(uid, id), blob, { contentType: blob.type || "image/jpeg" });
      await del(id, pendingStore());
      useSyncStore.getState().patch({ uploadError: null });
      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed.";
      if (attempt === MAX_ATTEMPTS) {
        useSyncStore.getState().patch({ uploadError: message });
        console.warn(`[muralgen] upload of ${id} failed:`, err);
      } else {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }
  await refreshPendingCount();
}

function enqueueUpload(id: string) {
  if (!ownerUid || uploadQueue.includes(id)) return;
  uploadQueue.push(id);
  pumpUploads(ownerUid);
}

/** Retries every image that was saved locally but never reached Cloud Storage. */
export async function resumeUploads(): Promise<void> {
  try {
    const ids = (await keys(pendingStore())) as string[];
    useSyncStore.getState().patch({ pendingUploads: ids.length });
    ids.forEach(enqueueUpload);
  } catch {
    /* ignore */
  }
}

/* ------------------------------- API ------------------------------- */

export async function putBlob(id: string, blob: Blob): Promise<void> {
  await set(id, blob, blobsStore());
  await set(id, true, pendingStore());
  const prev = urls.get(id);
  urls.set(id, URL.createObjectURL(blob));
  if (prev) URL.revokeObjectURL(prev);
  emit();
  void refreshPendingCount();
  enqueueUpload(id);
}

/** Local cache first; otherwise downloads from Cloud Storage and caches the result. */
export async function getBlob(id: string): Promise<Blob | undefined> {
  const local = await get<Blob>(id, blobsStore());
  if (local) return local;
  const uid = ownerUid;
  if (!uid) return undefined;
  try {
    const blob = await downloadBlob(objectRef(uid, id));
    if (uid === ownerUid) await set(id, blob, blobsStore());
    return blob;
  } catch (err) {
    if (!(err instanceof FirebaseError && err.code === "storage/object-not-found")) {
      console.warn(`[muralgen] download of ${id} failed:`, err);
    }
    return undefined;
  }
}

export async function deleteBlob(id: string | undefined): Promise<void> {
  if (!id) return;
  const uid = ownerUid;
  await Promise.all([del(id, blobsStore()), del(id, pendingStore())]);
  const prev = urls.get(id);
  if (prev) URL.revokeObjectURL(prev);
  urls.delete(id);
  emit();
  void refreshPendingCount();
  if (uid) {
    try {
      await deleteObject(objectRef(uid, id));
    } catch (err) {
      if (!(err instanceof FirebaseError && err.code === "storage/object-not-found")) {
        console.warn(`[muralgen] could not delete ${id} from Storage:`, err);
      }
    }
  }
}

export async function deleteBlobs(ids: Array<string | undefined>): Promise<void> {
  await Promise.all(ids.map((id) => deleteBlob(id)));
}

/** Removes every stored image of the signed-in user (cloud + local cache). */
export async function deleteAllBlobs(): Promise<void> {
  const uid = ownerUid;
  if (uid) {
    const folder = ref(firebase().storage, `users/${uid}/blobs`);
    const listing = await listAll(folder);
    await Promise.all(listing.items.map((item) => deleteObject(item)));
  }
  uploadQueue.length = 0;
  await Promise.all([clear(blobsStore()), clear(pendingStore())]);
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls.clear();
  emit();
  void refreshPendingCount();
}

/** Resolves (and caches) an object URL for a stored blob. */
export function loadBlobUrl(id: string): Promise<string | null> {
  const cached = urls.get(id);
  if (cached) return Promise.resolve(cached);
  let p = inflight.get(id);
  if (!p) {
    const owner = ownerUid;
    p = getBlob(id)
      .then((blob) => {
        if (!blob || owner !== ownerUid) return null;
        const existing = urls.get(id);
        if (existing) return existing;
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
