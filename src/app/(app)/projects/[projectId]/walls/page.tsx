import type { Metadata } from "next";
import { WallsPage } from "@/features/walls/walls-page";

export const metadata: Metadata = { title: "Walls" };

export default async function Page({ params }: PageProps<"/projects/[projectId]/walls">) {
  const { projectId } = await params;
  return <WallsPage projectId={projectId} />;
}
