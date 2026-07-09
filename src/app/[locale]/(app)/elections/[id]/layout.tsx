import { notFound } from "next/navigation";
import { getElectionDetail } from "@/lib/db/elections";
import { requireSession } from "@/lib/auth/require-session";
import { StatusBadge } from "@/components/elections/status-badge";
import { ElectionTabs } from "@/components/elections/election-tabs";

// Aggregate-root layout for a single election — the ONE place that fetches +
// authorizes it and renders the shared chrome (title · status badge · tab nav).
// Facet pages (page/results/voters) read the same cache()-wrapped getElectionDetail,
// so there is exactly one DB round trip per request and no re-authorization.
// See routing-structure-phase-3-spec.md §1 + domain-architecture-spec.md §5.
export default async function ElectionLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;

  // Authz seam — single choke point guarding every facet.
  // ponytail: no-op passthrough this phase (Phase 2 guard-seam stub).
  // TODO(auth-spec): enforce that the session's organization owns this election;
  // 404/redirect otherwise. One-line swap here guards all facets at once.
  await requireSession();

  const election = await getElectionDetail(id);
  if (!election) notFound();

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
