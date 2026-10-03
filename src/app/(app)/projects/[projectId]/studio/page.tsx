import type { Metadata } from "next";
import { Suspense } from "react";
import { StudioPage } from "@/features/studio/studio-page";

export const metadata: Metadata = { title: "Studio" };

export default async function Page({ params }: PageProps<"/projects/[projectId]/studio">) {
  const { projectId } = await params;
  return (
    <Suspense fallback={null}>
      <StudioPage projectId={projectId} />
    </Suspense>
  );
}
