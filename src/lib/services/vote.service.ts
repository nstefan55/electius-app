import "server-only";

import { createHash, randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashToken, windowOver } from "./token.service";

// Vote casting — stage 2 of the Security & Integrity Model (voter-flow-spec,
// contract in election-publication-spec). The load-bearing invariant: a Vote
// row is NEVER written with any reference to a Voter. The token flip, the
// voter's VOTED status and the anonymous vote are one atomic transaction, but
// the rows themselves stay unlinked.

export type ElectionStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "ACTIVE"
  | "CLOSED"
  | "ARCHIVED";

export interface BallotElection {
  id: string;
  title: string;
  description: string | null;
  votingType: "SINGLE_CHOICE" | "MULTI_CHOICE";
  status: ElectionStatus;
  startsAt: Date;
  endsAt: Date;
  resultsVisible: boolean;
  organizationName: string;
}

export interface BallotOption {
  id: string;
  text: string;
  description: string | null;
}

// One state per designed screen (prototype "Voter flow — every state").
export type BallotState =
  | { state: "invalid" }
  | { state: "qrEntry"; election: BallotElection }
  | { state: "notStarted"; election: BallotElection; hasToken: boolean }
  | { state: "closed"; election: BallotElection; voted: boolean | null } // null = no token (QR visitor)
  | { state: "used"; election: BallotElection }
  | { state: "expired"; election: BallotElection }
  | { state: "ballot"; election: BallotElection; options: BallotOption[] };

const ELECTION_SELECT = {
  id: true,
  title: true,
  description: true,
  votingType: true,
  status: true,
  startsAt: true,
  endsAt: true,
  resultsVisible: true,
  organization: { select: { name: true } },
} as const;

type ElectionRow = Omit<BallotElection, "organizationName"> & {
  organization: { name: string };
};

function toBallotElection(row: ElectionRow): BallotElection {
  const { organization, ...rest } = row;
  return { ...rest, organizationName: organization.name };
}

// Resolve the /vote/[token] URL segment to a screen. The segment is either a
// voter token (hash lookup) or an election id (QR poster / "request new link"
// entry) — the two can't collide: tokens hash to 64-hex which is never a cuid.
// Check order matters and follows the design: CLOSED before used (a voter who
// voted in a now-closed election gets the closed-voted framing, not "already
// voted"), used before expired (a spent token reads "already voted" even after
// it also expired).
export async function getBallotState(segment: string): Promise<BallotState> {
  // VoterToken has no election relation (electionId is a denormalized scalar)
  // — the election rides along through the voter relation instead.
  const token = await prisma.voterToken.findUnique({
    where: { hash: hashToken(segment) },
    select: {
      id: true,
      used: true,
      expiresAt: true,
      voter: { select: { election: { select: ELECTION_SELECT } } },
    },
  });

  if (!token) {
    // No token match → maybe an election-level QR entry.
    const election = await prisma.election.findUnique({
      where: { id: segment },
      select: ELECTION_SELECT,
    });
    if (!election) return { state: "invalid" };
    const e = toBallotElection(election);
    // Rok istekao → zatvoreno, a ne qrEntry: obrazac bi mogao proizvesti samo
    // mrtvu poveznicu.
    if (votingOver(e)) return { state: "closed", election: e, voted: null };
    if (e.status === "SCHEDULED")
      return { state: "notStarted", election: e, hasToken: false };
    if (e.status === "ACTIVE") return { state: "qrEntry", election: e };
    // DRAFT deliberately reads as invalid — an unstarted draft's QR must not
    // leak the election's existence or its placeholder dates.
    return { state: "invalid" };
  }

  const e = toBallotElection(token.voter.election);
  if (votingOver(e)) return { state: "closed", election: e, voted: token.used };
  if (e.status !== "ACTIVE")
    return { state: "notStarted", election: e, hasToken: true };
  if (token.used) return { state: "used", election: e };
  if (token.expiresAt.getTime() <= Date.now())
    return { state: "expired", election: e };

  const options = await prisma.voteOption.findMany({
    where: { electionId: e.id },
    orderBy: { orderIndex: "asc" },
    select: { id: true, text: true, description: true },
  });
  return { state: "ballot", election: e, options };
}

// Glasanje je gotovo: status ga zatvara, ILI je rok istekao prije nego što ga
// je čistač stigao zatvoriti. Druga grana je sigurnosna mreža za minute između
// endsAt i sljedećeg prolaza — i za slučaj da pinger uopće ne radi. Bez nje
// birač dobiva "istekla poveznica" s pozivom da zatraži novu, koja je jednako
// mrtva: zatvorena petlja bez izlaza.
function votingOver(e: BallotElection, now: Date = new Date()): boolean {
  return (
    e.status === "CLOSED" || e.status === "ARCHIVED" || windowOver(e, now)
  );
}

// --- vote casting -----------------------------------------------------------

export type VoteErrorCode =
  | "invalid" // token unknown / expired / election not ACTIVE → 410
  | "used" // token spent (race) → 409
  | "selection"; // optionIds don't satisfy the election's rules → 400

export class VoteError extends Error {
  constructor(public code: VoteErrorCode) {
    super(`vote: ${code}`);
  }
}

export function computeVoteHash(
  electionId: string,
  optionIds: string[],
  timestampIso: string,
): string {
  // Sorted → multi-choice hashes are selection-order-independent.
  const sorted = [...optionIds].sort();
  return createHash("sha256")
    .update(electionId + sorted.join(",") + timestampIso)
    .digest("hex");
}

export async function castVote(
  rawToken: string,
  optionIds: string[],
): Promise<{ voteHash: string }> {
  const token = await prisma.voterToken.findUnique({
    where: { hash: hashToken(rawToken) },
    select: {
      id: true,
      used: true,
      expiresAt: true,
      voterId: true,
      electionId: true,
      voter: {
        select: {
          election: {
            select: {
              status: true,
              votingType: true,
              options: { select: { id: true } },
            },
          },
        },
      },
    },
  });

  if (!token) throw new VoteError("invalid");
  const election = token.voter.election;
  if (token.used) throw new VoteError("used");
  if (token.expiresAt.getTime() <= Date.now()) throw new VoteError("invalid");
  if (election.status !== "ACTIVE") throw new VoteError("invalid");

  // Selection rules: options must belong to this election, deduped; SINGLE ⇒
  // exactly 1; MULTI ⇒ ≥1, no upper cap (decision (a) — no maxChoices field).
  const picked = [...new Set(optionIds)];
  const valid = new Set(election.options.map((o) => o.id));
  if (
    picked.length === 0 ||
    picked.length !== optionIds.length ||
    !picked.every((id) => valid.has(id)) ||
    (election.votingType === "SINGLE_CHOICE" && picked.length !== 1)
  ) {
    throw new VoteError("selection");
  }

  const voteHash = computeVoteHash(
    token.electionId,
    picked,
    new Date().toISOString(),
  );

  // Atomic: the WHERE-guarded flip decides everything after it, so this is an
  // interactive transaction. A concurrent submit finds used=false already gone
  // (count 0) and aborts — exactly one vote per token, no read-then-write race.
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.voterToken.updateMany({
      where: { id: token.id, used: false },
      data: { used: true },
    });
    if (count === 0) throw new VoteError("used");

    // Who voted — never what they chose. No relation to the vote below.
    await tx.voter.update({
      where: { id: token.voterId },
      data: { status: "VOTED" },
    });

    // The anonymous vote: no voterId (structurally impossible), random
    // batchOrder so insert order ≠ voting order.
    await tx.vote.create({
      data: {
        voteHash,
        batchOrder: randomInt(2147483647),
        election: { connect: { id: token.electionId } },
        options: { create: picked.map((optionId) => ({ optionId })) },
      },
    });
  });

  return { voteHash };
}
