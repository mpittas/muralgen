"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ImageIcon,
  LayoutGrid,
  List,
  LoaderCircle,
  Plus,
  Search,
  Sparkles,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { BlobImage } from "@/components/blob-image";
import { PageHeader } from "@/components/page-header";
import { ProjectActionsMenu, StarButton } from "@/components/project-actions";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useHydrated } from "@/hooks/use-hydrated";
import { createSampleProject } from "@/lib/actions";
import { useCovers, type Cover } from "@/lib/covers";
import { timeAgo } from "@/lib/format";
import { STATUS, STATUS_ORDER } from "@/lib/status";
import type { Project, ProjectStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAllCounts, useProjects, type ProjectCounts } from "@/store/app-store";
import { useUiStore } from "@/store/ui-store";

type Filter = "all" | "starred" | "archived";
type Sort = "updated" | "created" | "name";

const TITLES: Record<Filter, string> = {
  all: "Projects",
  starred: "Starred",
  archived: "Archived",
};

export function ProjectsView({ filter }: { filter: Filter }) {
  const hydrated = useHydrated();
  const projects = useProjects();
  const counts = useAllCounts();
  const covers = useCovers();
  const setNewProjectOpen = useUiStore((s) => s.setNewProjectOpen);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "any">("any");
  const [sort, setSort] = useState<Sort>("updated");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const searchRef = useRef<HTMLInputElement>(null);

  const scoped = useMemo(
    () =>
      projects.filter((p) =>
        filter === "archived" ? p.archived : filter === "starred" ? p.starred && !p.archived : !p.archived,
      ),
    [projects, filter],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = scoped.filter((p) => {
      if (status !== "any" && p.status !== status) return false;
      if (!q) return true;
      return [p.name, p.description, p.location, p.client, ...p.tags]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    return list.sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "created"
          ? b.createdAt - a.createdAt
          : b.updatedAt - a.updatedAt,
    );
  }, [scoped, query, status, sort]);

  const isEmpty = hydrated && projects.length === 0;

  return (
    <>
      <PageHeader
        title={TITLES[filter]}
        actions={
          <Button onClick={() => setNewProjectOpen(true)}>
            <Plus /> New project
          </Button>
        }
      />
      <div className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
        {!hydrated ? (
          <GridSkeleton />
        ) : isEmpty ? (
          <EmptyState />
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <div className="relative min-w-52 flex-1 sm:max-w-sm">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search projects, tags, clients…"
                  aria-label="Search projects"
                  className="h-9 pl-8"
                />
              </div>

              <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus | "any")}>
                <SelectTrigger className="h-9 w-36" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any status</SelectItem>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
                <SelectTrigger className="h-9 w-40" aria-label="Sort projects">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updated">Recently updated</SelectItem>
                  <SelectItem value="created">Newest first</SelectItem>
                  <SelectItem value="name">Name (A–Z)</SelectItem>
                </SelectContent>
              </Select>

              <ToggleGroup
                type="single"
                value={layout}
                onValueChange={(v) => v && setLayout(v as "grid" | "list")}
                variant="outline"
                className="ml-auto"
              >
                <ToggleGroupItem value="grid" aria-label="Grid view">
                  <LayoutGrid />
                </ToggleGroupItem>
                <ToggleGroupItem value="list" aria-label="List view">
                  <List />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {visible.length === 0 ? (
              <NoResults filter={filter} filtered={scoped.length > 0} />
            ) : layout === "grid" ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5">
                {visible.map((p) => (
                  <ProjectCard key={p.id} project={p} cover={covers[p.id]} counts={counts[p.id]} />
                ))}
              </div>
            ) : (
              <div className="divide-y rounded-xl border bg-card">
                {visible.map((p) => (
                  <ProjectRow key={p.id} project={p} cover={covers[p.id]} counts={counts[p.id]} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function countsLabel(c?: ProjectCounts) {
  const walls = c?.walls ?? 0;
  const designs = c?.designs ?? 0;
  const results = c?.composites ?? 0;
  return `${walls} wall${walls === 1 ? "" : "s"} · ${designs} design${designs === 1 ? "" : "s"} · ${results} result${results === 1 ? "" : "s"}`;
}

function ProjectCard({
  project,
  cover,
  counts,
}: {
  project: Project;
  cover: Cover | null | undefined;
  counts?: ProjectCounts;
}) {
  return (
    <article className="group relative flex flex-col gap-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border bg-muted transition-shadow group-hover:shadow-lg group-hover:shadow-black/10">
        {cover ? (
          <BlobImage
            id={cover.thumbId}
            alt=""
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="bg-brick flex size-full items-center justify-center text-muted-foreground">
            <ImageIcon className="size-8 opacity-50" />
          </div>
        )}
        {cover && (
          <span className="absolute bottom-2 left-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-white uppercase backdrop-blur">
            {cover.kind === "result" ? "Preview" : cover.kind === "design" ? "Design" : "Wall"}
          </span>
        )}
        <Link
          href={`/projects/${project.id}`}
          aria-label={`Open ${project.name}`}
          className="absolute inset-0 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
        />
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [&:has([aria-pressed=true])]:opacity-100">
          <StarButton project={project} className="bg-background/80 backdrop-blur hover:bg-background" />
          <ProjectActionsMenu project={project} className="bg-background/80 backdrop-blur hover:bg-background" />
        </div>
      </div>
      <div className="min-w-0 px-0.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-heading text-[15px] leading-tight font-semibold">
            {project.name}
          </h3>
          <StatusBadge status={project.status} className="shrink-0" />
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {countsLabel(counts)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground/80">
          Updated {timeAgo(project.updatedAt)}
          {project.location ? ` · ${project.location}` : ""}
        </p>
      </div>
    </article>
  );
}

function ProjectRow({
  project,
  cover,
  counts,
}: {
  project: Project;
  cover: Cover | null | undefined;
  counts?: ProjectCounts;
}) {
  return (
    <div className="group relative flex items-center gap-4 px-3 py-2.5 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-muted/50">
      <Link href={`/projects/${project.id}`} aria-label={`Open ${project.name}`} className="absolute inset-0" />
      <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg border bg-muted">
        {cover ? (
          <BlobImage id={cover.thumbId} alt="" className="size-full object-cover" />
        ) : (
          <div className="bg-brick size-full" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{project.name}</p>
        <p className="truncate text-xs text-muted-foreground">{countsLabel(counts)}</p>
      </div>
      <StatusBadge status={project.status} className="hidden sm:inline-flex" />
      <span className="hidden w-28 text-right text-xs text-muted-foreground md:block">
        {timeAgo(project.updatedAt)}
      </span>
      <div className="relative z-10 flex">
        <StarButton project={project} />
        <ProjectActionsMenu project={project} />
      </div>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="aspect-[4/3] rounded-xl" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function NoResults({ filter, filtered }: { filter: Filter; filtered: boolean }) {
  const Icon = filter === "archived" ? Archive : filter === "starred" ? Star : Search;
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed py-20 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="font-medium">
        {filtered
          ? "No projects match your filters"
          : filter === "archived"
            ? "Nothing archived"
            : filter === "starred"
              ? "No starred projects yet"
              : "No projects yet"}
      </p>
      <p className="max-w-xs text-sm text-muted-foreground">
        {filtered
          ? "Try a different search term or clear the status filter."
          : filter === "starred"
            ? "Star a project to pin it here for quick access."
            : filter === "archived"
              ? "Archive finished or paused projects to keep your workspace tidy."
              : "Create a project to get started."}
      </p>
    </div>
  );
}

function EmptyState() {
  const router = useRouter();
  const setNewProjectOpen = useUiStore((s) => s.setNewProjectOpen);
  const [busy, setBusy] = useState(false);

  const sample = async () => {
    setBusy(true);
    try {
      const p = await createSampleProject();
      router.push(`/projects/${p.id}`);
    } catch {
      toast.error("Couldn't create the sample project.");
      setBusy(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border bg-card px-6 py-16 text-center sm:py-24">
      <div aria-hidden className="bg-brick absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,transparent_30%,black_95%)]" />
      <div className="relative mx-auto flex max-w-xl flex-col items-center gap-5">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Sparkles className="size-7" />
        </span>
        <div className="space-y-2">
          <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            Design your next wall.
          </h2>
          <p className="text-balance text-muted-foreground">
            Upload a photo of the wall, generate mural concepts with AI, pick a winner and
            preview it on the real brick before a single can is shaken.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="lg" onClick={() => setNewProjectOpen(true)}>
            <Plus /> Create a project
          </Button>
          <Button size="lg" variant="outline" onClick={sample} disabled={busy}>
            {busy ? <LoaderCircle className="animate-spin" /> : <ImageIcon />}
            Explore a sample project
          </Button>
        </div>
        <ol className="mt-4 grid w-full max-w-lg grid-cols-4 gap-2 text-xs text-muted-foreground">
          {["Upload wall", "Generate", "Choose", "Apply"].map((s, i) => (
            <li key={s} className={cn("flex flex-col items-center gap-1.5")}>
              <span className="flex size-6 items-center justify-center rounded-full border bg-background font-medium text-foreground">
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
