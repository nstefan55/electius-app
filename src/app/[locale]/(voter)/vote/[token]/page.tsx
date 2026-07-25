import { getBallotState } from "@/lib/services/vote.service";
import { VoteFlow } from "@/components/voter/vote-flow";
import { RequestLinkForm } from "@/components/voter/request-link-form";
import { VoterStateScreen } from "@/components/voter/state-screens";

// /vote/[segment] — the voter's single entry point (voter-flow spec §1). The
// segment is a magic-link token (hash lookup) or an election id (QR poster /
// "request a new link"). getBallotState routes every request to its designed
// screen server-side; the raw token reaches the client only inside VoteFlow
// for the one POST /api/vote call. Never logged.
export default async function VoteBallotPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ballot = await getBallotState(token);

  if (ballot.state === "ballot") {
    const { election, options } = ballot;
    return (
      <VoteFlow
        token={token}
        election={{
          id: election.id,
          title: election.title,
          description: election.description,
          votingType: election.votingType,
          organizationName: election.organizationName,
          endsAt: election.endsAt.toISOString(),
          hasCloseDate: election.endsAt.getTime() > election.startsAt.getTime(),
        }}
        options={options}
      />
    );
  }

  if (ballot.state === "qrEntry") {
    return (
      <RequestLinkForm
        electionId={ballot.election.id}
        electionTitle={ballot.election.title}
      />
    );
  }

  return <VoterStateScreen ballot={ballot} />;
}
