"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Ellipsis, ExternalLink, Star, Trash } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppStore } from "@/store/app-store";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StarButton({
  project,
  className,
}: {
  project: Project;
  className?: string;
}) {
  const update = useAppStore((s) => s.updateProject);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={project.starred ? "Remove from starred" : "Add to starred"}
      aria-pressed={project.starred}
      className={className}
      onClick={() => update(project.id, { starred: !project.starred })}
    >
      <Star className={cn(project.starred && "fill-primary text-primary")} />
    </Button>
  );
}

export function ProjectActionsMenu({
  project,
  className,
  onDeleted,
  showOpen = false,
}: {
  project: Project;
  className?: string;
  onDeleted?: () => void;
  showOpen?: boolean;
}) {
  const update = useAppStore((s) => s.updateProject);
  const remove = useAppStore((s) => s.deleteProject);
  const [confirm, setConfirm] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Project actions" className={className}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {showOpen && (
            <DropdownMenuItem asChild>
              <Link href={`/projects/${project.id}`}>
                <ExternalLink /> Open
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => update(project.id, { starred: !project.starred })}>
            <Star /> {project.starred ? "Unstar" : "Star"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              update(project.id, { archived: !project.archived });
              toast(project.archived ? "Project restored" : "Project archived");
            }}
          >
            {project.archived ? <ArchiveRestore /> : <Archive />}
            {project.archived ? "Restore" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>
            <Trash /> Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{project.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the project with all its wall photos, generated
              designs and compositions from this browser. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                remove(project.id);
                toast.success("Project deleted");
                onDeleted?.();
              }}
            >
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
