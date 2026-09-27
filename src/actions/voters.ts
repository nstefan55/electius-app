"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/require-session";
import {
  dedupeVoterRows,
  toVoterFields,
  voterRowSchema,
} from "@/lib/wizard-csv";
import { inviteVoter } from "@/lib/services/publication.service";
import { voterCap } from "@/lib/entitlements";
import { EDITABLE_STATUSES } from "@/lib/elections-view";
import { resolveEntitlement } from "@/lib/services/entitlement.service";
import { mutationsFrozen } from "@/lib/services/token.service";
import { resolveLocale } from "@/i18n/config";

// Upravljanje biračima (voter-management-spec). Svaka akcija je org-scoped i
// nosi status izbora u WHERE klauzuli — nikad pročitaj-pa-provjeri.
//
// Odluke:
//  · Popis se zatvara pokretanjem glasanja (2026-09-27, poništava 2026-07-26).
//  · Bez odgode između ponovnih slanja — kao sendElectionReminders.

type ActionResult = { success: boolean; error?: string };

export type AddVotersResult = ActionResult & {
  added?: number;
  skipped?: number;
  // Uz error: "voterCap". Granica i trenutačno stanje putuju s odbijanjem jer
  // ih poruka mora imenovati — goli `error: string` to ne može (§4).
  cap?: number;
  current?: number;
};

// Ime se smije ispraviti dok izbori nisu gotovi (kozmetika, ne mijenja popis).
const OPEN_STATUSES = ["DRAFT", "SCHEDULED", "ACTIVE"] as const;

const addSchema = z.object({
  electionId: z.string().min(1),
  rows: z.array(voterRowSchema).min(1).max(10000),
});

const nameSchema = z.object({
  voterId: z.string().min(1),
  firstName: z.string().trim().max(100),
  lastName: z.string().trim().max(100),
});

// Dodavanje birača nakon kreiranja — isti dva ulaza kao čarobnjak (ručno + CSV),
// pa i isti `voterRowSchema`.
export async function addVoters(input: unknown): Promise<AddVotersResult> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "invalid" };
  const { electionId, rows } = parsed.data;

  try {
    const { organizationId } = await requireSession();

    // Vlasništvo + status u jednom WHERE-u; isti upit donosi postojeće adrese
    // za usporedbu bez obzira na velika/mala slova.
    // ponytail: čita sve e-adrese izbora. Dovoljno za MVP (Free 50, seed 285)
    // — suzi na kandidatski skup ako Pro popisi narastu na tisuće.
    // Bez provjere roka: windowOver bi nacrt stariji od 30 dana proglasio gotovim.
    const election = await prisma.election.findFirst({
      where: {
        id: electionId,
        organizationId,
        status: { in: [...EDITABLE_STATUSES] },
      },
      select: { voters: { select: { email: true } } },
    });
    if (!election) return { success: false, error: "invalidStatus" };

    // @@unique([email, electionId]) bi odbio cijeli createMany na duplikatu, pa
    // se filtrira unaprijed: prvo unutar unosa, zatim prema postojećem popisu.
    const fresh = dedupeVoterRows(rows, election.voters.map((v) => v.email));
    const skipped = rows.length - fresh.length;
    if (fresh.length === 0) return { success: true, added: 0, skipped };

    // Granica birača (§4). Broji se `fresh`, NE `rows`: dedupliciranje je gore,
    // pa organizacija na Free planu s 50 birača koja ponovno učita isti CSV od
    // 50 redaka ne smije biti odbijena — taj poziv ne upisuje ništa.
    // Odbijanje ide neuspješnim putem, ne kroz `blocked`: `blocked` je kvalifikator
    // uspjeha ("dodani su, ali pozivnica nije poslana") i dijalog ga čita tek nakon
    // res.success, pa bi odbijanje ovdje tiho ispalo u generičku poruku o grešci.
    const current = election.voters.length;
    const cap = voterCap(await resolveEntitlement(electionId, organizationId));
    if (current + fresh.length > cap) {
      return { success: false, error: "voterCap", cap, current };
    }

    // ponytail: status i upis bez transakcije — pokretanje između njih ostavlja PENDING bez pozivnice (resend popravlja); transakcija ako zatreba.
    await prisma.voter.createMany({
      data: fresh.map((r) => ({ electionId, ...toVoterFields(r) })),
    });

    return { success: true, added: fresh.length, skipped };
  } catch {
    return { success: false, error: "failed" };
  }
}

// Ime je jedino promjenjivo polje. E-mail je identitet (@@unique([email,
// electionId])) i veže već poslani token — promjena bi bila brisanje + dodavanje.
export async function updateVoterName(input: unknown): Promise<ActionResult> {
  const parsed = nameSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "invalid" };
  const { voterId, firstName, lastName } = parsed.data;

  try {
    const { organizationId } = await requireSession();

    // Prozor se mora pročitati (usporedba stupca sa stupcem ne ide u WHERE),
    // pa isti oblik kao startElection: pročitaj pa odbij za prozor, a
    // vlasništvo i status ostaju u WHERE klauzuli upisa ispod.
    const voter = await prisma.voter.findFirst({
      where: { id: voterId, election: { organizationId } },
      select: {
        election: { select: { status: true, startsAt: true, endsAt: true } },
      },
    });
    if (!voter) return { success: false, error: "forbidden" };
    if (mutationsFrozen(voter.election)) {
      return { success: false, error: "electionEnded" };
    }

    const { count } = await prisma.voter.updateMany({
      where: {
        id: voterId,
        election: { organizationId, status: { in: [...OPEN_STATUSES] } },
      },
      data: { firstName: firstName || null, lastName: lastName || null },
    });
    return count === 0
      ? { success: false, error: "forbidden" }
      : { success: true };
  } catch {
    return { success: false, error: "failed" };
  }
}

// Uklanjanje birača. Sva tri uvjeta su u WHERE-u, pa tuđi izbor, otvoreno
// glasanje i birač koji je već glasao svi pogode 0 redaka i no-op-aju.
// Token nestaje kaskadno (onDelete: Cascade na voterId).
export async function removeVoter(voterId: string): Promise<ActionResult> {
  if (!voterId) return { success: false, error: "invalid" };

  try {
    const { organizationId } = await requireSession();
    const { count } = await prisma.voter.deleteMany({
      where: {
        id: voterId,
        status: { not: "VOTED" },
        election: {
          organizationId,
          status: { in: [...EDITABLE_STATUSES] },
        },
      },
    });
    return count === 0
      ? { success: false, error: "invalidStatus" }
      : { success: true };
  } catch {
    return { success: false, error: "failed" };
  }
}

// Ponovno slanje poveznice jednom biraču. Ista cjevovodna staza kao voter-flow
// resend (inviteVoter) — poništava prethodno poslanu poveznicu.
export async function resendVoterInvite(
  voterId: string,
): Promise<ActionResult> {
  if (!voterId) return { success: false, error: "invalid" };

  try {
    const { organizationId } = await requireSession();
    const voter = await prisma.voter.findFirst({
      where: {
        id: voterId,
        status: { not: "VOTED" },
        election: { organizationId, status: "ACTIVE" },
      },
      select: {
        status: true,
        election: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            organization: { select: { name: true, contactEmail: true } },
            createdBy: { select: { locale: true } },
          },
        },
      },
    });
    if (!voter) return { success: false, error: "invalidStatus" };

    const result = await inviteVoter(voterId, voter.status, {
      id: voter.election.id,
      title: voter.election.title,
      organizationName: voter.election.organization.name,
      organizationEmail: voter.election.organization.contactEmail,
      startsAt: voter.election.startsAt,
      endsAt: voter.election.endsAt,
      // ponytail: jezik stvaratelja izbora, isto kao skupno slanje — birač
      // nema svoj redak. Uz dodatna mjesta ide Organization.locale.
      locale: resolveLocale(voter.election.createdBy.locale),
    });
    if (result === "windowOver") {
      return { success: false, error: "windowOver" };
    }
    // Resend je primio poziv i odbio baš ovu adresu (permissive slanje). Nije
    // greška poslužitelja i ponovni klik je neće popraviti, pa poruka mora
    // imenovati adresu kao uzrok — generično "nije uspjelo" poziva na uzaludno
    // ponavljanje. Redak je već žigosan, pa ga popis odmah i označi.
    if (result === "rejected") {
      return { success: false, error: "deliveryRejected" };
    }
    return { success: true };
  } catch {
    return { success: false, error: "failed" };
  }
}
