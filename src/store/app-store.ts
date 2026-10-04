"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { deleteBlobs, newId } from "@/lib/blob-store";
import type { Composite, Design, Project, Wall } from "@/lib/types";

/**
 * Working copy of the signed-in user's data. All UI mutations go through these actions.
 * Persistence is handled by lib/firebase/sync.ts, which mirrors this store to Firestore
 * (metadata) and blob-store.ts mirrors images to Cloud Storage.
 */

interface Data {
  projects: Record<string, Project>;
  walls: Record<string, Wall>;
  designs: Record<string, Design>;
  composites: Record<string, Composite>;
}

interface Actions {
  createProject: (
    input: Partial<Omit<Project, "id" | "createdAt" | "updatedAt">> & {
      name: string;
    },
  ) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;

  addWall: (wall: Wall) => void;
  updateWall: (id: string, patch: Partial<Wall>) => void;
  removeWall: (id: string) => void;

  addDesign: (design: Design) => void;
  updateDesign: (id: string, patch: Partial<Design>) => void;
  removeDesign: (id: string) => void;
  chooseDesign: (projectId: string, designId: string | null) => void;

  createComposite: (
    input: Pick<
      Composite,
      "projectId" | "wallId" | "designId" | "name" | "settings"
    >,
  ) => Composite;
  addComposite: (composite: Composite) => void;
  updateComposite: (id: string, patch: Partial<Composite>) => void;
  removeComposite: (id: string) => void;

  /** Merges records created outside the UI (the one-time import of pre-account local data). */
  importData: (data: Partial<Data>) => void;
  /** Empties the in-memory store (sign-out, account switch). Does not touch the cloud. */
  resetAll: () => void;
}

export type AppState = Data & Actions;
export type { Data as AppData };

const empty: Data = { projects: {}, walls: {}, designs: {}, composites: {} };

function omit<T>(rec: Record<string, T>, ...keys: string[]): Record<string, T> {
  const next = { ...rec };
  for (const k of keys) delete next[k];
  return next;
}

export const useAppStore = create<AppState>()((set, get) => ({
  ...empty,

  createProject: (input) => {
    const now = Date.now();
    const project: Project = {
      description: "",
      location: "",
      client: "",
      tags: [],
      status: "draft",
      notes: "",
      starred: false,
      archived: false,
      ...input,
      id: newId("prj"),
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ projects: { ...s.projects, [project.id]: project } }));
    return project;
  },

  updateProject: (id, patch) =>
    set((s) => {
      const prev = s.projects[id];
      if (!prev) return s;
      return {
        projects: {
          ...s.projects,
          [id]: { ...prev, ...patch, updatedAt: Date.now() },
        },
      };
    }),

  deleteProject: (id) => {
    const s = get();
    const walls = Object.values(s.walls).filter((w) => w.projectId === id);
    const designs = Object.values(s.designs).filter((d) => d.projectId === id);
    const composites = Object.values(s.composites).filter(
      (c) => c.projectId === id,
    );
    void deleteBlobs([
      ...walls.flatMap((w) => [w.imageId, w.thumbId]),
      ...designs.flatMap((d) => [d.imageId, d.thumbId]),
      ...composites.flatMap((c) => [c.maskId, c.resultId, c.thumbId]),
    ]);
    set((st) => ({
      projects: omit(st.projects, id),
      walls: omit(st.walls, ...walls.map((w) => w.id)),
      designs: omit(st.designs, ...designs.map((d) => d.id)),
      composites: omit(st.composites, ...composites.map((c) => c.id)),
    }));
  },

  addWall: (wall) =>
    set((s) => ({
      walls: { ...s.walls, [wall.id]: wall },
      projects: touch(s.projects, wall.projectId),
    })),

  updateWall: (id, patch) =>
    set((s) => {
      const prev = s.walls[id];
      if (!prev) return s;
      return { walls: { ...s.walls, [id]: { ...prev, ...patch } } };
    }),

  removeWall: (id) => {
    const s = get();
    const wall = s.walls[id];
    if (!wall) return;
    const composites = Object.values(s.composites).filter(
      (c) => c.wallId === id,
    );
    void deleteBlobs([
      wall.imageId,
      wall.thumbId,
      ...composites.flatMap((c) => [c.maskId, c.resultId, c.thumbId]),
    ]);
    set((st) => ({
      walls: omit(st.walls, id),
      composites: omit(st.composites, ...composites.map((c) => c.id)),
      projects: touch(st.projects, wall.projectId),
    }));
  },

  addDesign: (design) =>
    set((s) => ({
      designs: { ...s.designs, [design.id]: design },
      projects: touch(s.projects, design.projectId),
    })),

  updateDesign: (id, patch) =>
    set((s) => {
      const prev = s.designs[id];
      if (!prev) return s;
      return { designs: { ...s.designs, [id]: { ...prev, ...patch } } };
    }),

  removeDesign: (id) => {
    const s = get();
    const design = s.designs[id];
    if (!design) return;
    const composites = Object.values(s.composites).filter(
      (c) => c.designId === id,
    );
    void deleteBlobs([
      design.imageId,
      design.thumbId,
      ...composites.flatMap((c) => [c.maskId, c.resultId, c.thumbId]),
    ]);
    set((st) => ({
      designs: omit(st.designs, id),
      composites: omit(st.composites, ...composites.map((c) => c.id)),
      projects: touch(st.projects, design.projectId),
    }));
  },

  chooseDesign: (projectId, designId) =>
    set((s) => {
      const designs = { ...s.designs };
      for (const d of Object.values(designs)) {
        if (d.projectId !== projectId) continue;
        const chosen = d.id === designId;
        if (d.chosen !== chosen) designs[d.id] = { ...d, chosen };
      }
      const project = s.projects[projectId];
      const projects =
        project && designId && project.status === "draft"
          ? {
              ...s.projects,
              [projectId]: { ...project, status: "designing" as const },
            }
          : s.projects;
      return { designs, projects: touch(projects, projectId) };
    }),

  createComposite: (input) => {
    const now = Date.now();
    const composite: Composite = {
      ...input,
      id: newId("cmp"),
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({
      composites: { ...s.composites, [composite.id]: composite },
      projects: touch(s.projects, composite.projectId),
    }));
    return composite;
  },

  addComposite: (composite) =>
    set((s) => ({
      composites: { ...s.composites, [composite.id]: composite },
      projects: touch(s.projects, composite.projectId),
    })),

  updateComposite: (id, patch) =>
    set((s) => {
      const prev = s.composites[id];
      if (!prev) return s;
      return {
        composites: {
          ...s.composites,
          [id]: { ...prev, ...patch, updatedAt: Date.now() },
        },
      };
    }),

  removeComposite: (id) => {
    const c = get().composites[id];
    if (!c) return;
    void deleteBlobs([c.maskId, c.resultId, c.thumbId]);
    set((s) => {
      const project = s.projects[c.projectId];
      const projects =
        project?.coverCompositeId === id
          ? {
              ...s.projects,
              [c.projectId]: { ...project, coverCompositeId: undefined },
            }
          : s.projects;
      return { composites: omit(s.composites, id), projects };
    });
  },

  importData: (data) =>
    set((s) => ({
      projects: { ...s.projects, ...data.projects },
      walls: { ...s.walls, ...data.walls },
      designs: { ...s.designs, ...data.designs },
      composites: { ...s.composites, ...data.composites },
    })),

  resetAll: () => set({ ...empty }),
}));

function touch(
  projects: Record<string, Project>,
  id: string,
): Record<string, Project> {
  const p = projects[id];
  if (!p) return projects;
  return { ...projects, [id]: { ...p, updatedAt: Date.now() } };
}

/* ------------------------------------------------------------------ */
/* Selectors. Array-returning selectors must use `useShallow` (zustand v5). */
/* ------------------------------------------------------------------ */

const byCreatedDesc = <T extends { createdAt: number }>(a: T, b: T) =>
  b.createdAt - a.createdAt;

export function useProjects(): Project[] {
  return useAppStore(useShallow((s) => Object.values(s.projects)));
}

export function useProject(id: string | undefined): Project | undefined {
  return useAppStore((s) => (id ? s.projects[id] : undefined));
}

export function useWalls(projectId: string): Wall[] {
  return useAppStore(
    useShallow((s) =>
      Object.values(s.walls)
        .filter((w) => w.projectId === projectId)
        .sort((a, b) => a.createdAt - b.createdAt),
    ),
  );
}

export function useDesigns(projectId: string): Design[] {
  return useAppStore(
    useShallow((s) =>
      Object.values(s.designs)
        .filter((d) => d.projectId === projectId)
        .sort(byCreatedDesc),
    ),
  );
}

export function useComposites(projectId: string): Composite[] {
  return useAppStore(
    useShallow((s) =>
      Object.values(s.composites)
        .filter((c) => c.projectId === projectId)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    ),
  );
}

export interface ProjectCounts {
  walls: number;
  designs: number;
  composites: number;
}

/** Per-project counters for the dashboard. */
export function useAllCounts(): Record<string, ProjectCounts> {
  const walls = useAppStore((s) => s.walls);
  const designs = useAppStore((s) => s.designs);
  const composites = useAppStore((s) => s.composites);
  return useMemo(() => {
    const out: Record<string, ProjectCounts> = {};
    const bump = (pid: string, k: keyof ProjectCounts) => {
      out[pid] ??= { walls: 0, designs: 0, composites: 0 };
      out[pid][k]++;
    };
    for (const w of Object.values(walls)) bump(w.projectId, "walls");
    for (const d of Object.values(designs))
      if (d.status === "ready") bump(d.projectId, "designs");
    for (const c of Object.values(composites))
      if (c.resultId) bump(c.projectId, "composites");
    return out;
  }, [walls, designs, composites]);
}
