import type { ProjectStatus } from "@/lib/types";

export const STATUS_ORDER: ProjectStatus[] = [
  "draft",
  "designing",
  "approved",
  "painting",
  "completed",
];

export const STATUS: Record<
  ProjectStatus,
  { label: string; hint: string; dot: string }
> = {
  draft: { label: "Draft", hint: "Just getting started", dot: "bg-muted-foreground/60" },
  designing: { label: "Designing", hint: "Exploring ideas", dot: "bg-spray-violet" },
  approved: { label: "Approved", hint: "Design signed off", dot: "bg-spray-cyan" },
  painting: { label: "Painting", hint: "On the wall now", dot: "bg-spray-orange" },
  completed: { label: "Completed", hint: "Wall is finished", dot: "bg-spray-lime" },
};
