"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BrickWall,
  Check,
  GalleryVerticalEnd,
  Images,
  Layers,
  WandSparkles,
  X,
} from "lucide-react";
import { BlobImage } from "@/components/blob-image";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useProjectData } from "@/hooks/use-project-data";
import { pickCover } from "@/lib/covers";
import { timeAgo } from "@/lib/format";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { designLabel } from "@/features/designs/design-card";

export function OverviewPage({ projectId }: { projectId: string }) {
  const { project, walls, designs, readyDesigns, chosenDesign, composites, results } =
    useProjectData(projectId);
  if (!project) return null;

  const cover = pickCover(project, walls, designs, composites);
  const base = `/projects/${projectId}`;
  const favorites = readyDesigns.filter((d) => d.favorite).length;

  const steps = [
    {
      key: "walls",
      icon: BrickWall,
      title: "Upload the wall",
      body: "Photos of the surface you'll paint, plus its real size.",
      done: walls.length > 0,
      meta: walls.length ? `${walls.length} photo${walls.length === 1 ? "" : "s"}` : undefined,
      href: `${base}/walls`,
      cta: walls.length ? "Manage walls" : "Add a wall",
    },
    {
      key: "generate",
      icon: WandSparkles,
      title: "Generate designs",
      body: "Describe the art, pick a style and let AI sketch options.",
      done: readyDesigns.length > 0,
      meta: readyDesigns.length ? `${readyDesigns.length} design${readyDesigns.length === 1 ? "" : "s"}` : undefined,
      href: `${base}/generate`,
      cta: readyDesigns.length ? "Generate more" : "Start generating",
    },
    {
      key: "choose",
      icon: Images,
      title: "Choose a winner",
      body: "Favourite, compare side by side and pick one for the wall.",
      done: !!chosenDesign,
      meta: chosenDesign ? designLabel(chosenDesign).slice(0, 28) : favorites ? `${favorites} favourite${favorites === 1 ? "" : "s"}` : undefined,
      href: `${base}/designs`,
      cta: chosenDesign ? "Review designs" : "Open library",
    },
    {
      key: "studio",
      icon: Layers,
      title: "Apply on the wall",
      body: "Place it in perspective, mask obstacles, match the light.",
      done: composites.length > 0,
      meta: composites.length ? `${composites.length} composition${composites.length === 1 ? "" : "s"}` : undefined,
      href: chosenDesign ? `${base}/studio?design=${chosenDesign.id}` : `${base}/studio`,
      cta: composites.length ? "Open studio" : "Open studio",
    },
    {
      key: "results",
      icon: GalleryVerticalEnd,
      title: "Review & plan the paint",
      body: "Before/after, palette, spray-can estimate and a transfer grid.",
      done: results.length > 0,
      meta: results.length ? `${results.length} preview${results.length === 1 ? "" : "s"}` : undefined,
      href: `${base}/results`,
      cta: "View results",
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const nextIndex = steps.findIndex((s) => !s.done);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-6">
      {/* Hero */}
      <section className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border bg-muted">
          {cover ? (
            <BlobImage id={cover.thumbId} alt="Project cover" className="size-full object-cover" />
          ) : (
            <div className="bg-brick flex size-full items-center justify-center text-sm text-muted-foreground">
              Upload a wall photo to see it here
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-4 pt-16 text-white">
            <div>
              <p className="text-xs tracking-wide uppercase opacity-80">
                {cover?.kind === "result" ? "Latest preview" : cover?.kind === "design" ? "Chosen design" : cover ? "Original wall" : ""}
              </p>
            </div>
            {nextIndex >= 0 && (
              <Button asChild size="sm">
                <Link href={steps[nextIndex].href}>
                  Next: {steps[nextIndex].title} <ArrowRight />
                </Link>
              </Button>
            )}
          </div>
        </div>

        <DetailsForm key={project.id} project={project} />
      </section>

      {/* Progress */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-heading text-xl font-bold">Workflow</h2>
            <p className="text-sm text-muted-foreground">
              {doneCount === steps.length
                ? "Everything's in place — time to pick up the spray cans."
                : `${doneCount} of ${steps.length} steps done`}
            </p>
          </div>
          <Progress value={(doneCount / steps.length) * 100} className="hidden h-2 w-48 sm:block" />
        </div>

        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((s, i) => {
            const current = i === nextIndex;
            return (
              <li key={s.key}>
                <Link
                  href={s.href}
                  className={cn(
                    "group flex h-full flex-col gap-3 rounded-2xl border bg-card p-4 transition-all outline-none hover:shadow-lg hover:shadow-black/10 focus-visible:ring-3 focus-visible:ring-ring/60",
                    current && "border-primary/70 ring-1 ring-primary/50",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-xl",
                        s.done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {s.done ? <Check className="size-4" /> : <s.icon className="size-4" />}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">{i + 1}/5</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-heading text-sm font-semibold">{s.title}</h3>
                    <p className="mt-1 text-xs text-pretty text-muted-foreground">{s.body}</p>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate font-medium">{s.meta ?? ""}</span>
                    <span className="flex shrink-0 items-center gap-1 text-muted-foreground transition-colors group-hover:text-foreground">
                      {s.cta} <ArrowRight className="size-3" />
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Recent designs + notes */}
      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg font-bold">Recent designs</h2>
            {readyDesigns.length > 0 && (
              <Button asChild variant="ghost" size="sm">
                <Link href={`${base}/designs`}>
                  View all <ArrowRight />
                </Link>
              </Button>
            )}
          </div>
          {readyDesigns.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nothing generated yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {readyDesigns.slice(0, 4).map((d) => (
                <Link
                  key={d.id}
                  href={`${base}/designs`}
                  className={cn(
                    "aspect-[4/3] overflow-hidden rounded-xl border bg-muted",
                    d.chosen && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                  )}
                >
                  <BlobImage id={d.thumbId} alt={designLabel(d)} className="size-full object-cover" />
                </Link>
              ))}
            </div>
          )}
        </div>

        <NotesCard key={project.id} project={project} />
      </section>
    </div>
  );
}

function DetailsForm({ project }: { project: Project }) {
  const update = useAppStore((s) => s.updateProject);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [location, setLocation] = useState(project.location);
  const [client, setClient] = useState(project.client);
  const [tag, setTag] = useState("");

  const addTag = () => {
    const t = tag.trim().replace(/^#/, "").toLowerCase();
    if (t && !project.tags.includes(t)) update(project.id, { tags: [...project.tags, t] });
    setTag("");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Label htmlFor="ov-name" className="sr-only">
            Project name
          </Label>
          <Input
            id="ov-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const n = name.trim();
              if (n && n !== project.name) update(project.id, { name: n });
              else setName(project.name);
            }}
            className="h-auto border-transparent bg-transparent px-2 py-1 font-heading text-2xl font-bold shadow-none hover:border-input focus-visible:border-ring md:text-3xl"
          />
        </div>
        <StatusBadge status={project.status} className="mt-2.5 shrink-0" />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ov-desc" className="text-xs text-muted-foreground">
          Brief
        </Label>
        <Textarea
          id="ov-desc"
          rows={3}
          placeholder="Theme, mood, constraints…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== project.description && update(project.id, { description })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="ov-loc" className="text-xs text-muted-foreground">
            Location
          </Label>
          <Input
            id="ov-loc"
            value={location}
            placeholder="City / address"
            onChange={(e) => setLocation(e.target.value)}
            onBlur={() => location !== project.location && update(project.id, { location })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ov-client" className="text-xs text-muted-foreground">
            Client
          </Label>
          <Input
            id="ov-client"
            value={client}
            placeholder="Who's it for?"
            onChange={(e) => setClient(e.target.value)}
            onBlur={() => client !== project.client && update(project.id, { client })}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ov-tag" className="text-xs text-muted-foreground">
          Tags
        </Label>
        <div className="flex flex-wrap items-center gap-1.5">
          {project.tags.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1 pr-1">
              {t}
              <button
                type="button"
                aria-label={`Remove tag ${t}`}
                onClick={() => update(project.id, { tags: project.tags.filter((x) => x !== t) })}
                className="rounded-sm p-0.5 hover:bg-foreground/10"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <Input
            id="ov-tag"
            className="h-7 min-w-28 flex-1"
            placeholder="Add tag…"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={addTag}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Created {timeAgo(project.createdAt)} · updated {timeAgo(project.updatedAt)}
      </p>
    </div>
  );
}

function NotesCard({ project }: { project: Project }) {
  const update = useAppStore((s) => s.updateProject);
  const [notes, setNotes] = useState(project.notes);
  return (
    <div className="space-y-3">
      <h2 className="font-heading text-lg font-bold">Notes</h2>
      <Textarea
        rows={7}
        value={notes}
        placeholder="Permits, access, paint brands, client feedback, ideas for round two…"
        aria-label="Project notes"
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== project.notes && update(project.id, { notes })}
        className="resize-none"
      />
      <p className="text-xs text-muted-foreground">Saved automatically when you click away.</p>
    </div>
  );
}
