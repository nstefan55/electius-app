"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/require-session";
import {
  candidateRowSchema,
  dedupeVoterRows,
  toVoterFields,
  voterRowSchema,
} from "@/lib/wizard-csv";
import {
  canUseAdminTurnout,
  canUseAutoReminders,
  canUseLiveResults,
  voterCap,
} from "@/lib/entitlements";
import { resolveEntitlement } from "@/lib/services/entitlement.service";
import { clearSweepGate } from "@/lib/services/sweep-gate";
import { zonedWallClockToInstant } from "@/lib/elections-view";

// Election creation wizard (all-elections phase 2). One action, two modes:
// full create (step 5 confirm) and draft save (top-bar link). Both are
// org-scoped through requireSession(); the client never supplies ids.
type CreateResult =
  | { success: true; data: { id: string } }
  // cap ide uz odbijanje jer poruka mora imenovati granicu; goli "nadogradite"
  // ne kaže ni koliko je birača previše (§8).
  | { success: false; error: string; cap?: number };

const wizardSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional(),
  electionType: z.enum(["STANDARD", "SURVEY", "POLL"]),
  votingType: z.enum(["SINGLE_CHOICE", "MULTI_CHOICE"]),
  allowAbstain: z.boolean(),
  candidates: z.array(candidateRowSchema).max(500),
  voters: z.array(voterRowSchema).max(10000),
  startMode: z.enum(["manual", "scheduled"]),
  // datetime-local strings ("YYYY-MM-DDTHH:mm"); empty string = not set
  startAt: z.string().max(30),
  closeAt: z.string().max(30),
  liveResults: z.boolean(),
  publicResults: z.boolean(),
  quorumThreshold: z.number().int().min(1).max(100).nullable(),
  adminTurnoutReminder: z.boolean(),
  voterReminder24h: z.boolean(),
});
export type WizardPayload = z.infer<typeof wizardSchema>;

export async function createElection(
  input: unknown,
  draft = false,
): Promise<CreateResult> {
  const parsed = wizardSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "invalid" };
  const w = parsed.data;

  // Type/method coupling (spec: survey → multi only, quick poll → single only).
  // The UI enforces it too, but the action is the trust boundary.
  if (
    (w.electionType === "SURVEY" && w.votingType !== "MULTI_CHOICE") ||
    (w.electionType === "POLL" && w.votingType !== "SINGLE_CHOICE")
  ) {
    return { success: false, error: "coupling" };
  }

  // Zidni sat iz čarobnjaka → stvarni trenutak u zoni izbora. Oba stupca sada
  // dijele isto sidro kao `now` niže, pa se razlika startsAt/endsAt više ne
  // može iskriviti (a s njom ni "nije zakazano" sentinela).
  const startAt = zonedWallClockToInstant(w.startAt);
  const closeAt = zonedWallClockToInstant(w.closeAt);

  if (!draft) {
    if (w.candidates.length < 2) return { success: false, error: "candidates" };
    if (w.startMode === "scheduled") {
      if (!startAt || !closeAt || closeAt <= startAt) {
        return { success: false, error: "schedule" };
      }
    } else if (closeAt && closeAt <= new Date()) {
      return { success: false, error: "schedule" };
    }
  }

  // Manual start stays DRAFT (admin opens voting later); a scheduled full
  // create is SCHEDULED. Drafts are always DRAFT regardless of start mode.
  const status = !draft && w.startMode === "scheduled" ? "SCHEDULED" : "DRAFT";

  // endsAt/startsAt are NOT NULL in the schema — DRAFT rows carry placeholder
  // dates and render "Not scheduled" (established phase-1 display rule).
  const now = new Date();
  const startsAt = w.startMode === "scheduled" ? (startAt ?? now) : now;
  const endsAt = closeAt ?? startsAt;

  // One row per unique email — @@unique([email, electionId]) would reject the
  // whole nested create on a duplicate.
  const voters = dedupeVoterRows(w.voters);

  try {
    const { organizationId, user } = await requireSession();
    const admin = await prisma.user.findUnique({
      where: { email: user.email },
      select: { id: true },
    });
    if (!admin) return { success: false, error: "failed" };

    // Granica birača (§4). Broji se popis NAKON deduplikacije — to je broj
    // redaka koji bi doista nastali. Provjera stoji prije ijednog upisa, pa
    // odbijanje ne ostavlja ni izbore ni pola popisa. electionId je null:
    // izbori još ne postoje, pa se pravo može razriješiti samo na razini
    // organizacije — točno redoslijed oko kojeg je resolver napisan.
    const entitlement = await resolveEntitlement(null, organizationId);

    const cap = voterCap(entitlement);
    if (voters.length > cap) {
      return { success: false, error: "voterCap", cap };
    }

    // Rezultati uživo su Pro. Klijent bira, poslužitelj odlučuje — isto kao kod
    // sprege tipa i metode: UI skriva prekidač, ali radnja je granica povjerenja
    // i payload dolazi od klijenta. Stoji uz granicu birača, dakle IZVAN
    // `if (!draft)`, pa nacrt ne može biti zaobilaznica: nacrt s LIVE-om samo bi
    // odgodio isto stanje do pokretanja izbora.
    if (w.liveResults && !canUseLiveResults(entitlement)) {
      return { success: false, error: "liveResultsLocked" };
    }

    // Automatski podsjetnik je jednako Pro, ali se do sada NIJE provjeravao
    // ovdje — jedina zaštita bila je metla, danima kasnije i bez sesije. Free
    // administrator bi uključio prekidač, vrijednost bi se spremila, pregled
    // izbora bi je prikazao kao uključenu, i 24 h prije kraja ne bi se dogodilo
    // ništa: bez greške, bez traga, u bezglavom poslu. Stoji uz LIVE i jednako
    // IZVAN `if (!draft)` — skica nije zaobilaznica, samo odgoda istog stanja.
    if (w.voterReminder24h && !canUseAutoReminders(entitlement)) {
      return { success: false, error: "voterReminderLocked" };
    }

    // Obavijesti o izlaznosti — treći Pro prekidač, ista zaštita na istom mjestu.
    // Vlastito pravilo, ne canUseAutoReminders: dva odvojena stupca i dva
    // odvojena prekidača ne smiju dijeliti jednu zaštitu, inače promjena tiera za
    // jedan tiho pomakne i drugi.
    if (w.adminTurnoutReminder && !canUseAdminTurnout(entitlement)) {
      return { success: false, error: "adminTurnoutLocked" };
    }

    const election = await prisma.election.create({
      data: {
        title: w.title,
        description: w.description || null,
        electionType: w.electionType,
        votingType: w.votingType,
        status,
        startsAt,
        endsAt,
        resultsMode: w.liveResults ? "LIVE" : "AFTER_CLOSE",
        // Jedini pisač ovog stupca u cijelom kodu. Bez njega je /results/[id]
        // nedohvatljiv za svaki izbor koji postoji (duplicateElection samo
        // prepisuje zadanu vrijednost izvornika). Nije Pro — javna stranica
        // rezultata je besplatna na svakom planu.
        resultsVisible: w.publicResults,
        allowAbstain: w.allowAbstain,
        quorumThreshold: w.quorumThreshold,
        adminTurnoutReminder: w.adminTurnoutReminder,
        voterReminder24h: w.voterReminder24h,
        organizationId,
        createdById: admin.id,
        options: {
          create: w.candidates.map((c, i) => ({
            text: c.name,
            description: c.role || null,
            orderIndex: i,
          })),
        },
        voters: { create: voters.map(toVoterFields) },
      },
      select: { id: true },
    });

    // Novi zakazani startsAt može prethoditi spremljenom roku metle — jedini
    // prolaz kojem kašnjenje mora ostati na razini pinga (sweep-gate D4).
    // Nacrti i rezervirani datumi ne pridonose ništa, pa se za njih ne briše.
    // Nikad ne baca (guta greške) — stvoreni izbori se ne prijavljuju kao pad.
    if (status === "SCHEDULED") await clearSweepGate();

    return { success: true, data: { id: election.id } };
  } catch {
    return { success: false, error: "failed" };
  }
}
