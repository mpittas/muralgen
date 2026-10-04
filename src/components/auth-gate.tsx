"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/logo";
import { firebaseConfigured } from "@/lib/firebase/client";
import { useAuthStore } from "@/store/auth-store";

/** Renders the app only for signed-in users; everyone else is sent to /login. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status !== "signedOut") return;
    const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    router.replace(`/login${next}`);
  }, [status, pathname, router]);

  if (!firebaseConfigured) return <SetupNotice />;
  if (status !== "signedIn") return <FullScreenLoader />;
  return children;
}

export function FullScreenLoader() {
  return (
    <div className="flex min-h-svh flex-1 flex-col items-center justify-center gap-4">
      <Logo />
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  );
}

export function SetupNotice() {
  return (
    <div className="flex min-h-svh flex-1 items-center justify-center p-6">
      <div className="max-w-md space-y-3 rounded-xl border bg-card p-6 text-sm">
        <Logo />
        <h1 className="font-heading text-lg font-bold">Firebase isn&apos;t configured</h1>
        <p className="text-muted-foreground">
          Copy <code className="font-mono">.env.example</code> to{" "}
          <code className="font-mono">.env.local</code>, fill in your Firebase web app config, and
          restart the dev server. See the README for the full setup.
        </p>
      </div>
    </div>
  );
}
