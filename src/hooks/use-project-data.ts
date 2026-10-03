"use client";

import { useMemo } from "react";
import {
  useComposites,
  useDesigns,
  useProject,
  useWalls,
} from "@/store/app-store";

/** Everything a project page needs, derived once. */
export function useProjectData(projectId: string) {
  const project = useProject(projectId);
  const walls = useWalls(projectId);
  const designs = useDesigns(projectId);
  const composites = useComposites(projectId);

  return useMemo(() => {
    const readyDesigns = designs.filter((d) => d.status === "ready");
    return {
      project,
      walls,
      designs,
      readyDesigns,
      chosenDesign: readyDesigns.find((d) => d.chosen),
      composites,
      results: composites.filter((c) => c.resultId),
    };
  }, [project, walls, designs, composites]);
}
