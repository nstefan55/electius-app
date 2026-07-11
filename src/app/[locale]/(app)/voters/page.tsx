import { getTranslations } from "next-intl/server";
import { getElectionsByStatus } from "@/lib/db/elections";
import { requireSession } from "@/lib/auth/require-session";
import { ElectionFunnelList } from "@/components/elections/election-funnel-list";

// Elections list → "select an election to manage its voters". Top-level sidebar section;
// each row funnels into /elections/[id]/voters. Rich UI owned by the voters spec.
export default async function VotersListPage() {
  const t = await getTranslations("dashboard.election.lists.voters");
  const { organizationId } = await requireSession();
  const elections = await getElectionsByStatus(organizationId); // all statuses
  return (
    <ElectionFunnelList
      title={t("title")}
      subtitle={t("subtitle")}
      empty={t("empty")}
      elections={elections}
      hrefFor={(id) => `/elections/${id}/voters`}
    />
  );
}
