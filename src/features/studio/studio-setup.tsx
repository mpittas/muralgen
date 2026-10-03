"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BrickWall, Check, Images, Layers, Sparkles } from "lucide-react";
import { BlobImage } from "@/components/blob-image";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/format";
import { defaultSettings } from "@/lib/studio/render";
import { cn } from "@/lib/utils";
import { useAppStore, useComposites, useDesigns, useWalls } from "@/store/app-store";
import { designLabel } from "@/features/designs/design-card";

interface Props {
  projectId: string;
  initialWallId?: string;
  initialDesignId?: string;
}

/** Pick a wall + a design, then jump into the editor. */
export function StudioSetup({ projectId, initialWallId, initialDesignId }: Props) {
  const router = useRouter();
  const walls = useWalls(projectId);
  const designs = useDesigns(projectId).filter((d) => d.status === "ready");
  const composites = useComposites(projectId);
  const createComposite = useAppStore((s) => s.createComposite);
  const allDesigns = useAppStore((s) => s.designs);
  const allWalls = useAppStore((s) => s.walls);

  const [wallId, setWallId] = useState<string | null>(
    () =>
      (walls.find((w) => w.id === initialWallId) ?? (walls.length === 1 ? walls[0] : null))?.id ??
      null,
  );
  const [designId, setDesignId] = useState<string | null>(
    () =>
      (designs.find((d) => d.id === initialDesignId) ?? designs.find((d) => d.chosen))?.id ?? null,
  );

  const wall = walls.find((w) => w.id === wallId);
  const design = designs.find((d) => d.id === designId);

  const start = () => {
    if (!wall || !design) return;
    const composite = createComposite({
      projectId,
      wallId: wall.id,
      designId: design.id,
      name: `${wall.name} + ${designLabel(design).slice(0, 40)}`,
      settings: defaultSettings(wall.width / wall.height, design.width / design.height),
    });
    router.replace(`/projects/${projectId}/studio?c=${composite.id}`);
  };

  const missing = walls.length === 0 || designs.length === 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-6">
      <div>
        <h2 className="font-heading text-2xl font-bold">Studio</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Pick a wall and a design. In the editor you&apos;ll line the artwork up with the
          surface in perspective, mask around windows and pipes, and match the light.
        </p>
      </div>

      {missing && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed p-4 text-sm">
          <span className="flex-1 text-muted-foreground">
            {walls.length === 0 && designs.length === 0
              ? "You need at least one wall photo and one design to start."
              : walls.length === 0
                ? "Add a wall photo first."
                : "Add or generate a design first."}
          </span>
          {walls.length === 0 && (
            <Button asChild size="sm">
              <Link href={`/projects/${projectId}/walls`}>
                <BrickWall /> Add a wall
              </Link>
            </Button>
          )}
          {designs.length === 0 && (
            <Button asChild size="sm" variant={walls.length === 0 ? "outline" : "default"}>
              <Link href={`/projects/${projectId}/generate`}>
                <Sparkles /> Generate designs
              </Link>
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="pick-wall" className="space-y-3">
          <h3 id="pick-wall" className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              1
            </span>
            Wall
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {walls.map((w) => (
              <PickCard
                key={w.id}
                selected={w.id === wallId}
                onClick={() => setWallId(w.id)}
                thumbId={w.thumbId}
                label={w.name}
                aspect={w.width / w.height}
              />
            ))}
            {walls.length === 0 && <Placeholder icon={<BrickWall />} text="No walls yet" />}
          </div>
        </section>

        <section aria-labelledby="pick-design" className="space-y-3">
          <h3 id="pick-design" className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              2
            </span>
            Design
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {designs.map((d) => (
              <PickCard
                key={d.id}
                selected={d.id === designId}
                onClick={() => setDesignId(d.id)}
                thumbId={d.thumbId}
                label={designLabel(d)}
                aspect={d.width / d.height}
                badge={d.chosen ? "Chosen" : undefined}
              />
            ))}
            {designs.length === 0 && <Placeholder icon={<Images />} text="No designs yet" />}
          </div>
        </section>
      </div>

      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-2xl border bg-popover/95 p-3 shadow-xl backdrop-blur">
        <p className="min-w-0 truncate pl-1 text-sm text-muted-foreground">
          {wall && design
            ? `${wall.name}  +  ${designLabel(design)}`
            : "Select a wall and a design to continue"}
        </p>
        <Button size="lg" disabled={!wall || !design} onClick={start}>
          <Layers /> Open in studio <ArrowRight />
        </Button>
      </div>

      {composites.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Continue editing</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {composites.map((c) => (
              <Link
                key={c.id}
                href={`/projects/${projectId}/studio?c=${c.id}`}
                className="group overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-lg hover:shadow-black/10"
              >
                <div className="aspect-[4/3] bg-muted">
                  {c.thumbId ? (
                    <BlobImage id={c.thumbId} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="bg-brick size-full" />
                  )}
                </div>
                <div className="p-2.5">
                  <p className="truncate text-sm font-medium">
                    {allWalls[c.wallId]?.name ?? "Wall"} ·{" "}
                    {allDesigns[c.designId] ? designLabel(allDesigns[c.designId]) : "Design"}
                  </p>
                  <p className="text-xs text-muted-foreground">Edited {timeAgo(c.updatedAt)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function PickCard({
  selected,
  onClick,
  thumbId,
  label,
  aspect,
  badge,
}: {
  selected: boolean;
  onClick: () => void;
  thumbId?: string;
  label: string;
  aspect: number;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card text-left transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
        selected ? "border-primary ring-2 ring-primary" : "hover:border-foreground/30",
      )}
    >
      <div className="flex aspect-[4/3] items-center justify-center bg-muted">
        <BlobImage
          id={thumbId}
          alt=""
          style={{ aspectRatio: aspect }}
          className="max-h-full max-w-full object-cover"
        />
      </div>
      <p className="truncate px-2.5 py-2 text-xs font-medium">{label}</p>
      {badge && (
        <span className="absolute top-2 left-2 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
          {badge}
        </span>
      )}
      {selected && (
        <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" />
        </span>
      )}
    </button>
  );
}

function Placeholder({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="col-span-full flex items-center justify-center gap-2 rounded-xl border border-dashed py-10 text-sm text-muted-foreground">
      {icon} {text}
    </div>
  );
}
