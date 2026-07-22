import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { requireSession } from "@/lib/auth/require-session";
import { getElectionsByStatus } from "@/lib/db/elections";
import { ElectionsList } from "@/components/elections/elections-list";
import { DashboardFooter } from "@/components/dashboard/dashboard-footer";
import { Link } from "@/i18n/navigation";

export default async function ElectionsPage() {
  const { organizationId } = await requireSession();
  const [elections, t, tp] = await Promise.all([
    getElectionsByStatus(organizationId),
    getTranslations("dashboard.electionsPage"),
    getTranslations("dashboard.page"),
  ]);

  const closed = elections.filter((e) => e.status === "CLOSED").length;
  const archived = elections.filter((e) => e.status === "ARCHIVED").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-neutral-800">
            {t("title")}
          </h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            {t("summary", { total: elections.length, closed, archived })}
          </p>
        </div>
        <Link
          href="/elections/new"
          className="inline-flex h-12 items-center gap-2 rounded-md bg-primary px-5.5 text-base font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-brand-600 focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
        >
          <Plus className="size-5" />
          {tp("newElection")}
        </Link>
      </div>

      <ElectionsList elections={elections} />

      <DashboardFooter />
    </div>
  );
}
