import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireSession } from "@/lib/auth/require-session";
import { showProBadge } from "@/lib/services/entitlement.service";

// (app) group layout — the sidebar+topbar shell around every dashboard-host route.
// requireSession() is the single auth choke point (domain-architecture-spec.md §5, decision B).
// The user object is prop-drilled down to SidebarNav + DashboardHeader so client
// components never reach for session data themselves (finding #3 fix).
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user, organizationId, accessibility } = await requireSession();
  // Explicit projection — TS types don't strip runtime fields; without this the
  // full user (email, isPro) would be serialized into the RSC payload. `image`
  // is listed by name, not waved through: it is a public URL the admin uploads
  // and removes themselves, and the sidebar needs it to show their avatar.
  //
  // `showPro` se dodaje IMENOM i nije nazvan isPro: to je presuda razrješivača,
  // ne stupac, a polje s imenom stupca poziva sljedećeg čitatelja da ga tako i
  // tretira. Pravilo živi u entitlement.service — ovdje se samo pita.
  const shellUser = {
    name: user.name,
    image: user.image,
    organization: user.organization,
    showPro: await showProBadge(organizationId),
  };
  // Beta oznaka: izričita zastavica, ne NEXT_PUBLIC_ — te se ugrađuju u build,
  // pa bi promjena tražila novi deploy i server i klijent bi se mogli razići.
  // Zaboravljena varijabla znači da istinita tvrdnja ostane neprikazana;
  // obrnuto zadano ispisivalo bi "Beta" nad lansiranim proizvodom.
  const beta = process.env.BETA_BADGE_ENABLED === "true";
  // Preferencije se poslužuju sa servera, pa nema bljeska neprimijenjenog
  // stila — zato se ne čitaju na klijentu pri montiranju.
  return (
    <DashboardShell user={shellUser} accessibility={accessibility} beta={beta}>
      {children}
    </DashboardShell>
  );
}
