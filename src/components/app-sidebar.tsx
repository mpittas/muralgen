"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, ChevronsUpDown, FolderKanban, LogOut, Plus, Settings, Star, User } from "lucide-react";
import { toast } from "sonner";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { authErrorMessage, signOut } from "@/lib/firebase/auth";
import { useAuthStore } from "@/store/auth-store";
import { useSyncStore } from "@/store/sync-store";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { BlobImage } from "@/components/blob-image";
import { useCovers } from "@/lib/covers";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/hooks/use-hydrated";
import { useProjects } from "@/store/app-store";
import { useUiStore } from "@/store/ui-store";

const NAV = [
  { href: "/", label: "All projects", icon: FolderKanban },
  { href: "/starred", label: "Starred", icon: Star },
  { href: "/archived", label: "Archived", icon: Archive },
];

export function AppSidebar() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const projects = useProjects();
  const covers = useCovers();
  const setNewProjectOpen = useUiStore((s) => s.setNewProjectOpen);
  const user = useAuthStore((s) => s.user);
  const sync = useSyncStore();

  const recent = hydrated
    ? [...projects]
        .filter((p) => !p.archived)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 6)
    : [];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3 p-3">
        <Link href="/" className="rounded-lg px-1 py-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Logo />
        </Link>
        <Button
          onClick={() => setNewProjectOpen(true)}
          className="w-full justify-start group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <Plus />
          <span className="group-data-[collapsible=icon]:hidden">New project</span>
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.label}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {recent.length > 0 && (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>Recent</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {recent.map((p) => (
                  <SidebarMenuItem key={p.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith(`/projects/${p.id}`)}
                    >
                      <Link href={`/projects/${p.id}`}>
                        <span className="size-5 shrink-0 overflow-hidden rounded-md bg-muted">
                          {covers[p.id] ? (
                            <BlobImage
                              id={covers[p.id]!.thumbId}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : (
                            <span className="bg-brick block size-full" />
                          )}
                        </span>
                        <span className="truncate">{p.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname === "/settings"}
              tooltip="Settings"
            >
              <Link href="/settings">
                <Settings />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex items-center justify-between px-1 group-data-[collapsible=icon]:justify-center">
          <span
            role="status"
            className={cn(
              "text-xs group-data-[collapsible=icon]:hidden",
              sync.error || sync.uploadError ? "text-destructive" : "text-muted-foreground",
            )}
            title={sync.error ?? sync.uploadError ?? undefined}
          >
            {sync.error
              ? "Sync problem"
              : sync.uploadError
                ? "Image upload failed"
                : !sync.ready
                  ? "Loading…"
                  : sync.pendingUploads > 0
                    ? `Uploading ${sync.pendingUploads} image${sync.pendingUploads === 1 ? "" : "s"}…`
                    : "Synced to your account"}
          </span>
          <ThemeToggle />
        </div>
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton size="lg" tooltip={user.displayName ?? user.email ?? "Account"}>
                <UserAvatar user={user} className="size-7" />
                <span className="grid min-w-0 flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-medium">{user.displayName || user.email}</span>
                  {user.displayName && (
                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  )}
                </span>
                <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile">
                  <User /> Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => signOut().catch((err) => toast.error(authErrorMessage(err)))}
              >
                <LogOut /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
