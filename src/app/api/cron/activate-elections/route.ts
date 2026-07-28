import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publishElection } from "@/lib/services/publication.service";
import { windowOver } from "@/lib/services/token.service";

// Election lifecycle sweep (election-publication-spec §5 + expired-token-sends
// fix): opens due SCHEDULED elections and publishes their invitations, then
// closes ACTIVE elections whose deadline has passed. Idempotent — safe to ping
// every minute; a quiet sweep matches 0 rows and exits. The trigger is
// infrastructure config (cron-job.org now, real crontab later), never app code.
//
// Both transitions live here on purpose: one endpoint, one CRON_SECRET, one
// pinger. A separate close route would add infrastructure the app cannot
// verify exists — and an unconfigured sweep is exactly what left elections
// ACTIVE past their deadline, minting dead magic links.
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

  return NextResponse.json({ activated: elections.length, closed, elections });
}
