"use client";

import Link from "next/link";
import { Download, FlipVertical, Frame, GalleryVerticalEnd, LoaderCircle, RotateCcw, Sparkles, SquareDashed } from "lucide-react";
import { BlobImage } from "@/components/blob-image";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { DEFAULT_ADJUSTMENTS } from "@/lib/studio/render";
import type { BlendMode, CompositeSettings, Design } from "@/lib/types";
import { designLabel } from "@/features/designs/design-card";

const BLENDS: { value: BlendMode; label: string; hint: string }[] = [
  { value: "source-over", label: "Normal", hint: "Paint covers the wall" },
  { value: "multiply", label: "Multiply", hint: "Darkens — keeps wall shadows & grime" },
  { value: "overlay", label: "Overlay", hint: "Punchy, keeps wall contrast" },
  { value: "soft-light", label: "Soft light", hint: "Gentle, subtle tint" },
  { value: "hard-light", label: "Hard light", hint: "Strong, high-contrast tint" },
];

interface Props {
  projectId: string;
  settings: CompositeSettings;
  onChange: (patch: Partial<CompositeSettings>) => void;
  designs: Design[];
  design: Design;
  wallName: string;
  onSwapDesign: (id: string) => void;
  onFitWall: () => void;
  onResetPlacement: () => void;
  onInvertMask: () => void;
  onResetMask: () => void;
  onExport: () => void;
  exporting: boolean;
}

export function StudioInspector(p: Props) {
  const s = p.settings;
  return (
    <div className="flex h-full flex-col">
      <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto p-4">
        <Block title="Artwork">
          <div className="flex items-center gap-3">
            <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg border bg-muted">
              <BlobImage id={p.design.thumbId} alt="" className="size-full object-cover" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{designLabel(p.design)}</p>
              <p className="truncate text-xs text-muted-foreground">on {p.wallName}</p>
            </div>
          </div>
          {p.designs.length > 1 && (
            <Select value={p.design.id} onValueChange={p.onSwapDesign}>
              <SelectTrigger className="w-full" aria-label="Swap design">
                <SelectValue placeholder="Swap design" />
              </SelectTrigger>
              <SelectContent>
                {p.designs.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {designLabel(d).slice(0, 44)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Block>

        <Block title="Placement" hint="Drag the corners in the canvas to match the wall's perspective.">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={p.onFitWall}>
              <Frame /> Fit to wall
            </Button>
            <Button variant="outline" size="sm" onClick={p.onResetPlacement}>
              <RotateCcw /> Reset
            </Button>
          </div>
          <Field label="Trim edges" value={`${Math.round(s.trim * 100)}%`} hint="Crops borders or stray logos off the artwork">
            <Slider min={0} max={0.2} step={0.005} value={[s.trim]} onValueChange={([v]) => p.onChange({ trim: v })} />
          </Field>
        </Block>

        <Block title="Blend">
          <Select value={s.blend} onValueChange={(v) => p.onChange({ blend: v as BlendMode })}>
            <SelectTrigger className="w-full" aria-label="Blend mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BLENDS.map((b) => (
                <SelectItem key={b.value} value={b.value}>
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {BLENDS.find((b) => b.value === s.blend)?.hint}
          </p>
          <Field label="Opacity" value={`${Math.round(s.opacity * 100)}%`}>
            <Slider min={0.05} max={1} step={0.01} value={[s.opacity]} onValueChange={([v]) => p.onChange({ opacity: v })} />
          </Field>
          <Field label="Wall texture" value={`${Math.round(s.texture * 100)}%`} hint="Brings the brick, grain and light back through the paint">
            <Slider min={0} max={1} step={0.01} value={[s.texture]} onValueChange={([v]) => p.onChange({ texture: v })} />
          </Field>
        </Block>

        <Block
          title="Colour"
          action={
            <Button
              variant="ghost"
              size="xs"
              onClick={() =>
                p.onChange({
                  brightness: DEFAULT_ADJUSTMENTS.brightness,
                  contrast: DEFAULT_ADJUSTMENTS.contrast,
                  saturation: DEFAULT_ADJUSTMENTS.saturation,
                })
              }
            >
              Reset
            </Button>
          }
        >
          <Field label="Brightness" value={`${Math.round(s.brightness * 100)}%`}>
            <Slider min={0.5} max={1.5} step={0.01} value={[s.brightness]} onValueChange={([v]) => p.onChange({ brightness: v })} />
          </Field>
          <Field label="Contrast" value={`${Math.round(s.contrast * 100)}%`}>
            <Slider min={0.5} max={1.5} step={0.01} value={[s.contrast]} onValueChange={([v]) => p.onChange({ contrast: v })} />
          </Field>
          <Field label="Saturation" value={`${Math.round(s.saturation * 100)}%`}>
            <Slider min={0} max={2} step={0.01} value={[s.saturation]} onValueChange={([v]) => p.onChange({ saturation: v })} />
          </Field>
        </Block>

        <Block title="Mask" hint="Hide the artwork behind windows, pipes or people with the Erase (E) and Lasso (L) tools.">
          <Field label="Edge softness" value={`${s.feather}px`}>
            <Slider min={0} max={24} step={0.5} value={[s.feather]} onValueChange={([v]) => p.onChange({ feather: v })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={p.onInvertMask}>
              <FlipVertical /> Invert
            </Button>
            <Button variant="outline" size="sm" onClick={p.onResetMask}>
              <SquareDashed /> Reset mask
            </Button>
          </div>
        </Block>

        <div className="rounded-xl border border-dashed bg-muted/40 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="size-4 text-spray-violet" /> AI harmonise
            <span className="ml-auto rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Soon
            </span>
          </p>
          <p className="mt-1 text-xs text-pretty text-muted-foreground">
            With the backend connected, an inpainting model will relight the artwork and paint
            it into the wall for a photoreal result — using the mask you draw here.
          </p>
        </div>
      </div>

      <div className="grid gap-2 border-t bg-background p-3">
        <Button onClick={p.onExport} disabled={p.exporting}>
          {p.exporting ? <LoaderCircle className="animate-spin" /> : <Download />}
          Download PNG
        </Button>
        <Button asChild variant="outline">
          <Link href={`/projects/${p.projectId}/results`}>
            <GalleryVerticalEnd /> View results
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Block({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
        {action}
      </div>
      {hint && <p className="-mt-1.5 text-xs text-pretty text-muted-foreground">{hint}</p>}
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2" title={hint}>
      <div className="flex items-center justify-between text-xs">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">{value}</span>
      </div>
      {children}
    </div>
  );
}
