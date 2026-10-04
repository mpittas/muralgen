"use client";

import { useEffect, useState } from "react";
import { CloudUpload, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  importLegacyData,
  legacyImportHandled,
  markLegacyHandled,
  readLegacyData,
} from "@/lib/firebase/migrate";
import { useAuthStore } from "@/store/auth-store";
import { useSyncStore } from "@/store/sync-store";

/** Offers to move projects from the pre-account, browser-only version into the account. */
export function LegacyImportBanner() {
  const uid = useAuthStore((s) => s.user?.uid);
  const ready = useSyncStore((s) => s.ready);
  const [count, setCount] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!uid || !ready || legacyImportHandled(uid)) return;
    const data = readLegacyData();
    // Reading localStorage is browser-only, so this check can't run during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCount(data ? Object.keys(data.projects).length : 0);
  }, [uid, ready]);

  if (!uid || !count) return null;
  const importing = progress !== null;

  async function run() {
    if (!uid) return;
    setProgress({ done: 0, total: 0 });
    try {
      const res = await importLegacyData(uid, (done, total) => setProgress({ done, total }));
      toast.success(`Imported ${res.projects} project${res.projects === 1 ? "" : "s"}`, {
        description: res.missing ? `${res.missing} image(s) were missing locally and were skipped.` : undefined,
      });
      setCount(0);
    } catch (err) {
      toast.error("Import failed", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setProgress(null);
    }
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 border-b bg-accent/60 px-4 py-2.5 text-sm"
    >
      <CloudUpload className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">
        Found {count} project{count === 1 ? "" : "s"} saved in this browser from before accounts.
        Add {count === 1 ? "it" : "them"} to your account?
      </p>
      <Button size="sm" onClick={run} disabled={importing}>
        {importing && <Loader2 className="animate-spin" />}
        {importing && progress.total ? `Importing ${progress.done}/${progress.total}` : "Import"}
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Dismiss"
        disabled={importing}
        onClick={() => {
          if (uid) markLegacyHandled(uid, "dismissed");
          setCount(0);
        }}
      >
        <X />
      </Button>
    </div>
  );
}
