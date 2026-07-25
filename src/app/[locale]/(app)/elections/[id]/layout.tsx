import { notFound } from "next/navigation";
import { getBallotPreview, getElectionDetail } from "@/lib/db/elections";
import { requireSession } from "@/lib/auth/require-session";
import { ElectionTopbar } from "@/components/elections/election-topbar";
import { ElectionTabs } from "@/components/elections/election-tabs";

// Aggregate-root layout for a single election — the ONE place that fetches +
// authorizes it and renders the shared chrome (top bar · status · tab nav).
// Facet pages (page/results/voters) read the same cache()-wrapped getElectionDetail,
// so there is exactly one DB round trip per request and no re-authorization.
// See routing-structure-phase-3-spec.md §1 + domain-architecture-spec.md §5.
//
// The top bar renders for EVERY status (election-overview-phase-1-spec) — it
// replaced the DRAFT-only "Start election" header, since Edit/Remove are exactly
// the actions a draft needs. The start card underneath keeps its own heading.
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
  const { user, organizationId } = await requireSession();
  const election = await getElectionDetail(id, organizationId);
  if (!election) notFound();

  // Ballot options for the top bar's preview modal — a second small read, only
  // here (the facets never need it).
  const ballot = await getBallotPreview(id, organizationId);

  return (
    <>
      <ElectionTopbar
        id={id}
        title={election.name}
        status={election.status}
        opens={election.opens}
        closes={election.closes}
        orgName={user.organization}
        multiChoice={ballot?.votingType === "MULTI_CHOICE"}
        options={ballot?.options ?? []}
      />
      <div className="mb-6">
        <ElectionTabs id={id} />
      </div>
      {children}
    </>
  );
}
