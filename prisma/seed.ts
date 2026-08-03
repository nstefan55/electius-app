// Seed the development database with the Electius demo account + 20 sample elections.
// Run with: npx prisma db seed   (Prisma 7 no longer auto-seeds on migrate)
// Spec: context/features/commited/seed-spec.md
//
// Elections carry only aggregate voter/vote counts — no VoteOptions/per-candidate
// distribution. ponytail: add options when the results pages need them.
// Load the Next.js-style env file (no plain .env in this repo), same as prisma.config.ts.
import { config } from "dotenv";
config({ path: `.env.${process.env.NODE_ENV ?? "development"}` });

import { createHash, randomBytes, randomInt } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { PrismaNeon } from "@prisma/adapter-neon";

import {
  PrismaClient,
  VoterStatus,
  type ElectionStatus,
  type ElectionType,
  type VotingType,
} from "../src/generated/prisma/client";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEMO = {
  orgName: "Veleučilište Velika Gorica",
  adminName: "Nikola Štefančić",
  email: "demo@electius.com",
  password: "d3mo3lectiuSHR#!",
};

// 20 elections covering all five lifecycle states, both voting types, all three
// election types: [title, status, electionType, votingType]. The dean election
// leads as ACTIVE — the thesis demo centerpiece.
const ELECTIONS: [string, ElectionStatus, ElectionType, VotingType][] = [
  ["Izbor dekana Veleučilišta 2026. – 2031.", "ACTIVE", "STANDARD", "SINGLE_CHOICE"],
  ["Izbori za Studentski zbor 2026./2027.", "ACTIVE", "STANDARD", "SINGLE_CHOICE"],
  ["Referendum o produljenju radnog vremena knjižnice", "ACTIVE", "POLL", "SINGLE_CHOICE"],
  ["Anketa o kvaliteti studentske prehrane", "ACTIVE", "SURVEY", "MULTI_CHOICE"],
  ["Izbor predstavnika studenata — Održavanje zrakoplova", "SCHEDULED", "STANDARD", "SINGLE_CHOICE"],
  ["Glasovanje o kalendaru studentskih događanja", "SCHEDULED", "STANDARD", "MULTI_CHOICE"],
  ["Referendum o uvođenju e-indeksa", "SCHEDULED", "POLL", "SINGLE_CHOICE"],
  ["Izbor studentskog pravobranitelja", "DRAFT", "STANDARD", "SINGLE_CHOICE"],
  ["Anketa o online nastavi", "DRAFT", "SURVEY", "MULTI_CHOICE"],
  ["Izbor predstavnika brucoša", "DRAFT", "STANDARD", "SINGLE_CHOICE"],
  ["Izbor člana Upravnog vijeća iz reda studenata", "CLOSED", "STANDARD", "SINGLE_CHOICE"],
  ["Referendum o parkiranju na kampusu", "CLOSED", "POLL", "SINGLE_CHOICE"],
  ["Izbor predstavnika studenata — Krizni menadžment", "CLOSED", "STANDARD", "SINGLE_CHOICE"],
  ["Glasovanje o novom logotipu studentskog kluba", "CLOSED", "STANDARD", "MULTI_CHOICE"],
  ["Anketa o terminima ispitnih rokova", "CLOSED", "SURVEY", "MULTI_CHOICE"],
  ["Izbor predstavnika studenata — Motorna vozila", "CLOSED", "STANDARD", "SINGLE_CHOICE"],
  ["Izbori za Studentski zbor 2025./2026.", "ARCHIVED", "STANDARD", "SINGLE_CHOICE"],
  ["Referendum o obnovi studentskog doma", "ARCHIVED", "POLL", "SINGLE_CHOICE"],
  ["Izbor predstavnika studenata — Informacijski sustavi", "ARCHIVED", "STANDARD", "SINGLE_CHOICE"],
  ["Anketa o zadovoljstvu studijem 2025.", "ARCHIVED", "SURVEY", "MULTI_CHOICE"],
];

const DAY = 86_400_000;
const days = (n: number) => new Date(Date.now() + n * DAY);

// Windows are relative to "now" so the statuses stay believable on every re-seed:
// DRAFT/SCHEDULED in the future, ACTIVE spanning today, CLOSED/ARCHIVED in the past.
function windowFor(status: ElectionStatus): { startsAt: Date; endsAt: Date } {
  switch (status) {
    case "DRAFT": {
      const start = randomInt(7, 21);
      return { startsAt: days(start), endsAt: days(start + 7) };
    }
    case "SCHEDULED": {
      const start = randomInt(2, 14);
      return { startsAt: days(start), endsAt: days(start + randomInt(3, 8)) };
    }
    case "ACTIVE":
      return { startsAt: days(-randomInt(1, 4)), endsAt: days(randomInt(2, 6)) };
    case "CLOSED": {
      const end = -randomInt(3, 40);
      return { startsAt: days(end - randomInt(4, 8)), endsAt: days(end) };
    }
    case "ARCHIVED": {
      const end = -randomInt(45, 120);
      return { startsAt: days(end - 7), endsAt: days(end) };
    }
  }
}

// Random voter counts per spec; turnout scaled by lifecycle stage.
function countsFor(status: ElectionStatus): { voters: number; voted: number } {
  const voters = randomInt(25, 301);
  if (status === "DRAFT" || status === "SCHEDULED") return { voters, voted: 0 };
  const turnoutPct = status === "ACTIVE" ? randomInt(20, 71) : randomInt(50, 96);
  return { voters, voted: Math.round((voters * turnoutPct) / 100) };
}

// Non-voted voters are INVITED once an election is live/past, PENDING while it's
// still being prepared (DRAFT/SCHEDULED — invitations not sent yet).
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
      name: DEMO.orgName,
      type: "UNIVERSITY",
      contactEmail: DEMO.email,
    },
  });

  const admin = await prisma.user.create({
    data: {
      name: DEMO.adminName,
      email: DEMO.email,
      emailVerified: true, // requireEmailVerification would block login otherwise
      isPro: true, // Pro entitlement on, so seeded data can exercise Pro features
      organizationId: organization.id,
    },
  });

  // BetterAuth credential account — hashed with BetterAuth's own scrypt helper so
  // the default verify path (non-"$2" hashes in src/lib/auth) accepts it at login.
  await prisma.account.create({
    data: {
      accountId: admin.id,
      providerId: "credential",
      userId: admin.id,
      password: await hashPassword(DEMO.password),
    },
  });

  for (const [i, [title, status, electionType, votingType]] of ELECTIONS.entries()) {
    const { startsAt, endsAt } = windowFor(status);
    const { voters, voted } = countsFor(status);

    const election = await prisma.election.create({
      data: {
        title,
        status,
        electionType,
        votingType,
        startsAt,
        endsAt,
        organizationId: organization.id,
        createdById: admin.id,
      },
    });

    const fallback = unvotedStatus(status);
    await prisma.voter.createMany({
      data: Array.from({ length: voters }, (_, n) => ({
        email: `e${i + 1}-voter${n}@seed.example`,
        status: n < voted ? VoterStatus.VOTED : fallback,
        electionId: election.id,
      })),
    });

    if (voted > 0) {
      // Anonymous votes — no voterId by design. Random batchOrder breaks
      // insert-order correlation, exactly as the real vote.service will.
      await prisma.vote.createMany({
        data: Array.from({ length: voted }, () => ({
          voteHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
          batchOrder: randomInt(0, 2 ** 31 - 1),
          electionId: election.id,
        })),
      });
    }

    console.log(`  ✓ [${status}] ${title} — ${voted}/${voters} voted`);
  }

  console.log(
    `Seeded org "${organization.name}", 1 admin, ${ELECTIONS.length} elections.`,
  );
  console.log(`Sign-in: ${DEMO.email} / ${DEMO.password}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
