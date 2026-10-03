"use client";

import { useRouter } from "next/navigation";
import {
  Check,
  CircleAlert,
  Copy,
  Download,
  Expand,
  Heart,
  Layers,
  LoaderCircle,
  RotateCcw,
  Trash,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { BlobImage } from "@/components/blob-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { getBlob } from "@/lib/blob-store";
import { cancelGeneration, retryGeneration, useGenStatus } from "@/lib/generation-queue";
import { getProvider } from "@/lib/providers";
import { downloadBlob, slugify, timeAgo } from "@/lib/format";
import { getPalette, getStyle } from "@/lib/presets";
import type { Design } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { useGeneratorStore } from "@/features/generate/generator-store";

export const designLabel = (d: Design) =>
  d.title || d.prompt || "Untitled design";

export async function downloadDesign(d: Design) {
  const blob = d.imageId ? await getBlob(d.imageId) : undefined;
  if (!blob) {
    toast.error("Image not found in local storage.");
    return;
  }
  const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
  downloadBlob(blob, `${slugify(designLabel(d)).slice(0, 48)}-${d.seed || d.id.slice(-4)}.${ext}`);
}

export function useDesignActions(design: Design) {
  const router = useRouter();
  const toggleFav = useAppStore((s) => s.updateDesign);
  const choose = useAppStore((s) => s.chooseDesign);
  const remove = useAppStore((s) => s.removeDesign);

  return {
    toggleFavorite: () => toggleFav(design.id, { favorite: !design.favorite }),
    toggleChosen: () => {
      choose(design.projectId, design.chosen ? null : design.id);
      if (!design.chosen) {
        toast.success("Design chosen for the wall", {
          action: {
            label: "Open studio",
            onClick: () =>
              router.push(`/projects/${design.projectId}/studio?design=${design.id}`),
          },
        });
      }
    },
    remove: () => {
      remove(design.id);
      toast("Design deleted");
    },
    openStudio: () =>
      router.push(`/projects/${design.projectId}/studio?design=${design.id}`),
  };
}

/** A grid tile covering all design states: waiting, generating, failed, ready. */
export function DesignTile({
  design,
  onOpen,
  className,
}: {
  design: Design;
  onOpen?: () => void;
  className?: string;
}) {
  const status = useGenStatus((s) => s.byId[design.id]);
  const actions = useDesignActions(design);
  const aspect = design.width / design.height;

  if (design.status === "pending") {
    return (
      <div
        style={{ aspectRatio: aspect }}
        className={cn(
          "relative flex min-h-48 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border bg-muted p-4 text-center",
          className,
        )}
      >
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-foreground/5 to-transparent" />
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
        <p className="text-sm font-medium">
          {status?.phase === "queued"
            ? "Up next"
            : status?.phase === "waiting"
              ? "In line…"
              : "Painting…"}
        </p>
        <p className="max-w-[16rem] text-xs text-pretty text-muted-foreground">
          {status?.message ??
            (status?.phase === "queued"
              ? "Starts as soon as a slot frees up."
              : "Free models can take a minute or two.")}
        </p>
        <Button
          size="xs"
          variant="ghost"
          className="relative"
          onClick={() => cancelGeneration(design.id)}
        >
          <X /> Cancel
        </Button>
      </div>
    );
  }

  if (design.status === "error") {
    return (
      <div
        style={{ aspectRatio: aspect }}
        className={cn(
          "flex min-h-56 flex-col items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center",
          className,
        )}
      >
        <CircleAlert className="size-5 text-destructive" />
        <p className="text-sm font-medium">Generation failed</p>
        <p className="max-w-[18rem] text-xs text-pretty text-muted-foreground">
          {design.error ?? "Something went wrong."}
        </p>
        <div className="flex flex-wrap justify-center gap-1.5">
          <Button size="xs" variant="outline" onClick={() => retryGeneration(design.id)}>
            <RotateCcw /> Retry
          </Button>
          {design.providerId !== "ai-horde" && design.source === "ai" && (
            <Button size="xs" variant="outline" onClick={() => retryGeneration(design.id, "ai-horde")}>
              <Wand2 /> Try {getProvider("ai-horde").name.split(" (")[0]}
            </Button>
          )}
          <Button size="xs" variant="ghost" onClick={actions.remove}>
            <Trash /> Dismiss
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-muted",
        design.chosen && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        className,
      )}
      style={{ aspectRatio: aspect }}
    >
      <BlobImage
        id={design.thumbId ?? design.imageId}
        alt={designLabel(design)}
        className="size-full object-cover"
      />
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${designLabel(design)}`}
        className="absolute inset-0 cursor-zoom-in outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2">
        <div className="flex gap-1">
          {design.chosen && (
            <Badge className="pointer-events-auto gap-1">
              <Check className="size-3" /> Chosen
            </Badge>
          )}
          {design.source !== "ai" && (
            <Badge variant="secondary" className="bg-black/55 text-white backdrop-blur">
              {design.source === "upload" ? (
                <Upload className="size-3" />
              ) : null}
              {design.source === "upload" ? "Uploaded" : "Sample"}
            </Badge>
          )}
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={design.favorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={design.favorite}
          onClick={actions.toggleFavorite}
          className={cn(
            "pointer-events-auto bg-black/45 text-white backdrop-blur hover:bg-black/65 hover:text-white",
            !design.favorite && "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
          )}
        >
          <Heart className={cn(design.favorite && "fill-spray-pink text-spray-pink")} />
        </Button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-1 items-center gap-1.5 bg-gradient-to-t from-black/75 via-black/40 to-transparent p-2 pt-10 opacity-0 transition-all group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100">
        <Button
          size="sm"
          variant={design.chosen ? "secondary" : "default"}
          className="pointer-events-auto"
          onClick={actions.toggleChosen}
        >
          <Check /> {design.chosen ? "Unchoose" : "Choose"}
        </Button>
        <Button
          size="icon-sm"
          variant="secondary"
          aria-label="Download"
          className="pointer-events-auto ml-auto"
          onClick={() => void downloadDesign(design)}
        >
          <Download />
        </Button>
        <Button
          size="icon-sm"
          variant="secondary"
          aria-label="Expand"
          className="pointer-events-auto"
          onClick={onOpen}
        >
          <Expand />
        </Button>
      </div>
    </div>
  );
}

/** Large preview with all metadata and actions. */
export function DesignDialog({
  design,
  onClose,
  onRemix,
}: {
  design: Design;
  onClose: () => void;
  onRemix?: () => void;
}) {
  const actions = useDesignActions(design);
  const style = getStyle(design.styleId);
  const palette = getPalette(design.paletteId);
  const setDraft = useGeneratorStore((s) => s.setDraft);
  const router = useRouter();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogTitle className="sr-only">{designLabel(design)}</DialogTitle>
        <DialogDescription className="sr-only">Design preview and details</DialogDescription>
        <div className="grid max-h-[88svh] md:grid-cols-[1fr_20rem]">
          <div className="flex min-h-64 items-center justify-center bg-checker p-2">
            <BlobImage
              id={design.imageId}
              alt={designLabel(design)}
              className="max-h-[80svh] w-full rounded-lg object-contain"
            />
          </div>
          <div className="flex flex-col gap-4 overflow-y-auto p-5">
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {design.source === "ai" ? "Prompt" : "Title"}
              </p>
              <p className="mt-1 text-sm text-pretty">{designLabel(design)}</p>
            </div>

            {design.source === "ai" && (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <Meta label="Style" value={style.name} />
                <Meta
                  label="Palette"
                  value={
                    <span className="flex items-center gap-1.5">
                      {palette.colors.map((c) => (
                        <span key={c} className="size-3 rounded-full border" style={{ background: c }} />
                      ))}
                      {palette.name}
                    </span>
                  }
                />
                <Meta label="Size" value={`${design.width}×${design.height}`} />
                <Meta label="Seed" value={design.seed} />
                <Meta label="Provider" value={design.providerId} />
                <Meta label="Created" value={timeAgo(design.createdAt)} />
              </dl>
            )}

            <div className="mt-auto grid gap-2">
              <Button onClick={actions.toggleChosen} variant={design.chosen ? "secondary" : "default"}>
                <Check /> {design.chosen ? "Chosen for the wall" : "Choose for the wall"}
              </Button>
              <Button variant="outline" onClick={actions.openStudio}>
                <Layers /> Apply in studio
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={actions.toggleFavorite}>
                  <Heart className={cn(design.favorite && "fill-spray-pink text-spray-pink")} />
                  {design.favorite ? "Favorited" : "Favorite"}
                </Button>
                <Button variant="outline" onClick={() => void downloadDesign(design)}>
                  <Download /> Download
                </Button>
              </div>
              {design.source === "ai" && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setDraft({
                        prompt: design.prompt,
                        styleId: design.styleId,
                        paletteId: design.paletteId,
                        wallId: design.wallId ?? null,
                      });
                      onRemix?.();
                      onClose();
                      router.push(`/projects/${design.projectId}/generate`);
                    }}
                  >
                    <Wand2 /> Remix
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      void navigator.clipboard.writeText(design.fullPrompt);
                      toast.success("Full prompt copied");
                    }}
                  >
                    <Copy /> Copy prompt
                  </Button>
                </div>
              )}
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  actions.remove();
                  onClose();
                }}
              >
                <Trash /> Delete
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate font-medium">{value}</dd>
    </div>
  );
}
