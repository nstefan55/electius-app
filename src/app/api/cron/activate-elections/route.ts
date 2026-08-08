import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  autoReminderDue,
  publishElection,
  REMINDER_LEAD_MS,
  sendReminders,
} from "@/lib/services/publication.service";
import { windowOver } from "@/lib/services/token.service";
import { pruneExpiredArchives } from "@/lib/services/archive.service";
import { resolveEntitlement } from "@/lib/services/entitlement.service";

// Election lifecycle sweep (election-publication-spec §5 + expired-token-sends
// fix + pro-features §2): opens due SCHEDULED elections and publishes their
// invitations, closes ACTIVE elections whose deadline has passed, sends the
// automatic 24 h voter reminder, and prunes expired archive proofs. Idempotent
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

export async function POST(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
    closed += count;
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
    const { kind } = await resolveEntitlement(e.id, e.organizationId);
    if (kind === "free") continue;

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

  return NextResponse.json({
    activated: elections.length,
    closed,
    reminded: reminded.length,
    elections,
    reminders: reminded,
    archives: archives ?? { pruned: 0, kept: 0 },
  });
}
