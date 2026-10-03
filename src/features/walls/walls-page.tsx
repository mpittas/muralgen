"use client";

import { useState } from "react";
import Link from "next/link";
import { BrickWall, Layers, Lightbulb, Pencil, Ruler, Trash } from "lucide-react";
import { toast } from "sonner";
import { BlobImage } from "@/components/blob-image";
import { Dropzone } from "@/components/dropzone";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addSampleWall, uploadWalls } from "@/lib/actions";
import { formatArea, gcdRatio } from "@/lib/format";
import type { Wall, WallSurface } from "@/lib/types";
import { useAppStore, useWalls } from "@/store/app-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { Skeleton } from "@/components/ui/skeleton";

const SURFACES: { value: WallSurface; label: string }[] = [
  { value: "brick", label: "Brick" },
  { value: "concrete", label: "Concrete" },
  { value: "plaster", label: "Plaster / render" },
  { value: "metal", label: "Metal / shutter" },
  { value: "wood", label: "Wood" },
  { value: "other", label: "Other" },
];

const TIPS = [
  "Shoot straight-on, from as far back as you can, to limit perspective distortion.",
  "Even daylight works best — avoid harsh shadows across the surface.",
  "Include the edges, ground and any obstacles (windows, pipes, doors).",
  "Add the real wall size so we can estimate paint later.",
];

export function WallsPage({ projectId }: { projectId: string }) {
  const hydrated = useHydrated();
  const walls = useWalls(projectId);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Wall | null>(null);
  const [deleting, setDeleting] = useState<Wall | null>(null);
  const removeWall = useAppStore((s) => s.removeWall);

  const onFiles = async (files: File[]) => {
    setBusy(true);
    try {
      const added = await uploadWalls(projectId, files);
      toast.success(`${added.length} wall photo${added.length === 1 ? "" : "s"} added`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const onSample = async () => {
    setBusy(true);
    try {
      await addSampleWall(projectId);
      toast.success("Sample wall added");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl font-bold">Wall photos</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            The real surface you&apos;re going to paint. Add one photo per wall — or several
            angles of the same one.
          </p>
        </div>
        <Button variant="outline" onClick={onSample} disabled={busy}>
          <BrickWall /> Add sample wall
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-5">
          <Dropzone
            onFiles={onFiles}
            busy={busy}
            title="Drop wall photos here"
            hint="JPG, PNG or WebP — or click to browse"
            compact={walls.length > 0}
          />

          {!hydrated ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="aspect-[4/3] rounded-xl" />
              <Skeleton className="aspect-[4/3] rounded-xl" />
            </div>
          ) : (
            walls.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {walls.map((wall) => (
                  <WallCard
                    key={wall.id}
                    wall={wall}
                    onEdit={() => setEditing(wall)}
                    onDelete={() => setDeleting(wall)}
                  />
                ))}
              </div>
            )
          )}
        </div>

        <aside className="h-fit rounded-xl border bg-card p-4 text-sm lg:sticky lg:top-4">
          <h3 className="mb-3 flex items-center gap-2 font-heading font-semibold">
            <Lightbulb className="size-4 text-spray-orange" /> Photo tips
          </h3>
          <ul className="space-y-2.5 text-muted-foreground">
            {TIPS.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-primary" />
                {t}
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {editing && <WallDialog key={editing.id} wall={editing} onClose={() => setEditing(null)} />}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The photo and any compositions made on this wall will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) removeWall(deleting.id);
                setDeleting(null);
                toast.success("Wall deleted");
              }}
            >
              Delete wall
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function WallCard({
  wall,
  onEdit,
  onDelete,
}: {
  wall: Wall;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const area = formatArea(wall.widthM, wall.heightM);
  return (
    <article className="group overflow-hidden rounded-xl border bg-card">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <BlobImage id={wall.thumbId} alt={wall.name} className="size-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 flex gap-1.5 bg-gradient-to-t from-black/60 to-transparent p-2.5 pt-8">
          <Badge variant="secondary" className="bg-black/50 text-white backdrop-blur">
            {wall.width}×{wall.height}
          </Badge>
          <Badge variant="secondary" className="bg-black/50 text-white backdrop-blur">
            {gcdRatio(wall.width, wall.height)}
          </Badge>
        </div>
      </div>
      <div className="space-y-3 p-3">
        <div>
          <h3 className="truncate text-sm font-medium">{wall.name}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Ruler className="size-3" />
            {area ? `${wall.widthM}×${wall.heightM} m · ${area}` : "Add real-world size"}
            <span aria-hidden>·</span>
            <span className="capitalize">{wall.surface}</span>
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button asChild size="sm" className="flex-1">
            <Link href={`/projects/${wall.projectId}/studio?wall=${wall.id}`}>
              <Layers /> Use in studio
            </Link>
          </Button>
          <Button size="icon-sm" variant="outline" aria-label="Edit wall details" onClick={onEdit}>
            <Pencil />
          </Button>
          <Button size="icon-sm" variant="outline" aria-label="Delete wall" onClick={onDelete}>
            <Trash />
          </Button>
        </div>
      </div>
    </article>
  );
}

function WallDialog({ wall, onClose }: { wall: Wall; onClose: () => void }) {
  const updateWall = useAppStore((s) => s.updateWall);
  const [name, setName] = useState(wall.name);
  const [w, setW] = useState(wall.widthM?.toString() ?? "");
  const [h, setH] = useState(wall.heightM?.toString() ?? "");
  const [surface, setSurface] = useState<WallSurface>(wall.surface);
  const [notes, setNotes] = useState(wall.notes);

  const num = (v: string) => {
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Wall details</DialogTitle>
          <DialogDescription>
            Real-world measurements power the paint plan and the grid overlay.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 sm:grid-cols-[1fr_16rem]">
          <div className="overflow-hidden rounded-lg border bg-muted">
            <BlobImage id={wall.imageId} alt={wall.name} className="max-h-[22rem] w-full object-contain" />
          </div>
          <div className="grid content-start gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="wall-name">Name</Label>
              <Input id="wall-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="wall-w">Width (m)</Label>
                <Input id="wall-w" inputMode="decimal" placeholder="e.g. 8" value={w} onChange={(e) => setW(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wall-h">Height (m)</Label>
                <Input id="wall-h" inputMode="decimal" placeholder="e.g. 4.5" value={h} onChange={(e) => setH(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Surface</Label>
              <Select value={surface} onValueChange={(v) => setSurface(v as WallSurface)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SURFACES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wall-notes">Notes</Label>
              <Textarea id="wall-notes" rows={3} placeholder="Access, permits, obstacles…" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              updateWall(wall.id, {
                name: name.trim() || wall.name,
                widthM: num(w),
                heightM: num(h),
                surface,
                notes,
              });
              onClose();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
