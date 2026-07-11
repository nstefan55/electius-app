import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardFooter } from "@/components/dashboard/dashboard-footer";
import { StatCards } from "@/components/dashboard/stat-cards";
import { LiveHero } from "@/components/dashboard/live-hero";
import { RecentElections } from "@/components/dashboard/recent-elections";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { getDashboardData } from "@/lib/db/elections";
import { requireSession } from "@/lib/auth/require-session";

// Dynamic by virtue of the awaited Prisma read — force-dynamic is redundant.
export default async function DashboardPage() {
  const { organizationId, user } = await requireSession();
  const { elections, stats } = await getDashboardData(organizationId);

  // First run / no elections: show the onboarding empty state instead.
  if (elections.length === 0) return <DashboardEmptyState />;

  return (
    <div className="flex flex-col gap-7">
      <DashboardHeader organization={user.organization} />
      <StatCards stats={stats} />
      <LiveHero elections={elections} />
      <RecentElections elections={elections} />
      <DashboardCharts elections={elections} />
      <DashboardFooter />
    </div>
  );
}
