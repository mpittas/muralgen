import type { Metadata } from "next";
import { ResultsPage } from "@/features/results/results-page";

export const metadata: Metadata = { title: "Results" };

export default async function Page({ params }: PageProps<"/projects/[projectId]/results">) {
  const { projectId } = await params;
  return <ResultsPage projectId={projectId} />;
}
