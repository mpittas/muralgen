"use client";

import { useMemo, useState } from "react";
import { Dices, Info, Sparkles, Trash, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useHydrated } from "@/hooks/use-hydrated";
import { newId } from "@/lib/blob-store";
import { enqueueGenerations } from "@/lib/generation-queue";
import { timeAgo } from "@/lib/format";
import {
  ASPECTS,
  PALETTES,
  PROMPT_IDEAS,
  STYLES,
  buildPrompt,
  getPalette,
  getStyle,
} from "@/lib/presets";
import { getUsableProvider, providers } from "@/lib/providers";
import type { Design } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore, useDesigns, useWalls } from "@/store/app-store";
import { DesignDialog, DesignTile } from "@/features/designs/design-card";
import { useGeneratorStore } from "./generator-store";

const NO_WALL = "none";

export function GeneratePage({ projectId }: { projectId: string }) {
  const hydrated = useHydrated();
  const walls = useWalls(projectId);
  const designs = useDesigns(projectId);
  const addDesign = useAppStore((s) => s.addDesign);
  const removeDesign = useAppStore((s) => s.removeDesign);
  const draft = useGeneratorStore();
  const [open, setOpen] = useState<string | null>(null);

  const provider = getUsableProvider(draft.providerId);
  const modelId = provider.models.some((m) => m.id === draft.modelId)
    ? draft.modelId
    : provider.defaultModel;
  const wall =
    draft.wallId === NO_WALL
      ? null
      : (walls.find((w) => w.id === draft.wallId) ?? walls[0] ?? null);
  const aspect = ASPECTS.find((a) => a.id === draft.aspectId) ?? ASPECTS[0];
  const ratio = aspect.ratio ?? (wall ? wall.width / wall.height : 4 / 3);

  const fullPrompt = buildPrompt({
    subject: draft.prompt || "your idea",
    styleId: draft.styleId,
    paletteId: draft.paletteId,
  });

  const batches = useMemo(() => {
    const map = new Map<string, Design[]>();
    for (const d of designs) {
      if (d.source !== "ai") continue;
      const list = map.get(d.batchId) ?? [];
      list.push(d);
      map.set(d.batchId, list);
    }
    return [...map.values()]
      .map((list) => list.sort((a, b) => a.createdAt - b.createdAt))
      .sort((a, b) => b[0].createdAt - a[0].createdAt);
  }, [designs]);

  const generate = () => {
    if (!draft.prompt.trim()) return;
    if (provider.status !== "available") {
      toast.error(`${provider.name} isn't connected yet.`);
      return;
    }
    const base = provider.maxSide;
    const raw =
      ratio >= 1
        ? { width: base, height: base / ratio }
        : { width: base * ratio, height: base };
    const size = provider.constrainSize(raw.width, raw.height);
    const batchId = newId("bat");
    const now = Date.now();
    const ids: string[] = [];
    for (let i = 0; i < draft.count; i++) {
      const id = newId("dsg");
      ids.push(id);
      addDesign({
        id,
        projectId,
        batchId,
        status: "pending",
        width: size.width,
        height: size.height,
        prompt: draft.prompt.trim(),
        fullPrompt: buildPrompt({
          subject: draft.prompt,
          styleId: draft.styleId,
          paletteId: draft.paletteId,
        }),
        styleId: draft.styleId,
        paletteId: draft.paletteId,
        providerId: provider.id,
        model: modelId,
        seed: Math.floor(Math.random() * 1_000_000),
        wallId: wall?.id,
        favorite: false,
        chosen: false,
        source: "ai",
        createdAt: now + i,
      });
    }
    enqueueGenerations(ids);
  };

  if (!hydrated) {
    return (
      <div className="grid gap-6 p-6 lg:grid-cols-[22rem_1fr]">
        <Skeleton className="h-[32rem]" />
        <Skeleton className="h-[32rem]" />
      </div>
    );
  }

  const opened = designs.find((d) => d.id === open);
  // Two images run side by side.
  const estimate = Math.round((Math.ceil(draft.count / 2) * (provider.typicalSeconds ?? 0)));

  return (
    <div className="grid min-h-full lg:h-full lg:grid-cols-[23rem_1fr]">
      {/* ---------------- Controls ---------------- */}
      <section
        aria-label="Generation settings"
        className="flex flex-col border-b bg-card/40 lg:min-h-0 lg:border-r lg:border-b-0"
      >
        <div className="scrollbar-thin flex-1 space-y-6 p-4 lg:overflow-y-auto">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="prompt" className="text-sm font-semibold">
                What should we paint?
              </Label>
              <Button
                variant="ghost"
                size="xs"
                onClick={() =>
                  draft.setDraft({
                    prompt: PROMPT_IDEAS[Math.floor(Math.random() * PROMPT_IDEAS.length)],
                  })
                }
              >
                <Dices /> Surprise me
              </Button>
            </div>
            <Textarea
              id="prompt"
              rows={4}
              maxLength={500}
              placeholder="A giant fox made of geometric shapes, leaping across the wall…"
              value={draft.prompt}
              onChange={(e) => draft.setDraft({ prompt: e.target.value })}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate();
              }}
              className="resize-none"
            />
            {!draft.prompt && (
              <div className="flex flex-wrap gap-1.5">
                {PROMPT_IDEAS.slice(0, 4).map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => draft.setDraft({ prompt: idea })}
                    className="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
                  >
                    {idea}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Section title="Style">
            <div className="grid grid-cols-3 gap-2">
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  title={s.description}
                  aria-pressed={draft.styleId === s.id}
                  onClick={() => draft.setDraft({ styleId: s.id })}
                  className={cn(
                    "group flex flex-col gap-1.5 rounded-lg border p-1.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    draft.styleId === s.id
                      ? "border-primary bg-primary/10"
                      : "bg-background hover:border-foreground/30",
                  )}
                >
                  <span className="h-9 rounded-md" style={{ background: s.swatch }} />
                  <span className="px-0.5 text-[11px] leading-tight font-medium">{s.name}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{getStyle(draft.styleId).description}</p>
          </Section>

          <Section title="Palette">
            <div className="flex flex-wrap gap-1.5">
              {PALETTES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={draft.paletteId === p.id}
                  onClick={() => draft.setDraft({ paletteId: p.id })}
                  className={cn(
                    "flex items-center gap-2 rounded-full border py-1 pr-3 pl-1.5 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    draft.paletteId === p.id
                      ? "border-primary bg-primary/10"
                      : "bg-background hover:border-foreground/30",
                  )}
                >
                  <span className="flex -space-x-1">
                    {p.colors.length === 0 ? (
                      <span className="size-4 rounded-full bg-[conic-gradient(#ff3d81,#ffb400,#14d0c4,#5b3df5,#ff3d81)]" />
                    ) : (
                      p.colors.map((c) => (
                        <span key={c} className="size-4 rounded-full border border-background" style={{ background: c }} />
                      ))
                    )}
                  </span>
                  {p.name}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Format">
            <ToggleGroup
              type="single"
              value={draft.aspectId}
              onValueChange={(v) => v && draft.setDraft({ aspectId: v })}
              variant="outline"
              size="sm"
              className="flex-wrap justify-start"
            >
              {ASPECTS.map((a) => (
                <ToggleGroupItem key={a.id} value={a.id} className="px-2.5 text-xs">
                  {a.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <div className="grid gap-1.5 pt-1">
              <Label className="text-xs text-muted-foreground">Reference wall (sets the proportions)</Label>
              <Select
                value={wall?.id ?? NO_WALL}
                onValueChange={(v) => draft.setDraft({ wallId: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_WALL}>No wall selected</SelectItem>
                  {walls.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} · {w.width}×{w.height}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Output: {Math.round(ratio * 100) / 100}:1
                {aspect.ratio === null && !wall && " — pick a wall or a fixed ratio."}
              </p>
            </div>
          </Section>

          <Section title="Images">
            <ToggleGroup
              type="single"
              value={String(draft.count)}
              onValueChange={(v) => v && draft.setDraft({ count: Number(v) })}
              variant="outline"
              size="sm"
            >
              {Array.from({ length: provider.maxImagesPerBatch }, (_, i) => i + 1).map((n) => (
                <ToggleGroupItem key={n} value={String(n)} className="w-10">
                  {n}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Section>

          <Section title="Model">
            <Select
              value={provider.id}
              onValueChange={(v) => draft.setDraft({ providerId: v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id} disabled={p.status !== "available"}>
                    <span className="flex items-center gap-2">
                      {p.name}
                      {p.free && p.status === "available" && (
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                          Free
                        </Badge>
                      )}
                      {p.status !== "available" && (
                        <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                          Soon
                        </Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {provider.models.length > 1 && (
              <Select value={modelId} onValueChange={(v) => draft.setDraft({ modelId: v })}>
                <SelectTrigger className="w-full" aria-label="Model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {provider.models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                      {m.description && (
                        <span className="text-xs text-muted-foreground"> — {m.description}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {provider.limits && (
              <p className="flex gap-1.5 text-xs text-pretty text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                {provider.limits}
              </p>
            )}
          </Section>

          <details className="group rounded-lg border bg-background text-xs">
            <summary className="cursor-pointer list-none px-3 py-2 font-medium text-muted-foreground select-none hover:text-foreground">
              Final prompt sent to the model
            </summary>
            <p className="border-t px-3 py-2 text-pretty text-muted-foreground">{fullPrompt}</p>
          </details>
        </div>

        <div className="sticky bottom-0 z-10 border-t bg-background/95 p-4 backdrop-blur lg:static">
          <Button
            size="lg"
            className="h-10 w-full text-sm font-semibold"
            disabled={!draft.prompt.trim() || provider.status !== "available"}
            onClick={generate}
          >
            <Sparkles />
            Generate {draft.count} design{draft.count === 1 ? "" : "s"}
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {estimate > 5 ? `Roughly ${estimate >= 90 ? Math.round(estimate / 60) + " min" : estimate + "s"} · ` : ""}
            <kbd className="rounded border px-1 font-sans">Ctrl</kbd>+
            <kbd className="rounded border px-1 font-sans">Enter</kbd> to run
          </p>
        </div>
      </section>

      {/* ---------------- Results ---------------- */}
      <section aria-label="Generated designs" className="scrollbar-thin p-4 sm:p-6 lg:min-h-0 lg:overflow-y-auto">
        {batches.length === 0 ? (
          <EmptyResults onPick={(idea) => draft.setDraft({ prompt: idea })} />
        ) : (
          <div className="space-y-8">
            {batches.map((batch) => {
              const first = batch[0];
              return (
                <div key={first.batchId} className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 max-w-2xl">
                      <p className="line-clamp-2 text-sm font-medium text-pretty">{first.prompt}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary">{getStyle(first.styleId).name}</Badge>
                        {first.paletteId !== "free" && (
                          <Badge variant="secondary">{getPalette(first.paletteId).name}</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(first.createdAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          draft.setDraft({
                            prompt: first.prompt,
                            styleId: first.styleId,
                            paletteId: first.paletteId,
                          })
                        }
                      >
                        <Wand2 /> Reuse settings
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Delete this batch"
                        onClick={() => {
                          batch.forEach((d) => removeDesign(d.id));
                          toast("Batch deleted");
                        }}
                      >
                        <Trash />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] items-start gap-4">
                    {batch.map((d) => (
                      <DesignTile key={d.id} design={d} onOpen={() => setOpen(d.id)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {opened && <DesignDialog design={opened} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function EmptyResults({ onPick }: { onPick: (idea: string) => void }) {
  return (
    <div className="flex min-h-[26rem] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed p-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
        <Sparkles />
      </span>
      <div className="space-y-1">
        <h2 className="font-heading text-xl font-bold">Your designs will appear here</h2>
        <p className="mx-auto max-w-md text-sm text-balance text-muted-foreground">
          Describe the artwork, choose a style and palette, then generate a few options.
          Favourite the ones you like and pick a winner for the wall.
        </p>
      </div>
      <div className="flex max-w-xl flex-wrap justify-center gap-2">
        {PROMPT_IDEAS.slice(0, 5).map((idea) => (
          <button
            key={idea}
            type="button"
            onClick={() => onPick(idea)}
            className="rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
          >
            {idea}
          </button>
        ))}
      </div>
    </div>
  );
}
