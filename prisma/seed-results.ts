// Dopuna sjemena za stranicu rezultata (election-results-id-phase-2).
// Pokretanje: npx tsx prisma/seed-results.ts
//
// Osnovno sjeme (prisma/seed.ts) stvara izbore samo s ukupnim brojem glasova —
// bez kandidata i bez veze listić→opcija — pa bi zbroj po kandidatu bio nula i
// kartica kvoruma se ne bi mogla prikazati. Ova skripta popunjava taj jaz:
//
//   1. dodaje kandidate izborima koji ih nemaju
//   2. raspoređuje POSTOJEĆE listiće po kandidatima (vote_to_options)
//   3. postavlja kvorum na dva izbora — jedan ispunjen, jedan neispunjen
//
// Idempotentno: izbori koji već imaju kandidate se preskaču. Samo development.
import { config } from "dotenv";
config({ path: `.env.${process.env.NODE_ENV ?? "development"}` });

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Ime + funkcija (VoteOption.description). Bez dijakritičkih iznimaka — namjerno
// sadrži č/ć/š da se provjeri prikaz i inicijali.
const CANDIDATE_POOL = [
  { text: "Ana Kovačević", description: "Predsjednica" },
  { text: "Marko Horvat", description: "Tajnik" },
  { text: "Ivana Novak", description: "Blagajnica" },
  { text: "Petar Jurić", description: "Član predsjedništva" },
  { text: "Lucija Babić", description: "Zamjenica predsjednice" },
];

// Determinističke težine — isti ulaz uvijek daje isti raspored, pa je zaslon
// usporediv između pokretanja.
const WEIGHTS: Record<number, number[]> = {
  3: [0.51, 0.34, 0.15],
  4: [0.42, 0.28, 0.19, 0.11],
  5: [0.36, 0.25, 0.18, 0.13, 0.08],
};

// Raspoređuje `total` listića po težinama; ostatak ide vodećem kandidatu.
function split(total: number, weights: number[]): number[] {
  const counts = weights.map((w) => Math.floor(total * w));
  counts[0] += total - counts.reduce((s, n) => s + n, 0);
  return counts;
}

async function main() {
  const elections = await prisma.election.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      status: true,
      votingType: true,
      _count: { select: { options: true, votes: true, voters: true } },
    },
  });

  let seeded = 0;

  for (const [index, e] of elections.entries()) {
    if (e._count.options > 0) continue; // već ima kandidate
    if (e._count.votes === 0) {
      // Nacrti i zakazani izbori nemaju listiće, ali trebaju kandidate da
      // pregled listića i čarobnjak imaju što prikazati.
      await prisma.voteOption.createMany({
        data: CANDIDATE_POOL.slice(0, 3).map((c, i) => ({
          ...c,
          orderIndex: i,
          electionId: e.id,
        })),
      });
      seeded++;
      continue;
    }

    const count = 3 + (index % 3); // 3–5 kandidata, deterministički
    const created = await prisma.voteOption.createManyAndReturn({
      data: CANDIDATE_POOL.slice(0, count).map((c, i) => ({
        ...c,
        orderIndex: i,
        electionId: e.id,
      })),
      select: { id: true },
    });

    const votes = await prisma.vote.findMany({
      where: { electionId: e.id },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    const buckets = split(votes.length, WEIGHTS[count]);
    const links: { voteId: string; optionId: string }[] = [];

    let cursor = 0;
    buckets.forEach((n, optionIdx) => {
      for (let i = 0; i < n; i++) {
        links.push({ voteId: votes[cursor].id, optionId: created[optionIdx].id });
        cursor++;
      }
    });

    // Višestruki izbor: svaki treći listić bira i drugu opciju, pa zbroj udjela
    // prelazi 100 % — točno ono što ta vrsta glasanja i znači.
    if (e.votingType === "MULTI_CHOICE") {
      votes.forEach((v, i) => {
        if (i % 3 === 0) {
          links.push({ voteId: v.id, optionId: created[count - 1].id });
        }
      });
    }

    await prisma.voteToOption.createMany({ data: links, skipDuplicates: true });
    seeded++;
    console.log(
      `  ${e.title} — ${count} kandidata, ${links.length} veza (${e.votingType})`,
    );
  }

  // Osnovno sjeme sve listiće upisuje u istom trenutku, pa bi graf "glasovi po
  // danu" imao jedan stupac. Razvlači ih po razdoblju glasanja determinističkom
  // krivuljom (jak početak, pad, skok pred kraj) — isti ulaz, isti raspored.
  const CURVE = [0.23, 0.14, 0.1, 0.08, 0.11, 0.16, 0.18];

  for (const e of elections) {
    if (e._count.votes === 0) continue;

    const row = await prisma.election.findUnique({
      where: { id: e.id },
      select: { startsAt: true, endsAt: true },
    });
    if (!row) continue;

    const spanMs = row.endsAt.getTime() - row.startsAt.getTime();
    if (spanMs <= 0) continue; // nezakazani nacrt (endsAt === startsAt)

    const votes = await prisma.vote.findMany({
      where: { electionId: e.id },
      orderBy: { id: "asc" },
      select: { id: true },
    });

    const perDay = split(votes.length, CURVE);
    const dayMs = Math.min(86_400_000, Math.floor(spanMs / CURVE.length));

    // Jedan updateMany po danu — svi listići tog dana dijele vrijeme, što je
    // dovoljno jer graf ionako grupira po danu (stotine pojedinačnih update-ova
    // ruše transakciju u timeout).
    let cursor = 0;
    for (const [day, n] of perDay.entries()) {
      if (n === 0) continue;
      const ids = votes.slice(cursor, cursor + n).map((v) => v.id);
      cursor += n;
      await prisma.vote.updateMany({
        where: { id: { in: ids } },
        data: { createdAt: new Date(row.startsAt.getTime() + day * dayMs) },
      });
    }
  }
  console.log("  vremena listića razvučena po razdoblju glasanja");

  // Kvorum na dva zatvorena izbora: prvi ga ispunjava, drugi ne. Prag se računa
  // iz stvarne izlaznosti da oba stanja kartice budu vidljiva.
  const closed = elections
    .filter((e) => e.status === "CLOSED" && e._count.voters > 0)
    .slice(0, 2);

  for (const [i, e] of closed.entries()) {
    const turnout = Math.round((e._count.votes / e._count.voters) * 100);
    const threshold = i === 0 ? Math.max(5, turnout - 15) : Math.min(95, turnout + 15);
    await prisma.election.update({
      where: { id: e.id },
      data: { quorumThreshold: threshold },
    });
    console.log(
      `  kvorum ${threshold}% na "${e.title}" (izlaznost ${turnout}%) → ${
        turnout >= threshold ? "ispunjen" : "nije ispunjen"
      }`,
    );
  }

  console.log(`\nGotovo: ${seeded} izbora dobilo kandidate, ${closed.length} kvorum.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
