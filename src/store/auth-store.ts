"use client";

import { create } from "zustand";

export interface AuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  /** "google.com" | "password" | … */
  providerIds: string[];
}

interface AuthState {
  /** `loading` until Firebase has told us whether someone is signed in. */
  status: "loading" | "signedOut" | "signedIn";
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  user: null,
  setUser: (user) => set({ user, status: user ? "signedIn" : "signedOut" }),
}));

export function useUser(): AuthUser | null {
  return useAuthStore((s) => s.user);
}
