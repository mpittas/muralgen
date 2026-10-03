import type { Metadata } from "next";
import { ProjectsView } from "@/components/projects-view";

export const metadata: Metadata = { title: "Starred" };

export default function StarredPage() {
  return <ProjectsView filter="starred" />;
}
