"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  waitForPendingWrites,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { deleteAllBlobs, resumeUploads, setBlobOwner } from "@/lib/blob-store";
import { firebase } from "@/lib/firebase/client";
import { isGenerating } from "@/lib/generation-queue";
import { useAppStore } from "@/store/app-store";
import { useSyncStore } from "@/store/sync-store";

/**
 * Keeps the zustand store (the UI's working copy) and Firestore in step.
 *
 *   Firestore ──onSnapshot──▶ store     (remote edits, first load)
 *   store ──subscribe/diff──▶ Firestore (every UI action, debounced per document)
 *
 * Documents live at users/{uid}/{projects|walls|designs|composites}/{id}. Because every UI
 * change already goes through a store action, the diff is the only write path: actions
 * stay synchronous, the UI never waits for the network, and the Firestore offline cache
 * keeps edits safe across reloads. Conflicts are last-write-wins per document.
 */

const COLLECTIONS = ["projects", "walls", "designs", "composites"] as const;
type Col = (typeof COLLECTIONS)[number];

const WRITE_DEBOUNCE_MS = 400;

let applyingRemote = false;

/** Runs a store mutation without mirroring it back to Firestore. */
function asRemote(fn: () => void) {
  applyingRemote = true;
  try {
    fn();
  } finally {
    applyingRemote = false;
  }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
let activeUid: string | null = null;

const keyOf = (col: Col, id: string) => `${col}/${id}`;

function reportError(message: string, err: unknown) {
  console.warn(`[muralgen] ${message}`, err);
  useSyncStore.getState().patch({ error: message });
}

function describe(err: unknown): string {
  const code = (err as { code?: string })?.code;
  if (code === "permission-denied") {
    return "Cloud sync was refused (permission denied). Deploy the Firestore rules: firebase deploy --only firestore";
  }
  return "Cloud sync failed. Your changes are kept on this device and retried.";
}

function writeDoc(uid: string, col: Col, id: string) {
  const data = useAppStore.getState()[col][id];
  if (!data) return;
  const { db } = firebase();
  setDoc(doc(db, "users", uid, col, id), data).catch((err) =>
    reportError(describe(err), err),
  );
}

function scheduleWrite(uid: string, col: Col, id: string) {
  const key = keyOf(col, id);
  const prev = timers.get(key);
  if (prev) clearTimeout(prev);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      writeDoc(uid, col, id);
    }, WRITE_DEBOUNCE_MS),
  );
}

function scheduleDelete(uid: string, col: Col, id: string) {
  const key = keyOf(col, id);
  const prev = timers.get(key);
  if (prev) clearTimeout(prev);
  timers.delete(key);
  const { db } = firebase();
  deleteDoc(doc(db, "users", uid, col, id)).catch((err) =>
    reportError(describe(err), err),
  );
}

/** Sends every debounced edit right now (before sign-out, on tab hide). */
export function flushSync(): void {
  const uid = activeUid;
  if (!uid) return;
  for (const [key, timer] of [...timers]) {
    clearTimeout(timer);
    timers.delete(key);
    const [col, id] = key.split("/") as [Col, string];
    writeDoc(uid, col, id);
  }
}

/** Resolves once the server has acknowledged everything (or after `timeoutMs`). */
export async function flushAndWait(timeoutMs = 6000): Promise<void> {
  flushSync();
  try {
    await Promise.race([
      waitForPendingWrites(firebase().db),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {
    /* offline: pending writes stay in the local cache */
  }
}

export function startSync(uid: string): () => void {
  const { db } = firebase();
  activeUid = uid;
  setBlobOwner(uid);
  asRemote(() => useAppStore.getState().resetAll());
  useSyncStore.getState().patch({ ready: false, error: null, uploadError: null });

  const firstSnapshot = new Set<Col>();
  let readyHandled = false;
  const unsubs: Unsubscribe[] = [];

  const onReady = () => {
    if (readyHandled) return;
    readyHandled = true;
    // Generations that were running when the previous session ended can never finish.
    const { designs, updateDesign } = useAppStore.getState();
    for (const d of Object.values(designs)) {
      if (d.status === "pending" && !isGenerating(d.id)) {
        updateDesign(d.id, { status: "error", error: "Generation was interrupted." });
      }
    }
    useSyncStore.getState().patch({ ready: true });
    void resumeUploads();
  };

  for (const col of COLLECTIONS) {
    unsubs.push(
      onSnapshot(
        collection(db, "users", uid, col),
        { includeMetadataChanges: true },
        (snap) => {
          const isFirst = !firstSnapshot.has(col);
          const changes = snap.docChanges({ includeMetadataChanges: true }).filter((c) => {
            if (isFirst) return true;
            // Our own optimistic writes (and another tab's) are already in the store; wait for the ack.
            if (c.doc.metadata.hasPendingWrites) return false;
            // A newer local edit is waiting to be sent; it will overwrite this anyway.
            return !timers.has(keyOf(col, c.doc.id));
          });
          if (changes.length) {
            asRemote(() =>
              useAppStore.setState((s) => {
                const next = { ...s[col] } as Record<string, unknown>;
                for (const c of changes) {
                  if (c.type === "removed") delete next[c.doc.id];
                  else next[c.doc.id] = { ...c.doc.data(), id: c.doc.id };
                }
                return { [col]: next } as Partial<ReturnType<typeof useAppStore.getState>>;
              }),
            );
          }
          if (isFirst) {
            firstSnapshot.add(col);
            if (firstSnapshot.size === COLLECTIONS.length) onReady();
          }
        },
        (err) => {
          reportError(describe(err), err);
          // Don't leave the UI on skeletons forever.
          useSyncStore.getState().patch({ ready: true });
        },
      ),
    );
  }

  const unsubStore = useAppStore.subscribe((state, prev) => {
    if (applyingRemote || !readyHandled) return;
    for (const col of COLLECTIONS) {
      if (state[col] === prev[col]) continue;
      const now = state[col] as Record<string, unknown>;
      const before = prev[col] as Record<string, unknown>;
      for (const id of Object.keys(now)) {
        if (now[id] !== before[id]) scheduleWrite(uid, col, id);
      }
      for (const id of Object.keys(before)) {
        if (!(id in now)) scheduleDelete(uid, col, id);
      }
    }
  });

  const onHide = () => {
    if (document.visibilityState === "hidden") flushSync();
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", flushSync);

  return () => {
    flushSync();
    unsubs.forEach((u) => u());
    unsubStore();
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", flushSync);
    activeUid = null;
    setBlobOwner(null);
    asRemote(() => useAppStore.getState().resetAll());
    useSyncStore.getState().patch({ ready: false });
  };
}

/** Deletes every project/wall/design/composite document and every image of the signed-in user. */
export async function deleteAllUserData(): Promise<void> {
  const uid = activeUid;
  if (!uid) throw new Error("Not signed in.");
  const { db } = firebase();

  for (const t of timers.values()) clearTimeout(t);
  timers.clear();

  for (const col of COLLECTIONS) {
    const snap = await getDocs(collection(db, "users", uid, col));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  await deleteAllBlobs();
  asRemote(() => useAppStore.getState().resetAll());
}

/** Removes the profile document too; used right before the Auth account is deleted. */
export async function deleteProfileDoc(): Promise<void> {
  const uid = activeUid;
  if (!uid) return;
  await deleteDoc(doc(firebase().db, "users", uid));
}
