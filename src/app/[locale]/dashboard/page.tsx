import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardFooter } from "@/components/dashboard/dashboard-footer";
import { StatCards } from "@/components/dashboard/stat-cards";
import { LiveHero } from "@/components/dashboard/live-hero";
import { RecentElections } from "@/components/dashboard/recent-elections";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { getDashboardData } from "@/lib/db/elections";


export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { elections, stats } = await getDashboardData();

  // First run / no elections: show the onboarding empty state instead.
  if (elections.length === 0) return <DashboardEmptyState />;

  return (
    <div className="flex flex-col gap-7">
      <DashboardHeader />
      <StatCards stats={stats} />
      <LiveHero elections={elections} />
      <RecentElections elections={elections} />
      <DashboardCharts elections={elections} />
      <DashboardFooter />
    </div>
  );
}
