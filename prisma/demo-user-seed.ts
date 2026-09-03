// Demo račun Electius — jedno sjeme za prodajnu demonstraciju i za testiranje.
// Spec: context/features/demo-user-electius-spec.md
//
//   npm run db:seed          Free varijanta (zadano)
//   npm run db:seed:pro      Pro varijanta
//
// Traži --conditions react-server jer merkle.service nosi "server-only".
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
  type Prisma,
  type VotingType,
} from "../src/generated/prisma/client";
import {
  buildMerkleTree,
  MERKLE_ALGORITHM,
  MERKLE_LEAF_ORDERING,
} from "../src/lib/services/merkle.service";
import type { ElectionSnapshot } from "../src/lib/services/archive.service";
import { buildArchiveTombstone } from "../src/lib/archive-prune";
import { archiveExpiresAt, type Entitlement } from "../src/lib/entitlements";
import { turnoutPct } from "../src/lib/elections-view";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PRO = process.argv.includes("--pro");
const ENTITLEMENT: Entitlement = PRO ? { kind: "pro" } : { kind: "free" };

// Lozinka iz .env.${NODE_ENV} (učitan gore); ugrađena bi završila u gitu.
const DEMO_PASSWORD = process.env.TEST_DEMO_PASSWORD;
if (!DEMO_PASSWORD) {
  throw new Error(
    "TEST_DEMO_PASSWORD nije postavljen — sjeme odbija raditi s ugrađenom lozinkom.",
  );
}

const DEMO = {
  orgName: "Sveučilište u Zagrebu",
  adminName: "Demo User",
  email: "demo@electius.com",
  password: DEMO_PASSWORD,
  // Iz public/, ne iz R2 — keyFromUrl vrati null, pa ga zamjena i brisanje preskaču.
  logoUrl: "/demo/org-logo.png",
};

const DAY = 86_400_000;
const days = (n: number) => new Date(Date.now() + n * DAY);

// ───────── katalog izbora (spec §6) ─────────
// `created` je eksplicitan i pada od vrha tablice — to je poredak na /elections.

type Quorum = number | "met" | "unmet";

interface Plan {
  title: string;
  status: ElectionStatus;
  electionType: ElectionType;
  votingType: VotingType;
  created: number; // dani od sada; negativno = prošlost
  starts: number;
  ends: number;
  voters: number;
  turnout: number; // %
  candidates: number;
  quorum?: Quorum;
  resultsVisible?: boolean;
  tie?: boolean;
  archive?: "sealed" | "expiring" | "pruned";
  sealed?: number; // dan pečaćenja (Archive.createdAt)
  proLive?: boolean; // resultsMode LIVE samo u Pro varijanti
  tokens?: boolean; // ovdje se kuju demo magic linkovi
}

const PLAN: Plan[] = [
  {
    title: "Izbor Dekana Fakulteta strojarstva i brodogradnje",
    status: "DRAFT", electionType: "STANDARD", votingType: "SINGLE_CHOICE",
    created: 0, starts: 14, ends: 21, voters: 0, turnout: 0, candidates: 4,
  },
  {
    // 42 od 50 — najava granice (nearCap) u čarobnjaku i na popisu birača.
    title: "Dopunski studentski izbori",
    status: "SCHEDULED", electionType: "STANDARD", votingType: "SINGLE_CHOICE",
    created: -1, starts: 7, ends: 12, voters: 42, turnout: 0, candidates: 3,
  },
  {
    title: "Izbori za koordinatora i povjerenstva za kvalitetu",
    status: "SCHEDULED", electionType: "STANDARD", votingType: "MULTI_CHOICE",
    created: -2, starts: 9, ends: 16, voters: 180, turnout: 0, candidates: 5,
  },
  {
    title: "Anketa o kvaliteti nastave i e-učenja",
    status: "SCHEDULED", electionType: "SURVEY", votingType: "MULTI_CHOICE",
    created: -3, starts: 11, ends: 18, voters: 320, turnout: 0, candidates: 4,
  },
  {
    title: "Izbori za Studentski zbor Sveučilišta u Zagrebu",
    status: "ACTIVE", electionType: "STANDARD", votingType: "SINGLE_CHOICE",
    created: -8, starts: -5, ends: 6, voters: 420, turnout: 46, candidates: 5,
    quorum: 30, resultsVisible: true,
  },
  {
    title: "Izbori za studentske zbore sastavnica",
    status: "ACTIVE", electionType: "STANDARD", votingType: "MULTI_CHOICE",
    created: -10, starts: -4, ends: 8, voters: 260, turnout: 38, candidates: 4,
    tokens: true,
  },
  {
    title: "Referendum o studentskom standardu i cijenama u menzama",
    status: "ACTIVE", electionType: "POLL", votingType: "SINGLE_CHOICE",
    created: -12, starts: -6, ends: 4, voters: 380, turnout: 61, candidates: 3,
    proLive: true,
  },
  {
    title: "Izbori za predstavnike u UNIC-u",
    status: "ACTIVE", electionType: "STANDARD", votingType: "SINGLE_CHOICE",
    created: -14, starts: -3, ends: 10, voters: 145, turnout: 22, candidates: 3,
  },
  {
    title: "Izbor rektora",
    status: "CLOSED", electionType: "STANDARD", votingType: "SINGLE_CHOICE",
    created: -20, starts: -18, ends: -11, voters: 235, turnout: 85, candidates: 4,
    quorum: "met",
  },
  {
    title: "Izbori za članove Senata",
    status: "CLOSED", electionType: "STANDARD", votingType: "MULTI_CHOICE",
    created: -26, starts: -24, ends: -17, voters: 265, turnout: 78, candidates: 5,
    quorum: "unmet",
  },
  {
    // Kosa crta u naslovu — provjera slugify u imenima CSV i PDF datoteka.
    title: "Izbori za Fakultetska / Akademijska vijeća",
    status: "CLOSED", electionType: "STANDARD", votingType: "SINGLE_CHOICE",
    created: -32, starts: -30, ends: -23, voters: 310, turnout: 67, candidates: 4,
  },
  {
    title: "Izbori za Radnička vijeća",
    status: "CLOSED", electionType: "STANDARD", votingType: "SINGLE_CHOICE",
    created: -38, starts: -36, ends: -29, voters: 200, turnout: 60, candidates: 3,
    tie: true,
  },
  {
    title: "Izbori za sindikalne povjerenike",
    status: "CLOSED", electionType: "STANDARD", votingType: "SINGLE_CHOICE",
    created: -44, starts: -42, ends: -35, voters: 160, turnout: 71, candidates: 3,
  },
  {
    title: "Izbori za povjerenike radnika za zaštitu na radu",
    status: "CLOSED", electionType: "STANDARD", votingType: "MULTI_CHOICE",
    created: -50, starts: -48, ends: -41, voters: 120, turnout: 55, candidates: 4,
  },
  {
    title: "Izbori za Etička povjerenstva / odbore",
    status: "ARCHIVED", electionType: "STANDARD", votingType: "SINGLE_CHOICE",
    created: -70, starts: -68, ends: -61, voters: 190, turnout: 74, candidates: 4,
    archive: "sealed", sealed: -30,
  },
  {
    // Zapečaćeno prije skoro godinu dana → Free rok istječe za ~15 dana.
    title: "Izbori za stegovna povjerenstva",
    status: "ARCHIVED", electionType: "STANDARD", votingType: "SINGLE_CHOICE",
    created: -360, starts: -358, ends: -351, voters: 175, turnout: 69, candidates: 3,
    archive: "expiring", sealed: -350,
  },
  {
    // Rok prošao → teret dokaza obrezan, proofData je nadgrobni zapis.
    title: "Izbori voditelja područnih studija, odsjeka i zavoda",
    status: "ARCHIVED", electionType: "STANDARD", votingType: "MULTI_CHOICE",
    created: -410, starts: -408, ends: -401, voters: 240, turnout: 63, candidates: 5,
    archive: "pruned", sealed: -400,
  },
  {
    // Bez arhive: izbori arhivirani prije nego što je pečat postojao.
    title: "Anketa o zadovoljstvu studenata studijem 2025./2026.",
    status: "ARCHIVED", electionType: "SURVEY", votingType: "MULTI_CHOICE",
    created: -430, starts: -428, ends: -421, voters: 350, turnout: 58, candidates: 4,
  },
];

// ───────── imena ─────────

const FIRST = [
  "Ana", "Marko", "Ivana", "Petar", "Lucija", "Josip", "Marija", "Luka",
  "Nikolina", "Ivan", "Katarina", "Tomislav", "Martina", "Filip", "Petra",
  "Domagoj", "Sara", "Antonio", "Đurđica", "Šime",
];

const LAST = [
  "Kovačević", "Horvat", "Novak", "Jurić", "Babić", "Marić", "Knežević",
  "Vuković", "Perić", "Matić", "Šarić", "Blažević", "Radić", "Grgić", "Pavić",
  "Tomić", "Barišić", "Lovrić", "Ćosić", "Đurđević", "Šimić", "Vidović",
  "Rukavina", "Klarić",
];

const CANDIDATES = [
  { text: "Ana Kovačević", description: "Predsjednica" },
  { text: "Marko Horvat", description: "Tajnik" },
  { text: "Ivana Novak", description: "Blagajnica" },
  { text: "Petar Jurić", description: "Član predsjedništva" },
  { text: "Lucija Babić", description: "Zamjenica predsjednice" },
  { text: "Josip Marić", description: "Predstavnik nastavnika" },
  { text: "Katarina Vuković", description: "Predstavnica studenata" },
  { text: "Tomislav Perić", description: "Predstavnik zaposlenika" },
  { text: "Martina Šarić", description: "Voditeljica odbora" },
  { text: "Filip Blažević", description: "Član vijeća" },
  { text: "Petra Radić", description: "Zamjenica voditeljice" },
  { text: "Domagoj Grgić", description: "Član povjerenstva" },
];

// Dijakritika ostaje u imenu, ne u e-adresi — točno ono što foldForSearch i BOM
// u CSV izvozu moraju podnijeti. đ nije kompozicija, pa ide zasebno.
const asciiFold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

// 24 × 20 = 480 kombinacija, a najveći izbor ima 420 birača — bez sudara.
// Prezime se vrti brže od imena, pa i popis od 42 birača pokaže 24 prezimena.
function voterAt(n: number) {
  const lastName = LAST[n % LAST.length];
  const firstName = FIRST[Math.floor(n / LAST.length) % FIRST.length];
  return {
    firstName,
    lastName,
    email: `${asciiFold(firstName)}.${asciiFold(lastName)}@example.com`,
  };
}

// ───────── raspodjele ─────────

const WEIGHTS: Record<number, number[]> = {
  3: [0.51, 0.34, 0.15],
  4: [0.42, 0.28, 0.19, 0.11],
  5: [0.36, 0.25, 0.18, 0.13, 0.08],
};

// Ostatak ide vodećem — determinističko, isti ulaz daje isti zaslon.
function split(total: number, weights: number[]): number[] {
  const counts = weights.map((w) => Math.floor(total * w));
  counts[0] += total - counts.reduce((s, n) => s + n, 0);
  return counts;
}

// Izjednačenje: prva dva kandidata dobiju isti broj, ostatak je manji od njih,
// pa winnerOutcome vrati granu `tie` umjesto izmišljenog pobjednika.
function ballotSplit(total: number, count: number, tie?: boolean): number[] {
  if (!tie) return split(total, WEIGHTS[count]);
  const top = Math.floor(total * 0.4);
  const rest = split(total - 2 * top, WEIGHTS[count - 2] ?? [1]);
  return [top, top, ...rest];
}

// Krivulja glasanja: jak početak, pad, skok pred kraj. Vremena se upisuju odmah
// pri stvaranju — nema naknadnog updateMany po danu.
const CURVE = [0.23, 0.14, 0.1, 0.08, 0.11, 0.16, 0.18];

function voteTimes(total: number, startsAt: Date, endsAt: Date): Date[] {
  const until = Math.min(endsAt.getTime(), Date.now());
  const span = Math.max(until - startsAt.getTime(), DAY);
  const slice = span / CURVE.length;
  return split(total, CURVE).flatMap((n, bucket) =>
    Array.from(
      { length: n },
      () => new Date(startsAt.getTime() + (bucket + 0.5) * slice),
    ),
  );
}

function quorumFor(q: Quorum | undefined, turnout: number): number | null {
  if (q === undefined) return null;
  if (typeof q === "number") return q;
  return q === "met"
    ? Math.max(5, turnout - 15)
    : Math.min(95, turnout + 15);
}

// ───────── brisanje (spec §9) ─────────
// Samo stablo demo organizacije. Vote i Archive nemaju kaskadu s Election;
// Election.createdById je RESTRICT, pa izbori idu prije korisnika.
async function wipeDemo() {
  const user = await prisma.user.findUnique({
    where: { email: DEMO.email },
    select: { id: true, organizationId: true },
  });
  const org = await prisma.organization.findUnique({
    where: { contactEmail: DEMO.email },
    select: { id: true },
  });
  if (!user && !org) return { elections: 0 };

  const orgIds = [user?.organizationId, org?.id].filter(
    (id): id is string => Boolean(id),
  );
  const doomed = await prisma.election.findMany({
    where: {
      OR: [
        ...(orgIds.length ? [{ organizationId: { in: orgIds } }] : []),
        ...(user ? [{ createdById: user.id }] : []),
      ],
    },
    select: { id: true },
  });
  const ids = doomed.map((e) => e.id);

  await prisma.$transaction([
    prisma.vote.deleteMany({ where: { electionId: { in: ids } } }),
    prisma.archive.deleteMany({ where: { electionId: { in: ids } } }),
    prisma.election.deleteMany({ where: { id: { in: ids } } }),
    ...(user ? [prisma.user.deleteMany({ where: { id: user.id } })] : []),
    ...(orgIds.length
      ? [prisma.organization.deleteMany({ where: { id: { in: orgIds } } })]
      : []),
    prisma.verificationToken.deleteMany({ where: { identifier: DEMO.email } }),
  ]);

  return { elections: ids.length };
}

// ───────── glavni tok ─────────

async function main() {
  const password = DEMO.password;

  const host = new URL(process.env.DATABASE_URL ?? "http://unset").hostname;
  console.log(`DB:   ${host}`);
  console.log(`Plan: ${PRO ? "PRO" : "FREE"}\n`);

  const wiped = await wipeDemo();
  if (wiped.elections) console.log(`Obrisano izbora: ${wiped.elections}\n`);

  const organization = await prisma.organization.create({
    data: {
      name: DEMO.orgName,
      type: "UNIVERSITY",
      contactEmail: DEMO.email,
      logoUrl: DEMO.logoUrl,
    },
  });

  const admin = await prisma.user.create({
    data: {
      name: DEMO.adminName,
      email: DEMO.email,
      emailVerified: true, // inače requireEmailVerification blokira prijavu
      isPro: PRO,
      organizationId: organization.id,
    },
  });

  // scrypt iz BetterAutha — isti put provjere kao pri stvarnoj registraciji.
  await prisma.account.create({
    data: {
      accountId: admin.id,
      providerId: "credential",
      // Obavezno od better-autha 1.7.2: prijava traži account s točno ovim
      // issuerom (createLocalAccountIssuer("credential")). Bez njega se
      // zasijani administrator ne može prijaviti — 401 "User not found".
      issuer: "local:credential",
      userId: admin.id,
      password: await hashPassword(password),
    },
  });

  let totalVoters = 0;
  let totalVotes = 0;
  let archives = 0;
  let tokenElectionId: string | null = null;

  for (const [index, p] of PLAN.entries()) {
    const startsAt = days(p.starts);
    const endsAt = days(p.ends);
    const voted = Math.round((p.voters * p.turnout) / 100);

    const election = await prisma.election.create({
      data: {
        title: p.title,
        status: p.status,
        electionType: p.electionType,
        votingType: p.votingType,
        startsAt,
        endsAt,
        createdAt: days(p.created),
        quorumThreshold: quorumFor(p.quorum, p.turnout),
        resultsVisible: p.resultsVisible ?? false,
        resultsMode: PRO && p.proLive ? "LIVE" : "AFTER_CLOSE",
        voterReminder24h: PRO && p.status === "ACTIVE",
        adminTurnoutReminder: PRO && p.status === "ACTIVE",
        organizationId: organization.id,
        createdById: admin.id,
      },
    });

    // Kandidati: pomični prozor kroz bazen, da svaki izbor ne pokazuje ista imena.
    const offset = (index * 2) % CANDIDATES.length;
    const options = await prisma.voteOption.createManyAndReturn({
      data: Array.from({ length: p.candidates }, (_, i) => ({
        ...CANDIDATES[(offset + i) % CANDIDATES.length],
        orderIndex: i,
        electionId: election.id,
      })),
      select: { id: true, text: true, orderIndex: true },
    });

    if (p.voters > 0) {
      const unvoted =
        p.status === "DRAFT" || p.status === "SCHEDULED"
          ? VoterStatus.PENDING
          : VoterStatus.INVITED;

      await prisma.voter.createMany({
        data: Array.from({ length: p.voters }, (_, n) => ({
          ...voterAt(n),
          status: n < voted ? VoterStatus.VOTED : unvoted,
          electionId: election.id,
        })),
      });
    }

    if (voted > 0) {
      // Anonimni listići — bez voterId (invarijanta #1), batchOrder slučajan.
      // voteHash je nasumičnih 64 hex znaka; stablu je list neproziran.
      const times = voteTimes(voted, startsAt, endsAt);
      const votes = await prisma.vote.createManyAndReturn({
        data: times.map((createdAt) => ({
          voteHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
          batchOrder: randomInt(0, 2 ** 31 - 1),
          createdAt,
          electionId: election.id,
        })),
        select: { id: true, voteHash: true },
      });

      const buckets = ballotSplit(voted, p.candidates, p.tie);
      const links: { voteId: string; optionId: string }[] = [];
      let cursor = 0;
      buckets.forEach((n, i) => {
        for (let k = 0; k < n; k++) {
          links.push({ voteId: votes[cursor++].id, optionId: options[i].id });
        }
      });

      // Višestruki izbor: svaki treći listić uzme i zadnju opciju, pa zbroj
      // udjela prelazi 100 % — to ta vrsta glasanja i znači.
      if (p.votingType === "MULTI_CHOICE") {
        votes.forEach((v, i) => {
          if (i % 3 === 0) {
            links.push({ voteId: v.id, optionId: options[p.candidates - 1].id });
          }
        });
      }

      await prisma.voteToOption.createMany({ data: links, skipDuplicates: true });

      if (p.archive) {
        await sealDemoArchive(p, election.id, votes.map((v) => v.voteHash), options);
        archives++;
      }
      totalVotes += voted;
    }

    if (p.tokens) tokenElectionId = election.id;
    totalVoters += p.voters;
    console.log(`  ✓ [${p.status}] ${p.title} — ${voted}/${p.voters}`);
  }

  const links = tokenElectionId ? await mintDemoLinks(tokenElectionId) : [];

  report({ totalVoters, totalVotes, archives, links });
}

// Pravi Merkle korijen preko merkle.service — korijen je jedini broj u aplikaciji
// koji se ne smije izmisliti (spec D5).
async function sealDemoArchive(
  p: Plan,
  electionId: string,
  hashes: string[],
  options: ElectionSnapshot["options"],
) {
  const { root, leaves, tree } = buildMerkleTree(hashes);
  const sealedAt = days(p.sealed ?? -1);
  const voted = Math.round((p.voters * p.turnout) / 100);

  const snapshot: ElectionSnapshot = {
    title: p.title,
    description: null,
    electionType: p.electionType,
    votingType: p.votingType,
    startsAt: days(p.starts).toISOString(),
    endsAt: days(p.ends).toISOString(),
    settings: {
      resultsVisible: p.resultsVisible ?? false,
      resultsMode: PRO && p.proLive ? "LIVE" : "AFTER_CLOSE",
      allowAbstain: false,
      quorumThreshold: quorumFor(p.quorum, p.turnout),
      voterReminder24h: false,
    },
    options,
    counts: { voters: p.voters, votesCast: voted, turnoutPct: turnoutPct(voted, p.voters) },
    sealedAt: sealedAt.toISOString(),
  };

  const pruned = p.archive === "pruned";
  const proofData = pruned
    ? buildArchiveTombstone({
        root,
        algorithm: MERKLE_ALGORITHM,
        leafOrdering: MERKLE_LEAF_ORDERING,
        prunedAt: days((p.sealed ?? -1) + 365),
      })
    : { algorithm: MERKLE_ALGORITHM, leafOrdering: MERKLE_LEAF_ORDERING, leaves, tree, root };

  await prisma.archive.create({
    data: {
      electionId,
      merkleRoot: root,
      proofData: proofData as unknown as Prisma.InputJsonValue,
      electionData: snapshot as unknown as Prisma.InputJsonValue,
      // Isti kalendarski račun koji pečat i metla koriste u aplikaciji.
      expiresAt: archiveExpiresAt(ENTITLEMENT, sealedAt),
      // Obrezano prije eventualne nadogradnje — ostaje obrezano i u Pro varijanti.
      prunedAt: pruned ? days((p.sealed ?? -1) + 365) : null,
      createdAt: sealedAt,
    },
  });
}

// Magic linkovi za 3 birača (spec D4). Dinamički import: token.service povlači
// @/lib/prisma, koji čita DATABASE_URL pri učitavanju modula — statički import
// bi se izvršio prije config() zbog hoistanja.
async function mintDemoLinks(electionId: string) {
  const { mintTokensForVoters } = await import(
    "../src/lib/services/token.service"
  );

  const voters = await prisma.voter.findMany({
    where: { electionId, status: "INVITED" },
    select: { id: true },
    take: 3,
  });
  const minted = await mintTokensForVoters(
    electionId,
    voters.map((v) => v.id),
  );

  const base = process.env.NEXT_PUBLIC_MARKETING_URL ?? "http://localhost:3000";
  return minted.map((m) => ({ email: m.email, url: `${base}/vote/${m.rawToken}` }));
}

function report(r: {
  totalVoters: number;
  totalVotes: number;
  archives: number;
  links: { email: string; url: string }[];
}) {
  const app = process.env.NEXT_PUBLIC_APP_URL ?? "http://dashboard.localhost:3000";

  console.log(`\n${DEMO.orgName} — ${DEMO.adminName} (${PRO ? "PRO" : "FREE"})`);
  console.log(
    `  ${PLAN.length} izbora · ${r.totalVoters} birača · ${r.totalVotes} listića · ${r.archives} arhive`,
  );
  console.log(`\nPrijava: ${app}/hr/login`);
  console.log(`  ${DEMO.email} / ${DEMO.password}`);
  console.log(
    `\nLogotip organizacije: ${DEMO.logoUrl} — izvještaj ga prikazuje samo uz Pro pravo.`,
  );

  if (process.env.BILLING_ENABLED !== "true") {
    console.log(
      "\n⚠  BILLING_ENABLED nije \"true\" — resolveEntitlement svima vraća Pro,",
    );
    console.log(
      "   pa se Free i Pro varijanta ni po čemu ne razlikuju u aplikaciji.",
    );
  }

  if (r.links.length) {
    console.log("\nGlasački linkovi (sirovi token postoji samo ovdje):");
    r.links.forEach((l) => console.log(`  ${l.email}\n    ${l.url}`));
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
