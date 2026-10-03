"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { useSidebar } from "@/components/ui/sidebar";
import { useHydrated } from "@/hooks/use-hydrated";
import { useLatest } from "@/hooks/use-latest";
import { useAppStore } from "@/store/app-store";
import { StudioEditor } from "./studio-editor";
import { StudioSetup } from "./studio-setup";

/** The canvas wants the room: fold the app sidebar away while editing, restore it after. */
function CollapseSidebarWhileMounted() {
  const { open, setOpen } = useSidebar();
  const initial = useRef(open);
  // `setOpen` changes identity whenever `open` does, so go through a stable getter and run once.
  const getSetOpen = useLatest(setOpen);
  useEffect(() => {
    const previous = initial.current;
    getSetOpen()(false);
    return () => getSetOpen()(previous);
  }, [getSetOpen]);
  return null;
}

export function StudioPage({ projectId }: { projectId: string }) {
  const hydrated = useHydrated();
  const params = useSearchParams();
  const compositeId = params.get("c");
  const exists = useAppStore((s) =>
    compositeId ? s.composites[compositeId]?.projectId === projectId : false,
  );

  if (!hydrated) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (compositeId && exists) {
    return (
      <div className="h-full">
        <CollapseSidebarWhileMounted />
        <StudioEditor projectId={projectId} compositeId={compositeId} />
      </div>
    );
  }

  return (
    <StudioSetup
      projectId={projectId}
      initialWallId={params.get("wall") ?? undefined}
      initialDesignId={params.get("design") ?? undefined}
    />
  );
}
