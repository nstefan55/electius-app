import { useTranslations } from "next-intl";
import { getElectionDetail } from "@/lib/db/elections";
import type { ElectionStatus } from "@/lib/elections-view";

// Overview facet (default tab) — status-adaptive SHELL only. The three branches are
// labelled scaffolds; detailed content is owned by election-overview-phase-* specs.
// Reads the same cache()-wrapped election as the layout (no extra query / authz).
export default async function ElectionOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const election = await getElectionDetail(id);
  if (!election) return null; // layout already rendered notFound()

  // DRAFT/SCHEDULED → setup shell · ACTIVE → live/management shell · CLOSED/ARCHIVED → sealed shell
  const variant: "draft" | "active" | "closed" =
    election.status === "ACTIVE"
      ? "active"
      : election.status === "CLOSED" || election.status === "ARCHIVED"
        ? "closed"
        : "draft";

  return <OverviewShell variant={variant} status={election.status} />;
}

function OverviewShell({
  variant,
  status,
}: {
  variant: "draft" | "active" | "closed";
  status: ElectionStatus;
}) {
  const t = useTranslations("dashboard.election.overview");
  return (
    <section className="rounded-lg border border-dashed border-border bg-neutral-50 p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
        {t("scaffoldTag")} · {status}
      </p>
      <h2 className="mt-1 font-heading text-lg font-semibold text-neutral-800">
        {t(`${variant}.heading`)}
      </h2>
      <p className="mt-1 text-sm text-neutral-600">{t(`${variant}.note`)}</p>
    </section>
  );
}
