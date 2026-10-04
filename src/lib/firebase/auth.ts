"use client";

import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebase, googleProvider } from "@/lib/firebase/client";
import { flushAndWait } from "@/lib/firebase/sync";
import { useAuthStore, type AuthUser } from "@/store/auth-store";

/** Thin wrappers over the Firebase Auth SDK with readable error messages. */

export function toAuthUser(u: User): AuthUser {
  return {
    uid: u.uid,
    displayName: u.displayName,
    email: u.email,
    photoURL: u.photoURL,
    providerIds: u.providerData.map((p) => p.providerId),
  };
}

const MESSAGES: Record<string, string> = {
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/missing-password": "Enter your password.",
  "auth/weak-password": "Choose a password with at least 6 characters.",
  "auth/email-already-in-use": "An account with this email already exists. Try signing in instead.",
  "auth/user-not-found": "Wrong email or password.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/invalid-credential": "Wrong email or password.",
  "auth/invalid-login-credentials": "Wrong email or password.",
  "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
  "auth/network-request-failed": "Network error. Check your connection and try again.",
  "auth/popup-blocked": "The sign-in popup was blocked. Allow popups for this site and try again.",
  "auth/popup-closed-by-user": "",
  "auth/cancelled-popup-request": "",
  "auth/configuration-not-found":
    "Authentication isn't set up for this Firebase project yet. In Firebase console → Authentication, click “Get started”, then enable Google and Email/Password.",
  "auth/operation-not-allowed":
    "This sign-in method isn't enabled yet. Enable it in Firebase console → Authentication → Sign-in method.",
  "auth/requires-recent-login": "For security, please sign in again and retry.",
  "auth/unauthorized-domain":
    "This domain isn't authorised for sign-in. Add it in Firebase console → Authentication → Settings → Authorized domains.",
};

/** Message to show the user, or "" when the user simply dismissed the popup. */
export function authErrorMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    return MESSAGES[err.code] ?? `Something went wrong (${err.code}).`;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

/** Keeps users/{uid} (the profile document) in step with the Auth account. */
export async function upsertProfile(user: User): Promise<void> {
  const { db } = firebase();
  await setDoc(
    doc(db, "users", user.uid),
    {
      displayName: user.displayName ?? null,
      email: user.email ?? null,
      photoURL: user.photoURL ?? null,
      lastLoginAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(firebase().auth, googleProvider());
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(firebase().auth, email.trim(), password);
}

export async function signUpWithEmail(
  name: string,
  email: string,
  password: string,
): Promise<void> {
  const { auth } = firebase();
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const displayName = name.trim();
  if (displayName) await updateProfile(cred.user, { displayName });
}

export async function sendResetEmail(email: string): Promise<void> {
  await sendPasswordResetEmail(firebase().auth, email.trim());
}

export async function signOut(): Promise<void> {
  // Let queued edits reach the server while we're still authenticated.
  await flushAndWait();
  await fbSignOut(firebase().auth);
}

export async function updateDisplayName(name: string): Promise<void> {
  const { auth, db } = firebase();
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");
  const displayName = name.trim();
  await updateProfile(user, { displayName });
  await setDoc(
    doc(db, "users", user.uid),
    { displayName, updatedAt: serverTimestamp() },
    { merge: true },
  );
  // updateProfile doesn't trigger onAuthStateChanged, so refresh our copy by hand.
  useAuthStore.getState().setUser(toAuthUser(user));
}

/** Proves the user is still who they say (required before deleting the account). */
export async function reauthenticate(password?: string): Promise<void> {
  const user = firebase().auth.currentUser;
  if (!user) throw new Error("Not signed in.");
  if (user.providerData.some((p) => p.providerId === "google.com")) {
    await reauthenticateWithPopup(user, googleProvider());
  } else if (user.email) {
    if (!password) throw new Error("Enter your password to confirm.");
    await reauthenticateWithCredential(
      user,
      EmailAuthProvider.credential(user.email, password),
    );
  }
}

export async function deleteAccount(): Promise<void> {
  const user = firebase().auth.currentUser;
  if (!user) throw new Error("Not signed in.");
  await deleteUser(user);
}
