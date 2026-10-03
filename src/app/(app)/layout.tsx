import { AppSidebar } from "@/components/app-sidebar";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">{children}</SidebarInset>
      <NewProjectDialog />
    </SidebarProvider>
  );
}
