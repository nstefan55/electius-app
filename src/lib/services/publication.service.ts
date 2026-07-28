import "server-only";

import type { VoterStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  mintTokenForVoter,
  mintTokensForPendingVoters,
  mintTokensForVoters,
  windowOver,
  type MintedToken,
} from "./token.service";
import {
  sendInvitationEmails,
  type InvitationElection,
} from "./email.service";

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
  // Zašto je poslano 0: "nitko nije trebao pozivnicu" i "nitko nije dostupan
  // jer je glasanje gotovo" su različite činjenice. Jedan diskriminator za sve
  // tri površine koje prikazuju rezultat slanja.
  blocked?: "windowOver";
}

// Izbori s podacima koje slanje treba: tekst e-pošte + rok za provjeru prozora.
export type SendableElection = InvitationElection & {
  startsAt: Date;
  endsAt: Date;
};

// Sequential, not parallel — respects Resend's 2 req/s rate limit. Failure
// granularity is per chunk (a batch call succeeds/fails whole); a failed chunk
// leaves its voters PENDING → retryable via resendInvitations.
async function sendInChunks(
  minted: MintedToken[],
  invitation: InvitationElection,
): Promise<PublishResult> {
  let sent = 0;
  let failed = 0;

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

// Idempotent: only PENDING voters get tokens + emails, so calling this on an
// already-published election is a no-op — which is exactly what the Retry
// button and the scheduled sweep rely on.
export async function publishElection(
  electionId: string,
): Promise<PublishResult> {
  const election = await prisma.election.findUnique({
    where: { id: electionId },
    select: {
      title: true,
      startsAt: true,
      endsAt: true,
      organization: { select: { name: true } },
    },
  });
  if (!election) return { sent: 0, failed: 0 };

  // Prije kovanja: mrtva poveznica ne smije nikad otići.
  if (windowOver(election)) {
    return { sent: 0, failed: 0, blocked: "windowOver" };
  }

  const minted = await mintTokensForPendingVoters(electionId);
  if (minted.length === 0) return { sent: 0, failed: 0 };

  return sendInChunks(minted, {
    title: election.title,
    organizationName: election.organization.name,
  });
}

// Jedan birač, jedna poveznica — dijele je resend iz glasačkog toka i redak u
// popisu birača. Re-mint poništava prethodno poslanu poveznicu.
// Baca ako slanje padne; pozivatelj odlučuje što s tim.
export type InviteResult = "sent" | "notFound" | "windowOver";

export async function inviteVoter(
  voterId: string,
  currentStatus: VoterStatus,
  election: SendableElection,
): Promise<InviteResult> {
  if (windowOver(election)) return "windowOver";

  const minted = await mintTokenForVoter(voterId);
  if (!minted) return "notFound";

  await sendInvitationEmails([minted], election);

  // PENDING birač je sad stvarno dobio e-poštu — ista semantika kao skupni
  // prijelaz po komadu. INVITED ostaje INVITED.
  if (currentStatus === "PENDING") {
    await prisma.voter.updateMany({
      where: { id: voterId },
      data: { status: "INVITED" },
    });
  }
  return "sent";
}

// Voter-initiated resend (voter-flow spec §4: QR entry + the expired-link CTA).
// Serves PENDING and INVITED voters of an ACTIVE election; anything else —
// unknown email, already voted, wrong election status — is a silent no-op so
// the caller can return an identical enumeration-safe response either way.
export async function resendVoterLink(
  electionId: string,
  email: string,
): Promise<void> {
  const election = await prisma.election.findUnique({
    where: { id: electionId },
    select: {
      status: true,
      title: true,
      startsAt: true,
      endsAt: true,
      organization: { select: { name: true } },
    },
  });
  // Prozor se provjerava PRIJE traženja birača — grana ovisi o izborima, ne o
  // tome je li adresa na popisu, pa nabrajanje ostaje nemoguće.
  // Nedostižno kroz UI otkako votingOver zatvara zaslon, ali endpoint je javan.
  if (!election || election.status !== "ACTIVE" || windowOver(election)) return;

  const voter = await prisma.voter.findFirst({
    where: {
      electionId,
      email: { equals: email.trim(), mode: "insensitive" },
      status: { not: "VOTED" },
    },
    select: { id: true, status: true },
  });
  if (!voter) return;

  await inviteVoter(voter.id, voter.status, {
    title: election.title,
    organizationName: election.organization.name,
    startsAt: election.startsAt,
    endsAt: election.endsAt,
  });
}

// ───────── Reminders (election-overview-phase-3-spec) ─────────

export interface ReminderTargets {
  recipients: string[]; // voter ids
  alreadyVoted: number;
  expired: number;
}

interface ReminderVoter {
  id: string;
  status: VoterStatus;
  token: { expiresAt: Date } | null;
}

// The one rule that decides who gets a reminder — the modal's preview counts and
// the actual send both go through it, so the button cannot promise "Send to 42"
// and deliver 39.
//
// `windowOver` means a freshly minted token would be born expired (expiry is
// derived from the election, not the voter), so nobody is reachable at all.
export function partitionReminderTargets(
  voters: ReminderVoter[],
  now: Date,
  windowOver: boolean,
): ReminderTargets {
  const recipients: string[] = [];
  let alreadyVoted = 0;
  let expired = 0;

  for (const voter of voters) {
    if (voter.status === "VOTED") {
      alreadyVoted++;
    } else if (windowOver || (voter.token != null && voter.token.expiresAt <= now)) {
      // An expired link can't be revived by re-minting — the replacement
      // inherits the same election-derived expiry.
      expired++;
    } else {
      // PENDING (never successfully emailed) and INVITED (emailed, hasn't
      // voted) both qualify — decision 2026-07-25.
      recipients.push(voter.id);
    }
  }

  return { recipients, alreadyVoted, expired };
}

export async function getReminderTargets(
  electionId: string,
): Promise<ReminderTargets> {
  const empty: ReminderTargets = { recipients: [], alreadyVoted: 0, expired: 0 };

  const election = await prisma.election.findUnique({
    where: { id: electionId },
    select: { startsAt: true, endsAt: true },
  });
  if (!election) return empty;

  const now = new Date();
  const voters = await prisma.voter.findMany({
    where: { electionId },
    select: { id: true, status: true, token: { select: { expiresAt: true } } },
  });

  // Isto pravilo koje čuva pet ostalih staza — ovdje je i nastalo.
  return partitionReminderTargets(voters, now, windowOver(election, now));
}

// Re-mints on the way out: the raw token is unrecoverable by design, so a
// reminder necessarily carries a NEW link and the original invitation's link
// stops working. A voter who clicks the older email lands on the voter-flow's
// invalid-link screen, which offers them a fresh one.
// ponytail: reuses the invitation email verbatim (spec: "sends invite") — add
// dedicated reminder copy if the wording ever needs to differ.
export async function sendReminders(
  electionId: string,
): Promise<PublishResult> {
  const election = await prisma.election.findUnique({
    where: { id: electionId },
    select: { title: true, organization: { select: { name: true } } },
  });
  if (!election) return { sent: 0, failed: 0 };

  const { recipients } = await getReminderTargets(electionId);
  const minted = await mintTokensForVoters(electionId, recipients);
  if (minted.length === 0) return { sent: 0, failed: 0 };

  return sendInChunks(minted, {
    title: election.title,
    organizationName: election.organization.name,
  });
}
