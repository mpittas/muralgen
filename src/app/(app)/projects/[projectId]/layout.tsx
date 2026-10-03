import { ProjectShell } from "@/components/project-shell";

export default async function ProjectLayout({
  children,
  params,
}: LayoutProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  return <ProjectShell projectId={projectId}>{children}</ProjectShell>;
}
