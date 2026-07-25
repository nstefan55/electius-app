import "server-only";

import { prisma } from "@/lib/prisma";
import { mintTokenForVoter, mintTokensForPendingVoters } from "./token.service";
import { sendInvitationEmails } from "./email.service";

// Publication pipeline (election-publication-spec §2): tokens → chunked Resend
// batch sends → per-voter INVITED tracking. Runs synchronously in-request
// (decision: sync now, chunked) — a timeout mid-send is self-consistent: sent
// chunks are INVITED, the rest PENDING, so a retry resumes where it stopped.
// No rollback is attempted; emails cannot be unsent.

// Resend's batch endpoint takes ≤100 emails per call.
export const CHUNK_SIZE = 100;

export function chunk<T>(items: T[], size: number = CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export interface PublishResult {
  sent: number;
  failed: number;
}

// Idempotent: only PENDING voters get tokens + emails, so calling this on an
// already-published election is a no-op — which is exactly what the Retry
// button and the scheduled sweep rely on.
export async function publishElection(
  electionId: string,
): Promise<PublishResult> {
  const election = await prisma.election.findUnique({
    where: { id: electionId },
    select: { title: true, organization: { select: { name: true } } },
  });
  if (!election) return { sent: 0, failed: 0 };

  const minted = await mintTokensForPendingVoters(electionId);
  if (minted.length === 0) return { sent: 0, failed: 0 };

  const invitation = {
    title: election.title,
    organizationName: election.organization.name,
  };

  let sent = 0;
  let failed = 0;

  // Sequential, not parallel — respects Resend's 2 req/s rate limit. Failure
  // granularity is per chunk (a batch call succeeds/fails whole); a failed
  // chunk leaves its voters PENDING → retryable via resendInvitations.
  for (const batch of chunk(minted)) {
    try {
      await sendInvitationEmails(batch, invitation);
      await prisma.voter.updateMany({
        where: { id: { in: batch.map((m) => m.voterId) } },
        data: { status: "INVITED" },
      });
      sent += batch.length;
    } catch {
      failed += batch.length;
    }
  }

  return { sent, failed };
}

// Voter-initiated resend (voter-flow spec §4: QR entry + the expired-link CTA).
// Serves PENDING and INVITED voters of an ACTIVE election; anything else —
// unknown email, already voted, wrong election status — is a silent no-op so
// the caller can return an identical enumeration-safe response either way.
// Re-mint revokes any previously emailed link for this voter.
export async function resendVoterLink(
  electionId: string,
  email: string,
): Promise<void> {
  const election = await prisma.election.findUnique({
    where: { id: electionId },
    select: {
      status: true,
      title: true,
      organization: { select: { name: true } },
    },
  });
  if (!election || election.status !== "ACTIVE") return;

  const voter = await prisma.voter.findFirst({
    where: {
      electionId,
      email: { equals: email.trim(), mode: "insensitive" },
      status: { not: "VOTED" },
    },
    select: { id: true, status: true },
  });
  if (!voter) return;

  const minted = await mintTokenForVoter(voter.id);
  if (!minted) return;

  await sendInvitationEmails([minted], {
    title: election.title,
    organizationName: election.organization.name,
  });

  // A PENDING voter has now genuinely been emailed — same semantics as the
  // bulk pipeline's per-chunk flip. INVITED stays INVITED.
  if (voter.status === "PENDING") {
    await prisma.voter.updateMany({
      where: { id: voter.id },
      data: { status: "INVITED" },
    });
  }
}
