"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, FolderKanban, Plus, Settings, Star } from "lucide-react";
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
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { BlobImage } from "@/components/blob-image";
import { useCovers } from "@/lib/covers";
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
          <span className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            Local-only prototype
          </span>
          <ThemeToggle />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
