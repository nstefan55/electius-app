import { getTranslations } from "next-intl/server";
import { getElectionsByStatus } from "@/lib/db/elections";
import { ElectionFunnelList } from "@/components/elections/election-funnel-list";

export const dynamic = "force-dynamic";

// CLOSED-elections list — a top-level sidebar section, NOT nested under [id]. Each row
// funnels into the canonical /elections/[id]/results detail. Rich UI: results-overview spec.
export default async function ResultsListPage() {
  const t = await getTranslations("dashboard.election.lists.results");
  const elections = await getElectionsByStatus("CLOSED");
  return (
    <ElectionFunnelList
      title={t("title")}
      subtitle={t("subtitle")}
      empty={t("empty")}
      elections={elections}
      hrefFor={(id) => `/elections/${id}/results`}
    />
  );
}
