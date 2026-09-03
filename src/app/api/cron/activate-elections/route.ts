import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  autoReminderDue,
  publishElection,
  REMINDER_LEAD_MS,
  sendAdminTurnout,
  sendReminders,
} from "@/lib/services/publication.service";
import { windowOver } from "@/lib/services/token.service";
import {
  computeSweepNextDue,
  storeSweepNextDue,
  sweepDue,
} from "@/lib/services/sweep-gate";
import { pruneExpiredArchives } from "@/lib/services/archive.service";
import { resolveEntitlement } from "@/lib/services/entitlement.service";
import { revalidatePublicResults } from "@/lib/public-results-cache";
import { canUseAdminTurnout, canUseAutoReminders } from "@/lib/entitlements";
import { turnoutMilestoneDue, turnoutPct } from "@/lib/elections-view";

// Election lifecycle sweep (election-publication-spec §5 + expired-token-sends
// fix + pro-features §2 + email-delivery §4): opens due SCHEDULED elections and
// publishes their invitations, closes ACTIVE elections whose deadline has passed,
// sends the automatic 24 h voter reminder, notifies admins when turnout crosses a
// milestone, and prunes expired archive proofs. Idempotent
// — safe to ping every minute; a quiet sweep matches 0 rows and exits. The
// trigger is infrastructure config (cron-job.org now, real crontab later),
// never app code.
//
// Sve radnje žive ovdje namjerno: jedan endpoint, jedan CRON_SECRET, jedan
// pinger. Zasebna ruta dodala bi infrastrukturu koju aplikacija ne može
// provjeriti da postoji — a nepodešena metla je upravo ono što je ostavljalo
// izbore ACTIVE nakon roka, kujući mrtve čarobne poveznice.
// ponytail: sweep-side self-healing of PENDING voters in ACTIVE elections is a
// one-line widening if wanted later; failed-send retry stays admin-driven.

// Bearer CRON_SECRET, timing-safe compare. Length check first — timingSafeEqual
// throws on unequal lengths, and leaking the length alone is harmless.
function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Tri jeftina čitanja NAKON prolaza, pa vrijednosti odražavaju stanje poslije
// metle (sweep-gate spec D7 — što je upravo obrađeno ne smije prikovati rok u
// prošlost). ponytail: neograničen findMany po ACTIVE — šačica redaka na MVP
// skali, četiri skalarna stupca.
async function gatherSchedule(now: Date) {
  const [scheduled, active, archive] = await Promise.all([
    prisma.election.aggregate({
      where: { status: "SCHEDULED" },
      _min: { startsAt: true },
    }),
    prisma.election.findMany({
      where: { status: "ACTIVE" },
      select: {
        startsAt: true,
        endsAt: true,
        voterReminder24h: true,
        autoReminderSentAt: true,
      },
    }),
    prisma.archive.aggregate({
      where: { prunedAt: null, expiresAt: { gt: now } },
      _min: { expiresAt: true },
    }),
  ]);
  return {
    nextScheduledStart: scheduled._min.startsAt,
    active,
    nextArchiveExpiry: archive._min.expiresAt,
  };
}

export async function POST(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Vrata metle: većina pingova završava ovdje, iz samog Redisa — Neon se ne
  // budi jer se adapter spaja lijeno, a ovo je prije prvog Prisma poziva.
  // 200 i za preskok, da cron-job.org bilježi uspjeh.
  if (!(await sweepDue())) {
    return NextResponse.json({ skipped: true });
  }

  const due = await prisma.election.findMany({
    where: { status: "SCHEDULED", startsAt: { lte: new Date() } },
    select: { id: true },
  });

  const elections: { id: string; sent: number; failed: number }[] = [];
  for (const { id } of due) {
    // Same atomic-guard shape as startElection: the status check lives in the
    // WHERE clause, so a concurrent sweep flips each election exactly once.
    // startsAt stays as scheduled — the admin picked that time.
    const { count } = await prisma.election.updateMany({
      where: { id, status: "SCHEDULED" },
      data: { status: "ACTIVE" },
    });
    if (count === 0) continue;

    // A publish failure never un-activates: voters stay PENDING → Retry.
    // On a pipeline throw, report the still-PENDING count as failed so the
    // response never reads "0 failed" for an unpublished election.
    const result = await publishElection(id).catch(() => null);
    const failed =
      result?.failed ??
      (await prisma.voter
        .count({ where: { electionId: id, status: "PENDING" } })
        .catch(() => 0));
    elections.push({ id, sent: result?.sent ?? 0, failed });
  }

  // Zatvaranje: ACTIVE kojima je prozor glasanja gotov. Odluku donosi ISTI
  // windowOver kao i staze slanja — `endsAt <= now` u WHERE klauzuli bio bi
  // drugo pravilo i zatvorio bi izbore kojima tokeni još žive: ručno pokretanje
  // postavlja startsAt na sada, pa stari endsAt postane rezervirani datum
  // (endsAt <= startsAt) = otvoreno 30 dana. Upit je samo predfilter.
  const dueClose = await prisma.election.findMany({
    where: { status: "ACTIVE", endsAt: { lte: new Date() } },
    select: { id: true, startsAt: true, endsAt: true },
  });

  // endsAt se NE prepisuje (za razliku od ručnog zatvaranja): rok je stvaran i
  // zapisan, čistač ga samo provodi.
  let closed = 0;
  for (const e of dueClose) {
    if (!windowOver(e)) continue;
    // Isti atomski oblik — status u WHERE klauzuli, pa istovremeni prolazi
    // zatvaraju svaki izbor točno jednom.
    const { count } = await prisma.election.updateMany({
      where: { id: e.id, status: "ACTIVE" },
      data: { status: "CLOSED" },
    });
    if (count === 0) continue;
    closed += count;

    // Isti prijelaz kao ručno zatvaranje, samo bez nadzora — i češći put do
    // njega. Bez ovoga javna stranica do sat vremena tvrdi da glasanje traje.
    revalidatePublicResults(e.id);
  }

  // Automatski podsjetnik 24 h prije zatvaranja (pro-features §2). Treći prolaz
  // ovdje, a ne na svojoj ruti — isti razlog kao zatvaranje i obrezivanje.
  //
  // Upit je samo predfilter; odluku donosi autoReminderDue (uključujući pravilo
  // da izbori kraći od 24 h nikad nisu imali trenutak "24 sata prije kraja").
  const remindNow = new Date();
  const dueReminder = await prisma.election.findMany({
    where: {
      status: "ACTIVE",
      voterReminder24h: true,
      autoReminderSentAt: null,
      endsAt: {
        gt: remindNow,
        lte: new Date(remindNow.getTime() + REMINDER_LEAD_MS),
      },
    },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      organizationId: true,
    },
  });

  const reminded: { id: string; sent: number; failed: number }[] = [];
  for (const e of dueReminder) {
    if (!autoReminderDue(e, remindNow)) continue;

    // Pravo se provjerava PRIJE zauzimanja: Free organizaciji se biljeg ne
    // postavlja, pa izbori koji sutra postanu Pro još uvijek mogu dobiti svoj
    // podsjetnik. Dok je naplata isključena razrješivač svima vraća pro i ne
    // dira bazu.
    // Isto imenovano pravilo koje čitaju čarobnjak i createElection — inače bi
    // isti uvjet postojao u tri izvedbe (invarijanta #5).
    const entitlement = await resolveEntitlement(e.id, e.organizationId);
    if (!canUseAutoReminders(entitlement)) continue;

    // Zauzmi pa pošalji — biljeg se postavlja PRIJE slanja, istim atomskim
    // oblikom kao ostali prolazi (uvjet u WHERE klauzuli, broj JE provjera).
    // Obrnuti redoslijed pustio bi dvije istodobne metle da obje prođu kroz
    // "još nije poslano" i pošalju dvaput, a svako slanje rotira svakom biraču
    // poveznicu. Cijena ovog smjera: pad između zauzimanja i slanja pojede
    // podsjetnik. To je jeftinija strana — propušten podsjetnik nije događaj,
    // a bujica poruka koje jedna drugoj ubijaju poveznicu jest upravo ono zbog
    // čega ovaj stupac postoji. Ručni gumb ostaje kao izlaz i nije blokiran.
    const { count } = await prisma.election.updateMany({
      where: { id: e.id, status: "ACTIVE", autoReminderSentAt: null },
      data: { autoReminderSentAt: remindNow },
    });
    if (count === 0) continue;

    const result = await sendReminders(e.id).catch((error) => {
      // Biljeg se NE briše: brisanje bi vratilo utrku koju upravo sprječava, a
      // ponovno kovanje na svaki otkucaj ostavlja niz mrtvih poveznica.
      console.error("[cron] reminder send failed", { id: e.id, error });
      return null;
    });
    reminded.push({
      id: e.id,
      sent: result?.sent ?? 0,
      failed: result?.failed ?? 0,
    });
  }

  // Obavijesti administratoru o izlaznosti (email-delivery §4.5). Peti prolaz,
  // isti oblik kao podsjetnik i iz istih razloga.
  //
  // Upit je samo predfilter: `lt: 75` izbacuje izbore kojima je javljena zadnja
  // prečka, a koju točno prečku treba javiti odlučuje čisti turnoutMilestoneDue.
  const dueTurnout = await prisma.election.findMany({
    where: {
      status: "ACTIVE",
      adminTurnoutReminder: true,
      adminTurnoutNotifiedPct: { lt: 75 },
    },
    select: {
      id: true,
      organizationId: true,
      adminTurnoutNotifiedPct: true,
      _count: { select: { voters: true, votes: true } },
    },
  });

  const turnout: { id: string; milestone: number; sent: number }[] = [];
  for (const e of dueTurnout) {
    // Ista derivacija koju čitaju nadzorna ploča i pregled izbora — poruka i
    // zaslon ne smiju prijaviti različitu izlaznost (invarijanta #5).
    const pct = turnoutPct(e._count.votes, e._count.voters);
    const milestone = turnoutMilestoneDue(pct, e.adminTurnoutNotifiedPct);
    if (milestone === null) continue;

    // Pravo PRIJE zauzimanja: Free organizaciji se biljeg ne postavlja, pa izbori
    // koji sutra postanu Pro još uvijek mogu dobiti svoje prečke. Vlastito
    // pravilo, ne canUseAutoReminders — dva odvojeno uključiva prekidača ne smiju
    // dijeliti jednu zaštitu.
    const entitlement = await resolveEntitlement(e.id, e.organizationId);
    if (!canUseAdminTurnout(entitlement)) continue;

    // Zauzmi pa pošalji. `lt: milestone` je cijela provjera — dvije istodobne
    // metle ne mogu obje proći, a broj ažuriranih redaka JE odgovor. Uvjet je
    // `lt`, a ne "jednako prethodnoj vrijednosti", jer izlaznost može i pasti
    // (addVoters diže nazivnik): biljeg raste, izlaznost ne mora.
    const { count } = await prisma.election.updateMany({
      where: {
        id: e.id,
        status: "ACTIVE",
        adminTurnoutNotifiedPct: { lt: milestone },
      },
      data: { adminTurnoutNotifiedPct: milestone },
    });
    if (count === 0) continue;

    const result = await sendAdminTurnout(e.id, milestone).catch((error) => {
      // Biljeg se NE briše: brisanje bi vratilo utrku koju sprječava, a metla se
      // pinga svake minute. Propuštena obavijest o izlaznosti nije događaj.
      console.error("[cron] turnout send failed", { id: e.id, error });
      return null;
    });
    turnout.push({ id: e.id, milestone, sent: result?.sent ?? 0 });
  }

  // Obrezivanje isteklog tereta dokaza arhive (entitlement-enforcement-spec §6).
  // Ovdje, a ne na svojoj ruti: treća radnja iza istog CRON_SECRET-a i istog
  // pingera je jeftinija od druge infrastrukture koju aplikacija ne može
  // provjeriti da postoji — isti razlog zbog kojeg je i zatvaranje ovdje.
  //
  // Bez dnevne brave. Za nju treba zapis o zadnjem prolazu, kojeg shema nema,
  // pa bi brava tražila migraciju skuplju od onoga što štedi. Metla je
  // idempotentna, a indeksirani upit koji vrati 0 redaka jeftiniji je od
  // vođenja dnevnika prolaza.
  // ponytail: bravu dodati tek ako se cijena upita ikad pojavi u mjerenjima.
  const archives = await pruneExpiredArchives().catch((error) => {
    // Obrezivanje ne smije srušiti otvaranje i zatvaranje izbora — to su
    // radnje s rokom, a arhiva može pričekati sljedeći ping.
    console.error("[cron] archive prune failed", { error });
    return null;
  });

  // Ponovni izračun i spremanje roka. Pad ovdje ne smije prijaviti neuspjeh
  // za već obavljene prolaze — bez spremanja ključa vrata ostaju otvorena i
  // sljedeći ping opet mete (fail-open, D3 smjer).
  const gateNow = new Date();
  let nextDue: number | null = null;
  try {
    nextDue = computeSweepNextDue(await gatherSchedule(gateNow), gateNow);
    await storeSweepNextDue(nextDue);
  } catch (error) {
    console.error("[cron] sweep gate store failed", { error });
  }

  return NextResponse.json({
    activated: elections.length,
    closed,
    reminded: reminded.length,
    notified: turnout.length,
    elections,
    reminders: reminded,
    turnout,
    archives: archives ?? { pruned: 0, kept: 0 },
    nextDue,
  });
}
