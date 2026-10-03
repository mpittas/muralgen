"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Columns3, Heart, Images, Layers, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { BlobImage } from "@/components/blob-image";
import { Dropzone } from "@/components/dropzone";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useHydrated } from "@/hooks/use-hydrated";
import { addSampleDesigns, uploadDesigns } from "@/lib/actions";
import type { Design } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore, useDesigns } from "@/store/app-store";
import { DesignDialog, DesignTile, designLabel } from "./design-card";

type Filter = "all" | "favorites" | "ai" | "uploads";

export function DesignsPage({ projectId }: { projectId: string }) {
  const hydrated = useHydrated();
  const all = useDesigns(projectId);
  const choose = useAppStore((s) => s.chooseDesign);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [busy, setBusy] = useState(false);

  const ready = useMemo(() => all.filter((d) => d.status === "ready"), [all]);
  const chosen = ready.find((d) => d.chosen);
  const visible = useMemo(
    () =>
      ready.filter((d) =>
        filter === "favorites"
          ? d.favorite
          : filter === "ai"
            ? d.source === "ai"
            : filter === "uploads"
              ? d.source !== "ai"
              : true,
      ),
    [ready, filter],
  );

  const toggle = (id: string) =>
    setPicked((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? [...p.slice(1), id] : [...p, id],
    );

  const onFiles = async (files: File[]) => {
    setBusy(true);
    try {
      const added = await uploadDesigns(projectId, files);
      toast.success(`${added.length} design${added.length === 1 ? "" : "s"} added`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  if (!hydrated) {
    return (
      <div className="grid grid-cols-2 gap-4 p-6 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
        ))}
      </div>
    );
  }

  const opened = all.find((d) => d.id === open);
  const comparing = picked.map((id) => ready.find((d) => d.id === id)).filter(Boolean) as Design[];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl font-bold">Design library</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Everything generated or uploaded for this project. Favourite the contenders, compare
            them side by side and choose the one that goes on the wall.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/projects/${projectId}/generate`}>
              <Sparkles /> Generate more
            </Link>
          </Button>
        </div>
      </div>

      {chosen && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-primary/40 bg-primary/5 p-3">
          <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg border">
            <BlobImage id={chosen.thumbId} alt="" className="size-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <Check className="size-3.5 text-foreground" /> Chosen for the wall
            </p>
            <p className="truncate text-sm font-medium">{designLabel(chosen)}</p>
          </div>
          <Button asChild>
            <Link href={`/projects/${projectId}/studio?design=${chosen.id}`}>
              <Layers /> Apply in studio
            </Link>
          </Button>
          <Button variant="ghost" size="icon" aria-label="Unchoose design" onClick={() => choose(projectId, null)}>
            <X />
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(v) => v && setFilter(v as Filter)}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="all">All ({ready.length})</ToggleGroupItem>
          <ToggleGroupItem value="favorites">
            <Heart className="size-3.5" /> Favorites
          </ToggleGroupItem>
          <ToggleGroupItem value="ai">AI</ToggleGroupItem>
          <ToggleGroupItem value="uploads">Uploads</ToggleGroupItem>
        </ToggleGroup>
        <Button
          size="sm"
          variant={compareMode ? "default" : "outline"}
          className="ml-auto"
          onClick={() => {
            setCompareMode((m) => !m);
            setPicked([]);
          }}
        >
          <Columns3 /> {compareMode ? "Exit compare" : "Compare"}
        </Button>
      </div>

      {ready.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Images />
          </span>
          <p className="font-medium">No designs yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Generate some with AI, or upload artwork you already have — a sketch, a render, a
            finished piece.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href={`/projects/${projectId}/generate`}>
                <Sparkles /> Generate with AI
              </Link>
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await addSampleDesigns(projectId);
                setBusy(false);
              }}
            >
              Add sample artwork
            </Button>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed py-14 text-center text-sm text-muted-foreground">
          Nothing here yet — try another filter.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] items-start gap-4">
          {visible.map((d) => {
            const selected = picked.includes(d.id);
            return (
              <div key={d.id} className="relative">
                <DesignTile
                  design={d}
                  onOpen={() => (compareMode ? toggle(d.id) : setOpen(d.id))}
                  className={cn(selected && "ring-2 ring-primary ring-offset-2 ring-offset-background")}
                />
                {compareMode && (
                  <span
                    className={cn(
                      "pointer-events-none absolute top-2 left-2 flex size-6 items-center justify-center rounded-full border-2 border-white bg-black/40 text-white",
                      selected && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {selected ? <Check className="size-3.5" /> : null}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="pt-2">
        <h3 className="mb-2 text-sm font-semibold">Have your own artwork?</h3>
        <Dropzone
          compact
          multiple
          busy={busy}
          onFiles={onFiles}
          title="Upload designs"
          hint="Sketches, renders or finished artwork — they work like any generated design"
        />
      </div>

      {compareMode && picked.length > 0 && (
        <div className="sticky bottom-4 z-10 mx-auto flex w-fit items-center gap-3 rounded-full border bg-popover/95 py-2 pr-2 pl-4 shadow-xl backdrop-blur">
          <span className="text-sm">{picked.length} selected</span>
          <Button size="sm" disabled={picked.length < 2} onClick={() => setShowCompare(true)}>
            Compare side by side
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Clear selection" onClick={() => setPicked([])}>
            <X />
          </Button>
        </div>
      )}

      {opened && <DesignDialog design={opened} onClose={() => setOpen(null)} />}

      <Dialog open={showCompare} onOpenChange={setShowCompare}>
        <DialogContent className="sm:max-w-6xl">
          <DialogTitle>Compare designs</DialogTitle>
          <DialogDescription className="sr-only">Selected designs side by side</DialogDescription>
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, comparing.length)}, minmax(0, 1fr))` }}
          >
            {comparing.map((d) => (
              <figure key={d.id} className="space-y-2">
                <div className="flex items-center justify-center rounded-lg bg-checker p-1">
                  <BlobImage id={d.imageId} alt={designLabel(d)} className="max-h-[60svh] w-full rounded object-contain" />
                </div>
                <figcaption className="flex items-center justify-between gap-2">
                  <span className="line-clamp-2 text-xs text-muted-foreground">{designLabel(d)}</span>
                  <Button
                    size="sm"
                    variant={d.chosen ? "secondary" : "default"}
                    onClick={() => {
                      choose(projectId, d.chosen ? null : d.id);
                      if (!d.chosen) setShowCompare(false);
                    }}
                  >
                    <Check /> {d.chosen ? "Chosen" : "Choose"}
                  </Button>
                </figcaption>
              </figure>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
