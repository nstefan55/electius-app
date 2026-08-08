import "server-only";

import { createHash, randomBytes } from "crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { ElectionStatus } from "@/lib/elections-view";

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

// Pravilo isteka: tokeni umiru zajedno s izborima. Kad je endsAt rezervirani
// datum čarobnjaka (nezakazano zatvaranje, endsAt <= startsAt), strop je 30
// dana od POČETKA — ne od `now`.
//
// Sidro je bilo `now` i to je bio kvar (G2): strop se pomicao sa svakim
// pozivom, pa `windowOver` nije bio "još nije isteklo" nego "ne može isteći".
// Takvi izbori nisu se mogli zatvoriti nikad, a token skovan 29. dana živio je
// do 59. — suprotno ugovoru ove funkcije. Zato `now` više nije ni parametar:
// istek ovisi isključivo o datumima izbora, pa se kvar ne može vratiti.
export function tokenExpiry(startsAt: Date, endsAt: Date): Date {
  if (endsAt.getTime() <= startsAt.getTime()) {
    return new Date(startsAt.getTime() + THIRTY_DAYS_MS);
  }
  return endsAt;
}

// Rok glasanja je istekao — token skovan SADA rodio bi se istekao, pa nitko
// nije dostupan. Jedno pravilo za svih šest staza slanja + podsjetnike; nikad
// prepisano kao `endsAt < now` (to tiho gubi granu čarobnjakovog rezerviranog
// datuma koju tokenExpiry već pokriva).
export function windowOver(
  election: { startsAt: Date; endsAt: Date },
  now: Date = new Date(),
): boolean {
  return tokenExpiry(election.startsAt, election.endsAt) <= now;
}

// Drugo pitanje, namjerno druga funkcija: ima li ovaj izbor STVARAN rok koji je
// već prošao? Rezervirani datum (endsAt <= startsAt) nije rok — čarobnjak ga
// nije ni postavio — pa nema što proći.
//
// Pita ga samo startElection, i mora ga pitati odvojeno: ondje straža čita
// startsAt PRIJE nego ga isti upit prepiše na sada, pa bi windowOver nad
// nacrtom starijim od 30 dana vratio true i zauvijek zabranio pokretanje —
// bez rute za uređivanje kojom bi se datum popravio.
export function deadlinePassed(
  election: { startsAt: Date; endsAt: Date },
  now: Date = new Date(),
): boolean {
  return (
    election.endsAt.getTime() > election.startsAt.getTime() &&
    election.endsAt.getTime() <= now.getTime()
  );
}

// "Izbori su gotovi" za administratorsku stranu: nakon toga se popis birača i
// naslov više ne diraju (zahtjev 3 — admin ne mijenja izbore koji su završili).
// windowOver pokriva prozor između endsAt i sljedećeg prolaza čistača, i
// slučaj da pinger uopće ne radi.
export function mutationsFrozen(
  election: { status: ElectionStatus; startsAt: Date; endsAt: Date },
  now: Date = new Date(),
): boolean {
  return (
    election.status === "CLOSED" ||
    election.status === "ARCHIVED" ||
    windowOver(election, now)
  );
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
