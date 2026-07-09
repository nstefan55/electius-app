import { getTranslations } from "next-intl/server";
import { getElectionsByStatus } from "@/lib/db/elections";
import { ArchiveList } from "@/components/elections/archive-list";

export const dynamic = "force-dynamic";

// ARCHIVED-elections list — top-level sidebar section, NO detail route. Inline row
// actions funnel to /elections/[id]/results. Rich UI/search owned by elections-archived spec.
export default async function ArchivePage() {
  const t = await getTranslations("dashboard.election.lists.archive");
  const elections = await getElectionsByStatus("ARCHIVED");
  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold text-neutral-800">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">{t("subtitle")}</p>
      </header>
      <ArchiveList elections={elections} />
    </div>
  );
}
