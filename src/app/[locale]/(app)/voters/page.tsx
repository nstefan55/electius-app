import { getTranslations } from "next-intl/server";
import { getElectionsPage } from "@/lib/db/elections";
import { requireSession } from "@/lib/auth/require-session";
import { VOTERS_PER_PAGE } from "@/lib/constants/pagination";
import { ElectionFunnelList } from "@/components/elections/election-funnel-list";

// Elections list → "select an election to manage its voters". Top-level sidebar section;
// each row funnels into /elections/[id]/voters. Rich UI owned by the voters spec.
//
// Poslužiteljsko stranicanje: ovu listu ništa ne filtrira na klijentu.
export default async function VotersListPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("dashboard.election.lists.voters");
  const { organizationId } = await requireSession();

  // getElectionsPage steže stranicu, pa ?page=abc i ?page=999 ostaju ispravni.
  const { elections, page, pageCount } = await getElectionsPage(
    organizationId,
    Number(sp.page) || 1,
    VOTERS_PER_PAGE,
  );

  return (
    <ElectionFunnelList
      title={t("title")}
      subtitle={t("subtitle")}
      empty={t("empty")}
      elections={elections}
      hrefFor={(id) => `/elections/${id}/voters`}
      page={page}
      pageCount={pageCount}
      basePath="/voters"
    />
  );
}
