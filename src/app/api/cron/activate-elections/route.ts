import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publishElection } from "@/lib/services/publication.service";

// Scheduled-activation sweep (election-publication-spec §5): flips due
// SCHEDULED elections to ACTIVE and publishes their invitations. Idempotent —
// safe to ping every minute; a quiet sweep matches 0 rows and exits. The
// trigger is infrastructure config (cron-job.org now, real crontab later),
// never app code — no host coupling.
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

  return NextResponse.json({ activated: elections.length, elections });
}
