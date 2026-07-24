import { useTranslations } from "next-intl";
import { getElectionDetail, getElectionStartInfo } from "@/lib/db/elections";
import { requireSession } from "@/lib/auth/require-session";
import { StartElectionCard } from "@/components/elections/start-election-card";
import type { ElectionStatus } from "@/lib/elections-view";

// Overview facet (default tab) — status-adaptive SHELL. DRAFT renders the
// manual-start screen (election-manual-start-spec); the other branches are
// labelled scaffolds owned by election-overview-phase-* specs.
// Reads the same cache()-wrapped election as the layout (no extra query / authz):
// same (id, organizationId) key → single DB round trip per request.
export default async function ElectionOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organizationId } = await requireSession();
  const election = await getElectionDetail(id, organizationId);
  if (!election) return null; // layout already rendered notFound()

  if (election.status === "DRAFT") {
    // Same cache() key as the layout's call — no extra round trip.
    const startInfo = await getElectionStartInfo(id, organizationId);
    return (
      <StartElectionCard
        id={id}
        title={election.name}
        electionType={startInfo?.electionType ?? "STANDARD"}
        candidates={startInfo?.candidates ?? 0}
        voters={election.voters}
        opens={election.opens}
        closes={election.closes}
      />
    );
  }

  // SCHEDULED → setup shell · ACTIVE → live/management shell · CLOSED/ARCHIVED → sealed shell
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
