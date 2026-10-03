"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BrickWall,
  ChevronRight,
  GalleryVerticalEnd,
  Images,
  Layers,
  LayoutDashboard,
  SearchX,
  WandSparkles,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ProjectActionsMenu, StarButton } from "@/components/project-actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useHydrated } from "@/hooks/use-hydrated";
import { useProjectData } from "@/hooks/use-project-data";
import { STATUS, STATUS_ORDER } from "@/lib/status";
import type { ProjectStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

const STEPS = [
  { slug: "", label: "Overview", icon: LayoutDashboard },
  { slug: "walls", label: "Walls", icon: BrickWall },
  { slug: "generate", label: "Generate", icon: WandSparkles },
  { slug: "designs", label: "Designs", icon: Images },
  { slug: "studio", label: "Studio", icon: Layers },
  { slug: "results", label: "Results", icon: GalleryVerticalEnd },
] as const;

export function ProjectShell({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const hydrated = useHydrated();
  const router = useRouter();
  const pathname = usePathname();
  const update = useAppStore((s) => s.updateProject);
  const { project, walls, readyDesigns, chosenDesign, composites, results } =
    useProjectData(projectId);

  if (!hydrated) {
    return (
      <div className="flex h-svh flex-col">
        <PageHeader>
          <Skeleton className="h-5 w-48" />
        </PageHeader>
        <div className="space-y-4 p-6">
          <Skeleton className="h-10 w-full max-w-xl" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <>
        <PageHeader title="Project not found" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <SearchX />
          </span>
          <p className="font-medium">We couldn&apos;t find that project.</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            It may have been deleted, or it was created in a different browser — projects
            are stored locally until the backend is connected.
          </p>
          <Button asChild>
            <Link href="/">Back to projects</Link>
          </Button>
        </div>
      </>
    );
  }

  const base = `/projects/${projectId}`;
  const counts: Record<string, number | undefined> = {
    walls: walls.length,
    generate: undefined,
    designs: readyDesigns.length,
    studio: composites.length,
    results: results.length,
  };
  const done: Record<string, boolean> = {
    walls: walls.length > 0,
    generate: readyDesigns.length > 0,
    designs: !!chosenDesign,
    studio: composites.length > 0,
    results: results.length > 0,
  };

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <PageHeader>
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
          <Link href="/" className="hidden text-muted-foreground hover:text-foreground sm:inline">
            Projects
          </Link>
          <ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground/60 sm:block" />
          <span className="truncate font-heading font-semibold">{project.name}</span>
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Select
            value={project.status}
            onValueChange={(v) => update(project.id, { status: v as ProjectStatus })}
          >
            <SelectTrigger size="sm" className="h-8 w-[7.75rem] sm:w-[8.5rem]" aria-label="Project status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  <span className={cn("size-2 rounded-full", STATUS[s].dot)} />
                  {STATUS[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <StarButton project={project} />
          <ProjectActionsMenu project={project} onDeleted={() => router.push("/")} />
        </div>
      </PageHeader>

      <nav
        aria-label="Project steps"
        className="scrollbar-none @container flex shrink-0 gap-0.5 overflow-x-auto border-b bg-background px-2"
      >
        {STEPS.map((step) => {
          const href = step.slug ? `${base}/${step.slug}` : base;
          const active = step.slug ? pathname.startsWith(href) : pathname === base;
          const count = counts[step.slug];
          return (
            <Link
              key={step.slug || "overview"}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex shrink-0 items-center gap-2 px-2.5 py-3 text-sm font-medium transition-colors outline-none focus-visible:bg-muted",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <step.icon className="size-4 @max-[42rem]:hidden" />
              {step.label}
              {count !== undefined && count > 0 && (
                <span
                  className={cn(
                    "min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 tabular-nums",
                    done[step.slug] ? "bg-primary/20 text-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              )}
              {active && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">{children}</main>
    </div>
  );
}
