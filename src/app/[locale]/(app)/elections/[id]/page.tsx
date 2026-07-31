import {
  getElectionDetail,
  getElectionOverview,
  getElectionStartInfo,
} from "@/lib/db/elections";
import { requireSession } from "@/lib/auth/require-session";
import { StartElectionCard } from "@/components/elections/start-election-card";
import { ElectionOverview } from "@/components/elections/election-overview";

// Overview facet (default tab). DRAFT renders the manual-start screen
// (election-manual-start-spec); every other status renders the overview body
// (election-overview-phase-2-spec).
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

  const overview = await getElectionOverview(id, organizationId);
  if (!overview) return null;

  return (
    <ElectionOverview
      id={id}
      status={election.status}
      opens={election.opens}
      closes={election.closes}
      voters={election.voters}
      voted={election.voted}
      resultsMode={election.resultsMode}
      electionType={overview.electionType}
      votingType={overview.votingType}
      quorumThreshold={overview.quorumThreshold}
      voterReminder24h={overview.voterReminder24h}
      candidates={overview.candidates}
      notInvited={overview.notInvited}
      voted24h={overview.voted24h}
      // Server render time — the countdown's first paint must match the server's
      // (see ElectionOverview: deriving Date.now() at hydration would mismatch).
      // eslint-disable-next-line react-hooks/purity -- Server Component, ne hook
      nowMs={Date.now()}
    />
  );
}
