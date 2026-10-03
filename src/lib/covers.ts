"use client";

import { useMemo } from "react";
import { useAppStore } from "@/store/app-store";
import type { Composite, Design, Project, Wall } from "@/lib/types";

export interface Cover {
  /** Blob id of a thumbnail to render. */
  thumbId: string;
  kind: "result" | "design" | "wall";
}

/**
 * Best image to represent a project, in order of "how finished it looks":
 * explicit cover -> latest rendered composite -> chosen design -> any design -> first wall.
 */
export function pickCover(
  project: Project,
  walls: Wall[],
  designs: Design[],
  composites: Composite[],
): Cover | null {
  const withResult = composites.filter((c) => c.thumbId);
  const explicit = withResult.find((c) => c.id === project.coverCompositeId);
  const latest = [...withResult].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const comp = explicit ?? latest;
  if (comp?.thumbId) return { thumbId: comp.thumbId, kind: "result" };

  const ready = designs.filter((d) => d.status === "ready" && d.thumbId);
  const chosen = ready.find((d) => d.chosen);
  const anyDesign = [...ready].sort((a, b) => b.createdAt - a.createdAt)[0];
  const design = chosen ?? anyDesign;
  if (design?.thumbId) return { thumbId: design.thumbId, kind: "design" };

  const wall = [...walls].sort((a, b) => a.createdAt - b.createdAt)[0];
  if (wall) return { thumbId: wall.thumbId, kind: "wall" };
  return null;
}

export function useCovers(): Record<string, Cover | null> {
  const projects = useAppStore((s) => s.projects);
  const walls = useAppStore((s) => s.walls);
  const designs = useAppStore((s) => s.designs);
  const composites = useAppStore((s) => s.composites);
  return useMemo(() => {
    const out: Record<string, Cover | null> = {};
    const w = Object.values(walls);
    const d = Object.values(designs);
    const c = Object.values(composites);
    for (const p of Object.values(projects)) {
      out[p.id] = pickCover(
        p,
        w.filter((x) => x.projectId === p.id),
        d.filter((x) => x.projectId === p.id),
        c.filter((x) => x.projectId === p.id),
      );
    }
    return out;
  }, [projects, walls, designs, composites]);
}
