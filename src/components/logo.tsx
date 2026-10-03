import { SprayCan } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_0_1px_rgba(0,0,0,0.08)]">
        <SprayCan className="size-[18px] -rotate-12" strokeWidth={2.2} />
      </span>
      {showWordmark && (
        <span className="font-heading text-lg leading-none font-bold tracking-tight">
          Mural<span className="text-muted-foreground">Gen</span>
        </span>
      )}
    </span>
  );
}
