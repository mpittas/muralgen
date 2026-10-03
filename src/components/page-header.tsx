"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  children,
  actions,
  className,
}: {
  title?: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70",
        className,
      )}
    >
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
      {title && (
        <h1 className="truncate font-heading text-base font-semibold">{title}</h1>
      )}
      {children}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </header>
  );
}
