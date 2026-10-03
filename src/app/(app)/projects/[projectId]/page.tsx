import type { Metadata } from "next";
import { OverviewPage } from "@/features/overview/overview-page";

export const metadata: Metadata = { title: "Overview" };

export default async function Page({ params }: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  return <OverviewPage projectId={projectId} />;
}
