// Seed the development database from the dashboard mock data.
// Run with: npx prisma db seed   (Prisma 7 no longer auto-seeds on migrate)
//
// The mock (src/lib/mock-data.ts) only carries election-level aggregates — voter/vote
// COUNTS, no candidates. So this seed reproduces exactly that: one org, one admin, and
// each election with matching Voter rows + anonymous Vote rows so turnout is accurate.
// ponytail: no VoteOptions/results data — the mock has none; add when results pages land.
import "dotenv/config";
import { createHash, randomBytes, randomInt } from "node:crypto";

import bcrypt from "bcryptjs";
import { PrismaNeon } from "@prisma/adapter-neon";

import {
  ElectionType,
  PrismaClient,
  VoterStatus,
  VotingType,
  type ElectionStatus,
} from "../src/generated/prisma/client";
import { currentUser, elections as mockElections } from "../src/lib/mock-data";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Mock "type" strings → schema enums. Ranked choice isn't an MVP voting type, so it
// falls through to STANDARD/SINGLE_CHOICE.
function mapType(type: string): {
  electionType: ElectionType;
  votingType: VotingType;
} {
  switch (type) {
    case "Yes / no referendum":
      return {
        electionType: ElectionType.POLL,
        votingType: VotingType.SINGLE_CHOICE,
      };
    case "Multiple choice":
      return {
        electionType: ElectionType.STANDARD,
        votingType: VotingType.MULTI_CHOICE,
      };
    default:
      return {
        electionType: ElectionType.STANDARD,
        votingType: VotingType.SINGLE_CHOICE,
      };
  }
}

// The mock shows abbreviated dates ("Jun 18"); map each election to a concrete 2026
// window. DRAFT (id 6) has no real dates ("—") — give it a near-future placeholder.
const WINDOWS: Record<string, { startsAt: string; endsAt: string }> = {
  "1": { startsAt: "2026-06-18T09:00:00Z", endsAt: "2026-06-24T18:00:00Z" },
  "2": { startsAt: "2026-06-20T09:00:00Z", endsAt: "2026-06-23T18:00:00Z" },
  "3": { startsAt: "2026-06-19T09:00:00Z", endsAt: "2026-06-25T18:00:00Z" },
  "4": { startsAt: "2026-06-28T09:00:00Z", endsAt: "2026-07-02T18:00:00Z" },
  "5": { startsAt: "2026-06-01T09:00:00Z", endsAt: "2026-06-08T18:00:00Z" },
  "6": { startsAt: "2026-07-10T09:00:00Z", endsAt: "2026-07-17T18:00:00Z" },
  "7": { startsAt: "2026-05-05T09:00:00Z", endsAt: "2026-05-12T18:00:00Z" },
  "8": { startsAt: "2026-04-01T09:00:00Z", endsAt: "2026-04-08T18:00:00Z" },
};

// Non-voted voters are INVITED once an election is live/past, PENDING while it's still
// being prepared (DRAFT/SCHEDULED — invitations not sent yet).
function unvotedStatus(status: ElectionStatus): VoterStatus {
  return status === "DRAFT" || status === "SCHEDULED"
    ? VoterStatus.PENDING
    : VoterStatus.INVITED;
}

async function main() {
  // Idempotent: wipe in FK-safe order (Vote/Archive have no cascade from Election).
  await prisma.voteToOption.deleteMany();
  await prisma.vote.deleteMany();
  await prisma.archive.deleteMany();
  await prisma.voterToken.deleteMany();
  await prisma.voter.deleteMany();
  await prisma.voteOption.deleteMany();
  await prisma.election.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const organization = await prisma.organization.create({
    data: {
      name: currentUser.organization,
      contactEmail: currentUser.email,
    },
  });

  const admin = await prisma.user.create({
    data: {
      name: currentUser.name,
      email: currentUser.email,
      emailVerified: true,
      isPro: currentUser.isPro,
      organizationId: organization.id,
    },
  });

  // BetterAuth credential account — email/password sign-in. Password hashed with
  // bcryptjs (12 rounds) per seed-spec. Cascades away when the admin is deleted.
  // Note: BetterAuth defaults to scrypt; point its credential provider at bcrypt
  // (custom password.verify) for this hash to validate at login.
  await prisma.account.create({
    data: {
      accountId: admin.id,
      providerId: "credential",
      userId: admin.id,
      password: await bcrypt.hash("testadmin2002", 12),
    },
  });

  for (const e of mockElections) {
    const { electionType, votingType } = mapType(e.type);
    const win = WINDOWS[e.id];

    const election = await prisma.election.create({
      data: {
        title: e.name,
        electionType,
        votingType,
        status: e.status,
        startsAt: new Date(win.startsAt),
        endsAt: new Date(win.endsAt),
        organizationId: organization.id,
        createdById: admin.id,
      },
    });

    if (e.voters > 0) {
      const fallback = unvotedStatus(e.status);
      await prisma.voter.createMany({
        data: Array.from({ length: e.voters }, (_, i) => ({
          email: `e${e.id}-voter${i}@seed.example`,
          status: i < e.voted ? VoterStatus.VOTED : fallback,
          electionId: election.id,
        })),
      });
    }

    if (e.voted > 0) {
      // Anonymous votes — no voterId by design. Random batchOrder breaks insert-order
      // correlation, exactly as the real vote.service will.
      await prisma.vote.createMany({
        data: Array.from({ length: e.voted }, () => ({
          voteHash: createHash("sha256")
            .update(randomBytes(32))
            .digest("hex"),
          batchOrder: randomInt(0, 2 ** 31 - 1),
          electionId: election.id,
        })),
      });
    }

    console.log(`  ✓ ${e.name} — ${e.voted}/${e.voters} voted`);
  }

  console.log(
    `Seeded org "${organization.name}", 1 admin, ${mockElections.length} elections.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
