import type { Metadata } from "next";
import { DesignsPage } from "@/features/designs/designs-page";

export const metadata: Metadata = { title: "Designs" };

export default async function Page({ params }: PageProps<"/projects/[projectId]/designs">) {
  const { projectId } = await params;
  return <DesignsPage projectId={projectId} />;
}
