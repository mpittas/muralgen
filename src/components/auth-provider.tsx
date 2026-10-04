"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { firebase, firebaseConfigured } from "@/lib/firebase/client";
import { toAuthUser, upsertProfile } from "@/lib/firebase/auth";
import { startSync } from "@/lib/firebase/sync";
import { useAuthStore } from "@/store/auth-store";

/**
 * Mirrors Firebase Auth into `useAuthStore` and, while someone is signed in, keeps their
 * data synced with Firestore / Cloud Storage (`startSync`).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser);
  const uid = useAuthStore((s) => s.user?.uid);

  useEffect(() => {
    if (!firebaseConfigured) {
      setUser(null);
      return;
    }
    return onAuthStateChanged(firebase().auth, (user) => {
      setUser(user ? toAuthUser(user) : null);
      if (user) upsertProfile(user).catch((err) => console.warn("[muralgen] profile update failed", err));
    });
  }, [setUser]);

  useEffect(() => {
    if (!uid) return;
    return startSync(uid);
  }, [uid]);

  return children;
}
