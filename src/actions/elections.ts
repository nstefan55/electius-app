"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/require-session";
import { ArchiveError, sealElection } from "@/lib/services/archive.service";
import {
  getReminderTargets,
  publishElection,
  sendReminders,
} from "@/lib/services/publication.service";
import { deadlinePassed, mutationsFrozen } from "@/lib/services/token.service";
import { clearSweepGate } from "@/lib/services/sweep-gate";
import { deleteObject } from "@/lib/services/storage.service";
import { revalidatePublicResults } from "@/lib/public-results-cache";

// Election row-management mutations behind the dashboard three-dot menu.
// Each action verifies the target election belongs to the session's org before
// mutating — otherwise any authed user could rename/duplicate/archive/delete
// another org's elections by ID (finding #1). ponytail: manual validation, no Zod.
type ActionResult = { success: boolean; error?: string };

const MAX_TITLE = 255;

// Cheap shared ownership check — one indexed `findFirst` per mutation.
// Same check, narrowed to an open election — anything that emails voters is
// only meaningful (and only allowed) while voting is running.
async function assertOwnedActive(
  id: string,
  organizationId: string,
): Promise<boolean> {
  const owned = await prisma.election.findFirst({
    where: { id, organizationId, status: "ACTIVE" },
    select: { id: true },
  });
  return owned !== null;
}

// Rename — the only field the inline editor touches.
export async function renameElection(
  id: string,
  title: string,
): Promise<ActionResult> {
  const name = title.trim();
  if (!id || !name) return { success: false, error: "invalid" };

  try {
    const { organizationId } = await requireSession();

    // Vlasništvo ostaje u WHERE klauzuli; prozor se mora pročitati jer je to
    // usporedba stupca sa stupcem, pa isti upit donosi i status i datume.
    const election = await prisma.election.findFirst({
      where: { id, organizationId },
      select: { status: true, startsAt: true, endsAt: true },
    });
    if (!election) return { success: false, error: "forbidden" };

    // Gotovi izbori se ne preimenuju (zahtjev 3). Kod zapečaćenih je oštrije:
    // Archive.electionData čuva vlastitu kopiju naslova, pa bi preimenovanje
    // razdvojilo živi redak od potpisanog zapisa — arhivska kartica, PDF
    // izvještaj i izvozi čitali bi s dviju strana istog neslaganja.
    if (mutationsFrozen(election)) {
      return { success: false, error: "electionEnded" };
    }

    await prisma.election.update({
      where: { id },
      data: { title: name.slice(0, MAX_TITLE) },
    });
    return { success: true };
  } catch {
    return { success: false, error: "failed" };
  }
}

// Duplicate — a fresh DRAFT copy: same config + options, no voters/votes.
export async function duplicateElection(id: string): Promise<ActionResult> {
  if (!id) return { success: false, error: "invalid" };

  try {
    const { organizationId } = await requireSession();
    const src = await prisma.election.findFirst({
      where: { id, organizationId },
      include: { options: { orderBy: { orderIndex: "asc" } } },
    });
    if (!src) return { success: false, error: "notfound" };

    await prisma.election.create({
      data: {
        title: `${src.title} (Copy)`.slice(0, MAX_TITLE),
        description: src.description,
        electionType: src.electionType,
        votingType: src.votingType,
        status: "DRAFT",
        startsAt: src.startsAt,
        endsAt: src.endsAt,
        resultsVisible: src.resultsVisible,
        resultsMode: src.resultsMode,
        allowAbstain: src.allowAbstain,
        quorumThreshold: src.quorumThreshold,
        voterReminder24h: src.voterReminder24h,
        organizationId: src.organizationId,
        createdById: src.createdById,
        options: {
          create: src.options.map((o) => ({
            text: o.text,
            orderIndex: o.orderIndex,
          })),
        },
      },
    });
    return { success: true };
  } catch {
    return { success: false, error: "failed" };
  }
}

// Arhiviranje = PEČAĆENJE (election-archive-merkle-seal-spec, stadij 3):
// snimka konfiguracije + Merkle stablo nad svim voteHashevima → red u Archive,
// pa atomični CLOSED → ARCHIVED. Vraća korijen jer je on potvrda.
//
// Bio je ovo jedini mutator u bazi koji je čitao pa provjeravao: assertOwned u
// zasebnom krugu i gol update BEZ ijedne provjere statusa, pa se aktivni izbori
// dao arhivirati usred glasanja. sealElection zatvara oboje — čuvari su u WHERE
// klauzuli (invarijanta #3). Samo CLOSED: pečaćenje živih izbora zamrznulo bi
// glasanje, pa se ACTIVE/DRAFT namjerno odbija s invalidStatus.
export type ArchiveActionResult = ActionResult & {
  merkleRoot?: string;
  votesSealed?: number;
};

export async function archiveElection(
  id: string,
): Promise<ArchiveActionResult> {
  if (!id) return { success: false, error: "invalid" };

  try {
    const { organizationId } = await requireSession();
    const { merkleRoot, votesSealed } = await sealElection(id, organizationId);
    return { success: true, merkleRoot, votesSealed };
  } catch (e) {
    if (e instanceof ArchiveError) return { success: false, error: e.code };
    return { success: false, error: "failed" };
  }
}

// Manual start (election-manual-start-spec) — DRAFT → ACTIVE, voting opens now.
// The status guard lives in the WHERE clause: updateMany flips only a row that
// is still DRAFT, so a concurrent double-click (or a non-draft id) atomically
// no-ops with count 0 — no read-then-write race.
// After the flip, publishElection sends the invitations (election-publication
// spec): tokens + chunked Resend batches, voters flip PENDING → INVITED per
// successful chunk. The election activates even if sends fail — the voting
// window is open; failed invitations are a retry problem, never a rollback.
export type PublishActionResult = ActionResult & {
  sent?: number;
  failed?: number;
  // Rok je istekao pa nitko nije dostupan — nije isto što i "nitko nije trebao
  // pozivnicu". Prolazi ravno iz publishElement do zaslona.
  blocked?: "windowOver";
};

export async function startElection(id: string): Promise<PublishActionResult> {
  if (!id) return { success: false, error: "invalid" };

  try {
    const { organizationId } = await requireSession();

    // Rok zakazan pa prošao → odbij. Inače bi startsAt = sada pretvorio endsAt
    // u rezervirani datum (endsAt <= startsAt) i glasanje bi tiho trajalo 30
    // dana umjesto do datuma koji je admin postavio — tiho pretumačenje.
    // Ne može u WHERE klauzulu: usporedba stupca sa stupcem. Atomičnost čuva
    // updateMany ispod; datumi se ne mijenjaju paralelno, pa utrke nema.
    //
    // deadlinePassed, NE windowOver: pitanje je ima li nacrt stvaran rok koji je
    // prošao. Nacrt bez roka nosi rezervirani datum i startsAt = trenutak
    // stvaranja, pa bi ga windowOver (usidren u startsAt) nakon 30 dana trajno
    // zabranio — iako redak ispod ionako prepisuje startsAt na sada.
    const draft = await prisma.election.findFirst({
      where: { id, organizationId, status: "DRAFT" },
      select: { startsAt: true, endsAt: true },
    });
    if (!draft) return { success: false, error: "invalidStatus" };
    if (deadlinePassed(draft)) {
      return { success: false, error: "deadlinePassed" };
    }

    const { count } = await prisma.election.updateMany({
      where: { id, organizationId, status: "DRAFT" },
      // startsAt = now: voting opened at the click, not at the wizard's
      // placeholder date. endsAt left as-is (may be unscheduled).
      data: { status: "ACTIVE", startsAt: new Date() },
    });
    if (count === 0) return { success: false, error: "invalidStatus" };

    // Novi ACTIVE izbori nose nova buduća vremena (zatvaranje, podsjetnik) —
    // obriši rok metle (sweep-gate D4). Nikad ne baca; guta greške.
    await clearSweepGate();
  } catch {
    return { success: false, error: "failed" };
  }

  // Outside the try above: from here the election IS active — never report
  // a start failure for a send failure.
  const result = await publishElection(id).catch(() => null);
  if (result) return { success: true, ...result };
  // Pipeline threw before any chunk resolved — everyone still PENDING.
  const failed = await prisma.voter
    .count({ where: { electionId: id, status: "PENDING" } })
    .catch(() => 0);
  return { success: true, sent: 0, failed };
}

// Resend invitations to voters still PENDING after a failed/cut-short send.
// ACTIVE elections only; publishElection is idempotent (targets PENDING only),
// so INVITED/VOTED voters are never re-emailed and their links stay valid.
export async function resendInvitations(
  id: string,
): Promise<PublishActionResult> {
  if (!id) return { success: false, error: "invalid" };

  try {
    const { organizationId } = await requireSession();
    const owned = await prisma.election.findFirst({
      where: { id, organizationId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "invalidStatus" };

    const result = await publishElection(id);
    return { success: true, ...result };
  } catch {
    return { success: false, error: "failed" };
  }
}

// ───────── Send reminder (election-overview-phase-3) ─────────

export type ReminderPreviewResult = ActionResult & {
  recipients?: number;
  alreadyVoted?: number;
  expired?: number;
};

// Counts for the confirm modal. Fetched when the dialog opens rather than
// rendered into the page, so the numbers are current at the moment the admin
// is about to send — turnout moves while the overview sits open.
export async function reminderPreview(
  id: string,
): Promise<ReminderPreviewResult> {
  if (!id) return { success: false, error: "invalid" };

  try {
    const { organizationId } = await requireSession();
    if (!(await assertOwnedActive(id, organizationId))) {
      return { success: false, error: "invalidStatus" };
    }

    const { recipients, alreadyVoted, expired } = await getReminderTargets(id);
    return {
      success: true,
      recipients: recipients.length,
      alreadyVoted,
      expired,
    };
  } catch {
    return { success: false, error: "failed" };
  }
}

// The send itself. Re-derives its own recipient list (never trusts a count the
// client round-tripped) via the same getReminderTargets rule the preview used.
//
// Namjerno NE dira Election.autoReminderSentAt (odluka na /feature start).
// Taj stupac znači "automatski podsjetnik 24 h prije zatvaranja je otišao" i
// ništa više. Da ga ova radnja postavlja, jedno ručno podsjećanje pet dana
// ranije tiho bi otkazalo oglašeni automatski podsjetnik — administrator bi
// isključio Pro značajku time što ju je koristio. Da ga čita, metla bi mogla
// blokirati administratora koji svjesno šalje. Dvije različite radnje, dvije
// odluke.
// ponytail: no cooldown between sends — the action is session-gated and
// org-scoped; add a per-election window if admins start spamming voters.
export async function sendElectionReminders(
  id: string,
): Promise<PublishActionResult> {
  if (!id) return { success: false, error: "invalid" };

  try {
    const { organizationId } = await requireSession();
    if (!(await assertOwnedActive(id, organizationId))) {
      return { success: false, error: "invalidStatus" };
    }

    const result = await sendReminders(id);
    return { success: true, ...result };
  } catch {
    return { success: false, error: "failed" };
  }
}

// Close early (election-overview-phase-1) — ACTIVE → CLOSED right now.
// Same atomic guard as startElection: the status lives in the WHERE clause, so
// a double-click, a cross-org id, or a race with the deadline sweep all match
// 0 rows and no-op instead of re-closing an already-closed election.
export async function closeElection(id: string): Promise<ActionResult> {
  if (!id) return { success: false, error: "invalid" };

  try {
    const { organizationId } = await requireSession();
    const { count } = await prisma.election.updateMany({
      where: { id, organizationId, status: "ACTIVE" },
      // endsAt = now so the window reads as genuinely over everywhere it is
      // rendered (turnout bars, "time left", voter-flow state) — the mirror of
      // startElection setting startsAt at the click.
      data: { status: "CLOSED", endsAt: new Date() },
    });
    if (count === 0) return { success: false, error: "invalidStatus" };

    // Javna stranica rezultata upravo je prešla sa skrivenog zaslona na zbroj
    // (resultsDetailAccess sada vraća "closed"), a mijenja se i ispisani endsAt.
    // Poništi njezin ISR zapis — inače kašnjenje traje do TTL-a (1 h). NAKON
    // straže: zatvaranje koje nije pogodilo nijedan redak nema što poništiti.
    revalidatePublicResults(id);
    return { success: true };
  } catch {
    return { success: false, error: "failed" };
  }
}

// Delete — permanent. Vote and Archive have no onDelete cascade (anonymity /
// integrity are deliberate), so clear them first, then let the election cascade
// remove voters, tokens and options. All-or-nothing in one transaction.
export async function deleteElection(id: string): Promise<ActionResult> {
  if (!id) return { success: false, error: "invalid" };

  try {
    const { organizationId } = await requireSession();
    // Zamjenjuje assertOwned: org ostaje u WHERE, a u istom upitu stiže i ključ
    // izvještaja — PRIJE brisanja retka, jer poslije ga nema odakle pročitati.
    const election = await prisma.election.findFirst({
      where: { id, organizationId },
      select: { reportKey: true },
    });
    if (!election) return { success: false, error: "forbidden" };

    await prisma.$transaction([
      prisma.archive.deleteMany({ where: { electionId: id } }),
      prisma.vote.deleteMany({ where: { electionId: id } }),
      prisma.election.delete({ where: { id } }),
    ]);

    // Izbora više nema, ali keširana stranica bi njegov zbroj posluživala do
    // TTL-a. Skriveni zaslon je jedini ispravan odgovor od ovog trenutka.
    revalidatePublicResults(id);

    // Baza prva, R2 drugi, i vlastiti catch: pad brisanja objekta ne smije
    // prijaviti neuspjeh za izbore kojih više nema. Glasno, nikad progutano.
    if (election.reportKey) {
      try {
        await deleteObject("private", election.reportKey);
      } catch (error) {
        console.error("[elections] report object delete failed", {
          id,
          key: election.reportKey,
          error,
        });
      }
    }
    return { success: true };
  } catch {
    return { success: false, error: "failed" };
  }
}
