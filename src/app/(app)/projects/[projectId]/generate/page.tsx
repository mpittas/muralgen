import type { Metadata } from "next";
import { GeneratePage } from "@/features/generate/generate-page";

export const metadata: Metadata = { title: "Generate" };

export default async function Page({ params }: PageProps<"/projects/[projectId]/generate">) {
  const { projectId } = await params;
  return <GeneratePage projectId={projectId} />;
}
