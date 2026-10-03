import type { Metadata } from "next";
import { ProjectsView } from "@/components/projects-view";

export const metadata: Metadata = { title: "Archived" };

export default function ArchivedPage() {
  return <ProjectsView filter="archived" />;
}
