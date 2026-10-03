import { Badge } from "@/components/ui/badge";
import { STATUS } from "@/lib/status";
import type { ProjectStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}) {
  const s = STATUS[status];
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", className)}>
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {s.label}
    </Badge>
  );
}
