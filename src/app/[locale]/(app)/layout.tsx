import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireSession } from "@/lib/auth/require-session";

// (app) group layout — the sidebar+topbar shell around every dashboard-host route.
// requireSession() is the single auth choke point (domain-architecture-spec.md §5, decision B).
// The user object is prop-drilled down to SidebarNav + DashboardHeader so client
// components never import mock-data directly (finding #3 fix).
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user } = await requireSession();
  // Explicit projection — TS types don't strip runtime fields; without this the
  // full user (email, isPro) would be serialized into the RSC payload. `image`
  // is listed by name, not waved through: it is a public URL the admin uploads
  // and removes themselves, and the sidebar needs it to show their avatar.
  const shellUser = {
    name: user.name,
    image: user.image,
    organization: user.organization,
  };
  return <DashboardShell user={shellUser}>{children}</DashboardShell>;
}
