"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  type Auth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";
import {
  connectStorageEmulator,
  getStorage,
  type FirebaseStorage,
} from "firebase/storage";

/**
 * Firebase web SDK bootstrap. Everything is lazy so nothing runs during prerender.
 * NEXT_PUBLIC_* must be referenced statically for Next to inline them.
 */

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const useEmulators =
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";

/** False when .env.local is missing; the UI shows a setup hint instead of crashing. */
export const firebaseConfigured = Boolean(
  config.apiKey && config.projectId && config.appId && config.authDomain,
);

interface Services {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  functions: Functions;
}

/** Region of the Cloud Functions in /functions (keep in sync with functions/index.js). */
const FUNCTIONS_REGION = "europe-west1";

/**
 * Cached on globalThis, not in a module variable: when dev Fast Refresh re-evaluates this
 * file the Firebase app (and its Firestore instance) survives, and calling
 * initializeFirestore() a second time would throw "already been called with different options".
 */
const globalCache = globalThis as typeof globalThis & { __muralgenFirebase?: Services };

export function firebase(): Services {
  if (globalCache.__muralgenFirebase) return globalCache.__muralgenFirebase;
  if (!firebaseConfigured) {
    throw new Error("Firebase is not configured. Copy .env.example to .env.local.");
  }
  const app = getApps().length ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  // Offline cache + multi-tab coordination: edits survive a flaky connection or a reload.
  let db: Firestore;
  try {
    db = initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: useEmulators
        ? undefined
        : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    db = getFirestore(app); // already initialised (e.g. after a hot reload)
  }
  const storage = getStorage(app);
  const functions = getFunctions(app, FUNCTIONS_REGION);

  if (useEmulators) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  }

  globalCache.__muralgenFirebase = { app, auth, db, storage, functions };
  return globalCache.__muralgenFirebase;
}

export function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}
