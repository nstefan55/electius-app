import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireSession } from "@/lib/auth/require-session";

// (app) group layout — the sidebar+topbar shell around every dashboard-host route.
// requireSession() is the single auth choke point (domain-architecture-spec.md §5, decision B).
// ponytail: no-op passthrough this phase — see require-session.ts. Real session + org
// authz land in the helper via the separate auth spec; no restructuring needed here.
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireSession();
  return <DashboardShell>{children}</DashboardShell>;
}
