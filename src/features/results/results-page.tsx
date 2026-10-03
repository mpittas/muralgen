"use client";

/* eslint-disable @next/next/no-img-element -- blob: URLs can't go through next/image */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Copy,
  Download,
  Grid3x3,
  ImageIcon,
  Layers,
  LoaderCircle,
  Pencil,
  SprayCan,
  Star,
  Trash,
} from "lucide-react";
import { toast } from "sonner";
import { BlobImage } from "@/components/blob-image";
import { CompareSlider } from "@/components/compare-slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useBlobUrl } from "@/hooks/use-blob-url";
import { useHydrated } from "@/hooks/use-hydrated";
import { getBlob, newId, putBlob } from "@/lib/blob-store";
import { downloadBlob, formatArea, slugify, timeAgo } from "@/lib/format";
import { extractPalette, type PaletteColor } from "@/lib/image-utils";
import { renderCompositeBlob } from "@/lib/studio/export";
import type { Composite, Design, Wall } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore, useComposites } from "@/store/app-store";
import { designLabel } from "@/features/designs/design-card";

type Mode = "compare" | "result" | "grid";

export function ResultsPage({ projectId }: { projectId: string }) {
  const hydrated = useHydrated();
  const composites = useComposites(projectId);
  const walls = useAppStore((s) => s.walls);
  const designs = useAppStore((s) => s.designs);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const results = useMemo(() => composites.filter((c) => c.resultId), [composites]);
  const selected = results.find((c) => c.id === selectedId) ?? results[0];

  if (!hydrated) {
    return (
      <div className="grid gap-6 p-6 xl:grid-cols-[1fr_22rem]">
        <Skeleton className="aspect-video" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-6 py-24 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ImageIcon />
        </span>
        <h2 className="font-heading text-2xl font-bold">No previews yet</h2>
        <p className="text-sm text-muted-foreground">
          Apply a design to a wall in the studio and your previews show up here — with a
          before/after slider, a paint plan and a transfer grid.
        </p>
        <Button asChild>
          <Link href={`/projects/${projectId}/studio`}>
            <Layers /> Open the studio
          </Link>
        </Button>
      </div>
    );
  }

  const wall = selected ? walls[selected.wallId] : undefined;
  const design = selected ? designs[selected.designId] : undefined;

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 p-4 sm:p-6 xl:grid-cols-[1fr_22rem]">
      <div className="min-w-0 space-y-4">
        {selected && wall && design && (
          <Viewer key={selected.id} composite={selected} wall={wall} design={design} />
        )}

        <div>
          <h3 className="mb-2 text-sm font-semibold">All previews ({results.length})</h3>
          <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-2">
            {results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                aria-pressed={c.id === selected?.id}
                className={cn(
                  "w-44 shrink-0 overflow-hidden rounded-xl border bg-card text-left outline-none transition-all focus-visible:ring-3 focus-visible:ring-ring/60",
                  c.id === selected?.id ? "border-primary ring-2 ring-primary" : "hover:border-foreground/30",
                )}
              >
                <div className="aspect-[4/3] bg-muted">
                  <BlobImage id={c.thumbId} alt="" className="size-full object-cover" />
                </div>
                <div className="px-2.5 py-2">
                  <p className="truncate text-xs font-medium">
                    {designs[c.designId] ? designLabel(designs[c.designId]) : "Design"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{timeAgo(c.updatedAt)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {selected && wall && design && (
        <aside className="space-y-6 xl:sticky xl:top-4 xl:h-fit">
          <Details composite={selected} wall={wall} design={design} onDeleted={() => setSelectedId(null)} />
          <PaintPlan key={design.id + selected.id} composite={selected} wall={wall} design={design} />
        </aside>
      )}
    </div>
  );
}

/* ------------------------------- viewer -------------------------------- */

function Viewer({
  composite,
  wall,
  design,
}: {
  composite: Composite;
  wall: Wall;
  design: Design;
}) {
  const [mode, setMode] = useState<Mode>("compare");
  const [cell, setCell] = useState(1);
  const wallUrl = useBlobUrl(wall.imageId);
  const resultUrl = useBlobUrl(composite.resultId);
  const designUrl = useBlobUrl(design.imageId);
  const aspect = wall.width / wall.height;

  const q = composite.settings.quad;
  const xs = q.map((p) => p.x);
  const ys = q.map((p) => p.y);
  const spanX = Math.max(0, Math.min(1, Math.max(...xs)) - Math.max(0, Math.min(...xs)));
  const spanY = Math.max(0, Math.min(1, Math.max(...ys)) - Math.max(0, Math.min(...ys)));
  const designWm = wall.widthM ? wall.widthM * spanX : undefined;
  const designHm = wall.heightM ? wall.heightM * spanY : undefined;
  const hasDims = !!(designWm && designHm);
  const cols = hasDims ? Math.min(40, Math.max(1, Math.ceil(designWm! / cell))) : 10;
  const rows = hasDims
    ? Math.min(40, Math.max(1, Math.ceil(designHm! / cell)))
    : Math.max(1, Math.round(10 / (design.width / design.height)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={mode}
          onValueChange={(v) => v && setMode(v as Mode)}
        >
          <ToggleGroupItem value="compare">Before / after</ToggleGroupItem>
          <ToggleGroupItem value="result">Preview</ToggleGroupItem>
          <ToggleGroupItem value="grid">
            <Grid3x3 className="size-3.5" /> Transfer grid
          </ToggleGroupItem>
        </ToggleGroup>
        {mode === "grid" && (
          <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            Cell size
            <Input
              type="number"
              min={0.1}
              step={0.1}
              value={cell}
              onChange={(e) => setCell(Math.max(0.1, Number(e.target.value) || 1))}
              disabled={!hasDims}
              className="h-8 w-20"
            />
            m
          </label>
        )}
      </div>

      {mode === "compare" &&
        (wallUrl && resultUrl ? (
          <CompareSlider
            beforeSrc={wallUrl}
            afterSrc={resultUrl}
            aspectRatio={aspect}
            className="max-h-[70svh]"
          />
        ) : (
          <Skeleton className="aspect-video rounded-xl" />
        ))}

      {mode === "result" &&
        (resultUrl ? (
          <div className="flex justify-center rounded-xl bg-checker">
            <img src={resultUrl} alt="Preview" className="max-h-[70svh] w-auto max-w-full rounded-xl object-contain" />
          </div>
        ) : (
          <Skeleton className="aspect-video rounded-xl" />
        ))}

      {mode === "grid" && (
        <div className="space-y-2">
          <div className="flex justify-center rounded-xl bg-checker p-3">
            <div
              className="relative"
              style={{
                aspectRatio: design.width / design.height,
                width: `min(100%, calc(62svh * ${design.width / design.height}))`,
              }}
            >
              {designUrl && (
                <img src={designUrl} alt="Design with grid" draggable={false} className="absolute inset-0 size-full object-fill" />
              )}
              <GridOverlay cols={cols} rows={rows} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {hasDims
              ? `The artwork spans about ${designWm!.toFixed(1)} × ${designHm!.toFixed(1)} m on the wall → ${cols} × ${rows} cells of ${cell} m. Chalk the same grid on the wall and copy square by square.`
              : "Add the wall's real size on the Walls page to get a grid in metres. Showing a 10-column placeholder grid."}
          </p>
        </div>
      )}
    </div>
  );
}

function GridOverlay({ cols, rows }: { cols: number; rows: number }) {
  const letters = (i: number) => {
    let s = "";
    let n = i;
    do {
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return s;
  };
  return (
    <div className="pointer-events-none absolute inset-0">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="size-full">
        {Array.from({ length: cols + 1 }, (_, i) => (
          <line key={`v${i}`} x1={(i / cols) * 100} y1={0} x2={(i / cols) * 100} y2={100} stroke="white" strokeWidth={1.2} vectorEffect="non-scaling-stroke" opacity={0.85} />
        ))}
        {Array.from({ length: rows + 1 }, (_, i) => (
          <line key={`h${i}`} x1={0} y1={(i / rows) * 100} x2={100} y2={(i / rows) * 100} stroke="white" strokeWidth={1.2} vectorEffect="non-scaling-stroke" opacity={0.85} />
        ))}
        {Array.from({ length: cols + 1 }, (_, i) => (
          <line key={`vs${i}`} x1={(i / cols) * 100} y1={0} x2={(i / cols) * 100} y2={100} stroke="black" strokeWidth={0.5} vectorEffect="non-scaling-stroke" opacity={0.5} />
        ))}
        {Array.from({ length: rows + 1 }, (_, i) => (
          <line key={`hs${i}`} x1={0} y1={(i / rows) * 100} x2={100} y2={(i / rows) * 100} stroke="black" strokeWidth={0.5} vectorEffect="non-scaling-stroke" opacity={0.5} />
        ))}
      </svg>
      {cols <= 26 && rows <= 26 && (
        <>
          <div className="absolute inset-x-0 top-0 flex">
            {Array.from({ length: cols }, (_, i) => (
              <span key={i} className="flex-1 pt-0.5 text-center text-[10px] font-semibold text-white [text-shadow:0_0_3px_black]">
                {letters(i)}
              </span>
            ))}
          </div>
          <div className="absolute inset-y-0 left-0 flex flex-col">
            {Array.from({ length: rows }, (_, i) => (
              <span key={i} className="flex flex-1 items-center pl-1 text-[10px] font-semibold text-white [text-shadow:0_0_3px_black]">
                {i + 1}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------- details ------------------------------- */

function Details({
  composite,
  wall,
  design,
  onDeleted,
}: {
  composite: Composite;
  wall: Wall;
  design: Design;
  onDeleted: () => void;
}) {
  const update = useAppStore((s) => s.updateComposite);
  const updateProject = useAppStore((s) => s.updateProject);
  const addComposite = useAppStore((s) => s.addComposite);
  const remove = useAppStore((s) => s.removeComposite);
  const coverId = useAppStore((s) => s.projects[composite.projectId]?.coverCompositeId);
  const [name, setName] = useState(composite.name);
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const blob = await renderCompositeBlob(composite, wall, design, { type: "image/png" });
      downloadBlob(blob, `${slugify(composite.name)}.png`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setDownloading(false);
    }
  };

  const duplicate = async () => {
    const id = newId("cmp");
    const now = Date.now();
    const copy: Composite = {
      ...composite,
      id,
      name: `${composite.name} copy`,
      settings: { ...composite.settings, quad: composite.settings.quad.map((p) => ({ ...p })) as Composite["settings"]["quad"] },
      maskId: undefined,
      resultId: undefined,
      thumbId: undefined,
      createdAt: now,
      updatedAt: now,
    };
    const [mask, result, thumb] = await Promise.all([
      composite.maskId ? getBlob(composite.maskId) : undefined,
      composite.resultId ? getBlob(composite.resultId) : undefined,
      composite.thumbId ? getBlob(composite.thumbId) : undefined,
    ]);
    if (mask) {
      copy.maskId = newId("msk");
      await putBlob(copy.maskId, mask);
    }
    if (result) {
      copy.resultId = newId("res");
      await putBlob(copy.resultId, result);
    }
    if (thumb) {
      copy.thumbId = newId("thm");
      await putBlob(copy.thumbId, thumb);
    }
    addComposite(copy);
    toast.success("Duplicated — find it in the list below the preview");
  };

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4">
      <div className="space-y-1.5">
        <label htmlFor="cmp-name" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Name
        </label>
        <div className="flex gap-2">
          <Input
            id="cmp-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== composite.name && update(composite.id, { name: name.trim() })}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {wall.name} · {designLabel(design).slice(0, 40)} · {timeAgo(composite.updatedAt)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button asChild>
          <Link href={`/projects/${composite.projectId}/studio?c=${composite.id}`}>
            <Pencil /> Edit
          </Link>
        </Button>
        <Button variant="outline" onClick={download} disabled={downloading}>
          {downloading ? <LoaderCircle className="animate-spin" /> : <Download />}
          Download
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            updateProject(composite.projectId, { coverCompositeId: composite.id });
            toast.success("Set as project cover");
          }}
          disabled={coverId === composite.id}
        >
          <Star className={cn(coverId === composite.id && "fill-primary text-primary")} />
          {coverId === composite.id ? "Cover" : "Set as cover"}
        </Button>
        <Button variant="outline" onClick={() => void duplicate()}>
          <Copy /> Duplicate
        </Button>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full text-destructive hover:text-destructive"
        onClick={() => {
          remove(composite.id);
          onDeleted();
          toast("Preview deleted");
        }}
      >
        <Trash /> Delete preview
      </Button>
    </section>
  );
}

/* ------------------------------ paint plan ----------------------------- */

const COVERAGE_OPTIONS = [1.5, 2, 3];

function PaintPlan({
  composite,
  wall,
  design,
}: {
  composite: Composite;
  wall: Wall;
  design: Design;
}) {
  const [palette, setPalette] = useState<PaletteColor[] | null>(null);
  const [coverage, setCoverage] = useState(2);
  const [coats, setCoats] = useState(2);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const blob = design.imageId ? await getBlob(design.imageId) : undefined;
      if (!blob) return;
      const colors = await extractPalette(blob, 6);
      if (!cancelled) setPalette(colors);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [design.imageId]);

  // Area painted = bounding box of the placed artwork (clipped to the wall) in m².
  const q = composite.settings.quad;
  const xs = q.map((p) => p.x);
  const ys = q.map((p) => p.y);
  const spanX = Math.max(0, Math.min(1, Math.max(...xs)) - Math.max(0, Math.min(...xs)));
  const spanY = Math.max(0, Math.min(1, Math.max(...ys)) - Math.max(0, Math.min(...ys)));
  const area = wall.widthM && wall.heightM ? wall.widthM * wall.heightM * spanX * spanY : null;
  const rawCans = area ? (area * coats * 1.15) / coverage : 0;
  const cansFor = (share: number) => Math.max(1, Math.ceil(rawCans * share));
  // Total = what you'd actually buy: the per-colour counts added up.
  const totalCans = palette ? palette.reduce((n, c) => n + cansFor(c.share), 0) : Math.ceil(rawCans);

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <SprayCan className="size-4 text-spray-orange" />
        <h3 className="font-heading font-semibold">Paint plan</h3>
      </div>

      {!palette ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : (
        <ul className="space-y-1.5">
          {palette.map((c) => (
            <li key={c.hex} className="flex items-center gap-3 text-sm">
              <span className="size-7 shrink-0 rounded-md border" style={{ background: c.hex }} />
              <button
                type="button"
                className="font-mono text-xs uppercase hover:underline"
                title="Copy hex"
                onClick={() => {
                  void navigator.clipboard.writeText(c.hex);
                  toast.success(`${c.hex} copied`);
                }}
              >
                {c.hex}
              </button>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {Math.round(c.share * 100)}%
              </span>
              {area && (
                <span className="w-16 text-right text-xs font-medium tabular-nums">
                  {cansFor(c.share)} cans
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {area ? (
        <div className="space-y-3 rounded-xl bg-muted/50 p-3 text-xs">
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">Painted area</span>
            <span className="font-medium">{formatArea(area, 1)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Coats</span>
            <ToggleGroup type="single" size="sm" variant="outline" value={String(coats)} onValueChange={(v) => v && setCoats(Number(v))}>
              <ToggleGroupItem value="1">1</ToggleGroupItem>
              <ToggleGroupItem value="2">2</ToggleGroupItem>
              <ToggleGroupItem value="3">3</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">m² per can</span>
            <ToggleGroup type="single" size="sm" variant="outline" value={String(coverage)} onValueChange={(v) => v && setCoverage(Number(v))}>
              {COVERAGE_OPTIONS.map((c) => (
                <ToggleGroupItem key={c} value={String(c)}>
                  {c}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="flex items-baseline justify-between border-t pt-2 text-sm">
            <span>Estimated total</span>
            <span className="font-heading text-lg font-bold">≈ {totalCans} cans</span>
          </div>
          <p className="text-[11px] text-pretty text-muted-foreground">
            Rough guide: includes 15% spare, and colours are shared by how much of the artwork
            they cover. Real coverage depends on the surface and paint.
          </p>
        </div>
      ) : (
        <p className="rounded-xl bg-muted/50 p-3 text-xs text-pretty text-muted-foreground">
          Add the wall&apos;s real width and height on the{" "}
          <Link href={`/projects/${composite.projectId}/walls`} className="underline underline-offset-2">
            Walls page
          </Link>{" "}
          to estimate how many cans of each colour you&apos;ll need.
        </p>
      )}
    </section>
  );
}
