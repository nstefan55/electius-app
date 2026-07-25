import "server-only";

import { createHash, randomBytes } from "crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Voter token minting (election-publication-spec §1). Stage 1 of the security
// chain of custody: the 256-bit raw token exists ONLY in this module's return
// value and the outbound email body — the DB stores its SHA-256 hash, nothing
// else. Never log it, never persist it, never return it to the admin.

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface MintedToken {
  voterId: string;
  email: string;
  firstName: string | null;
  rawToken: string;
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Expiry rule: tokens die with the election. When endsAt is the wizard
// placeholder (unscheduled close, endsAt <= startsAt) fall back to a 30-day
// safety ceiling from activation. Defense-in-depth — the ballot flow also
// checks election status, which covers early close.
export function tokenExpiry(startsAt: Date, endsAt: Date, now: Date = new Date()): Date {
  if (endsAt.getTime() <= startsAt.getTime()) {
    return new Date(now.getTime() + THIRTY_DAYS_MS);
  }
  return endsAt;
}

// Re-mint a single voter's token (voter-flow spec: QR entry / "request a new
// link"). Unlike the bulk PENDING minter below, this serves INVITED voters too
// — status is the caller's concern. Delete + re-mint revokes the previously
// emailed link. Returns null for an unknown voter.
export async function mintTokenForVoter(
  voterId: string,
): Promise<MintedToken | null> {
  const voter = await prisma.voter.findUnique({
    where: { id: voterId },
    select: {
      id: true,
      email: true,
      firstName: true,
      electionId: true,
      election: { select: { startsAt: true, endsAt: true } },
    },
  });
  if (!voter) return null;

  const minted: MintedToken = {
    voterId: voter.id,
    email: voter.email,
    firstName: voter.firstName,
    rawToken: randomBytes(32).toString("base64url"),
  };

  await prisma.$transaction([
    prisma.voterToken.deleteMany({ where: { voterId: voter.id } }),
    prisma.voterToken.createMany({
      data: [
        {
          hash: hashToken(minted.rawToken),
          voterId: voter.id,
          electionId: voter.electionId,
          expiresAt: tokenExpiry(voter.election.startsAt, voter.election.endsAt),
        },
      ],
    }),
  ]);

  return minted;
}

// Bulk mint, shared by every send path. A voter with a leftover token row gets
// delete + re-mint: the raw token is unrecoverable by design, so any resend must
// re-mint — which also revokes the previously emailed link (security feature,
// not workaround).
async function mintTokensFor(
  electionId: string,
  where: Prisma.VoterWhereInput,
): Promise<MintedToken[]> {
  const election = await prisma.election.findUnique({
    where: { id: electionId },
    select: { startsAt: true, endsAt: true },
  });
  if (!election) return [];

  const voters = await prisma.voter.findMany({
    where,
    select: { id: true, email: true, firstName: true },
  });
  if (voters.length === 0) return [];

  const expiresAt = tokenExpiry(election.startsAt, election.endsAt);

  const minted: MintedToken[] = voters.map((v) => ({
    voterId: v.id,
    email: v.email,
    firstName: v.firstName,
    rawToken: randomBytes(32).toString("base64url"),
  }));

  await prisma.$transaction([
    prisma.voterToken.deleteMany({
      where: { voterId: { in: minted.map((m) => m.voterId) } },
    }),
    prisma.voterToken.createMany({
      data: minted.map((m) => ({
        hash: hashToken(m.rawToken),
        voterId: m.voterId,
        electionId,
        expiresAt,
      })),
    }),
  ]);

  return minted;
}

// Publication path: PENDING voters only. INVITED / VOTED are never touched —
// that is what makes publishElection idempotent (retry + scheduled sweep).
export async function mintTokensForPendingVoters(
  electionId: string,
): Promise<MintedToken[]> {
  return mintTokensFor(electionId, { electionId, status: "PENDING" });
}

// Reminder path: an explicit voter set the caller has already filtered.
// electionId stays in the WHERE so a foreign voter id can never be minted into
// this election's token set.
export async function mintTokensForVoters(
  electionId: string,
  voterIds: string[],
): Promise<MintedToken[]> {
  if (voterIds.length === 0) return [];
  return mintTokensFor(electionId, { electionId, id: { in: voterIds } });
}
