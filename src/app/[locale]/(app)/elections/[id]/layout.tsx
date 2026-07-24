import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getElectionDetail, getElectionStartInfo } from "@/lib/db/elections";
import { requireSession } from "@/lib/auth/require-session";
import { StatusBadge } from "@/components/elections/status-badge";
import { ElectionTabs } from "@/components/elections/election-tabs";

// Aggregate-root layout for a single election — the ONE place that fetches +
// authorizes it and renders the shared chrome (title · status badge · tab nav).
// Facet pages (page/results/voters) read the same cache()-wrapped getElectionDetail,
// so there is exactly one DB round trip per request and no re-authorization.
// See routing-structure-phase-3-spec.md §1 + domain-architecture-spec.md §5.
//
// DRAFT elections swap the chrome for the manual-start header (election-manual-
// start-spec): "Start election" title + "{title} — {type}" subtitle, no tabs —
// the overview page renders the start card underneath.
export default async function ElectionLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;

  // Authz seam — single choke point guarding every facet.
  // Org-scoping enforced via getElectionDetail(id, orgId): cross-org id → null → 404.
  // Same request → same cache() key → facets share ONE round trip.
  const { organizationId } = await requireSession();
  const election = await getElectionDetail(id, organizationId);
  if (!election) notFound();

  if (election.status === "DRAFT") {
    const [t, tTypes, startInfo] = await Promise.all([
      getTranslations("dashboard.election.start"),
      getTranslations("dashboard.wizard.step1.types"),
      getElectionStartInfo(id, organizationId),
    ]);
    return (
      <div className="p-8">
        <header className="mb-6">
          <h1 className="font-heading text-2xl font-semibold text-neutral-800">
            {t("pageTitle")}
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            {election.name}
            {startInfo ? ` — ${tTypes(`${startInfo.electionType}.label`)}` : ""}
          </p>
        </header>
        {children}
      </div>
    );
  }

  return (
    <div className="p-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold text-neutral-800">
            {election.name}
          </h1>
          <StatusBadge status={election.status} />
        </div>
        <div className="mt-4">
          <ElectionTabs id={id} />
        </div>
      </header>
      {children}
    </div>
  );
}
