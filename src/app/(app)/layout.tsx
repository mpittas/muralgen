import { AppSidebar } from "@/components/app-sidebar";
import { AuthGate } from "@/components/auth-gate";
import { LegacyImportBanner } from "@/components/legacy-import-banner";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGate>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <LegacyImportBanner />
          {children}
        </SidebarInset>
        <NewProjectDialog />
      </SidebarProvider>
    </AuthGate>
  );
}
