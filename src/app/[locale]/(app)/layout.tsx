import { DashboardShell } from "@/components/dashboard/dashboard-shell";

// (app) group layout — the sidebar+topbar shell around every dashboard-host route.
// ponytail: guard seam reserved for Phase 2 — session + org authz (requireSession())
// lands here as the single choke point. No auth check this phase.
export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <DashboardShell>{children}</DashboardShell>;
}
