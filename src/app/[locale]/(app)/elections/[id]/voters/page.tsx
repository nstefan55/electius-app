import { notFound } from "next/navigation";
import type { VoterStatus } from "@/generated/prisma/client";
import { requireSession } from "@/lib/auth/require-session";
import { getElectionDetail } from "@/lib/db/elections";
import { getVoterRoster } from "@/lib/db/voters";
import { VoterRoster } from "@/components/voters/voter-roster";

// Popis birača — faceta izbora (voter-management-spec). Chrome (naslov, značka,
// tabovi) dolazi iz [id]/layout.tsx; ovdje se čita samo popis.
//
// getElectionDetail je cache()-an i layout ga je već pozvao → bez dodatnog
// upita. Popis je zaseban stranicani upit, ne prošireni ELECTION_SELECT.

const STATUSES = ["PENDING", "INVITED", "VOTED"] as const;

const asStatus = (v?: string): VoterStatus | undefined =>
  STATUSES.includes(v as (typeof STATUSES)[number])
    ? (v as VoterStatus)
    : undefined;

export default async function ElectionVotersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const { organizationId } = await requireSession();
  const election = await getElectionDetail(id, organizationId);
  if (!election) notFound();

  const status = asStatus(sp.status);
  const q = sp.q?.slice(0, 120) ?? "";
  const page = Math.max(1, Number(sp.page) || 1);

  const roster = await getVoterRoster(id, organizationId, { page, q, status });
  if (!roster) notFound();

  return (
    <VoterRoster
      electionId={id}
      electionStatus={election.status}
      roster={roster}
      query={{ q, status: status ?? "" }}
    />
  );
}
