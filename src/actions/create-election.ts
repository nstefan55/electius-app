"use server";

import { refresh } from "next/cache";
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
  type Entitlement,
} from "@/lib/entitlements";
import { resolveEntitlement } from "@/lib/services/entitlement.service";
import { clearSweepGate } from "@/lib/services/sweep-gate";
import {
  EDITABLE_STATUSES,
  zonedWallClockToInstant,
} from "@/lib/elections-view";

// Election creation wizard (all-elections phase 2). Two actions, each with two
// modes: createElection and updateElection (wizard edit mode), each a full save
// (step 5) or a draft save (top-bar link). Both org-scoped through
// requireSession(); the only client-supplied id is the one being edited, and
// its WHERE carries the organization.
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

// Parsiranje, sprega, raspored i status — isto pravilo za stvaranje i uređivanje
// (invarijanta #5). Vraća sve što upis treba, ili kod odbijanja.
function prepareWizard(input: unknown, draft: boolean) {
  const parsed = wizardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" } as const;
  const w = parsed.data;

  // Type/method coupling (spec: survey → multi only, quick poll → single only).
  // The UI enforces it too, but the action is the trust boundary.
  if (
    (w.electionType === "SURVEY" && w.votingType !== "MULTI_CHOICE") ||
    (w.electionType === "POLL" && w.votingType !== "SINGLE_CHOICE")
  ) {
    return { ok: false, error: "coupling" } as const;
  }

  // Zidni sat iz čarobnjaka → stvarni trenutak u zoni izbora. Oba stupca sada
  // dijele isto sidro kao `now` niže, pa se razlika startsAt/endsAt više ne
  // može iskriviti (a s njom ni "nije zakazano" sentinela).
  const startAt = zonedWallClockToInstant(w.startAt);
  const closeAt = zonedWallClockToInstant(w.closeAt);

  // Zakazano = zakazani način I upisan početak. Zakazani način s praznim
  // početkom sprema se kao skica: izbrisan datum vraća zakazane izbore u DRAFT
  // (pravilo uređivanja, 2026-09-26), umjesto da blokira spremanje. Neispravan
  // (a ne prazan) datum i dalje je greška — ne smije se tiho pretvoriti u skicu.
  const scheduled = w.startMode === "scheduled" && w.startAt !== "";
  if (scheduled && !startAt) return { ok: false, error: "schedule" } as const;

  if (!draft) {
    if (w.candidates.length < 2) return { ok: false, error: "candidates" } as const;
    if (scheduled) {
      if (!startAt || !closeAt || closeAt <= startAt) {
        return { ok: false, error: "schedule" } as const;
      }
    } else if (closeAt && closeAt <= new Date()) {
      return { ok: false, error: "schedule" } as const;
    }
  }

  // Manual start stays DRAFT (admin opens voting later); a scheduled full
  // save WITH a start date is SCHEDULED. Drafts are always DRAFT regardless of
  // start mode. Isto pravilo vrijedi i za uređivanje: DRAFT ostaje DRAFT dok ne
  // dobije datum, SCHEDULED se vraća u DRAFT na "Spremi kao skicu" ili bez datuma.
  const status: "SCHEDULED" | "DRAFT" = !draft && scheduled ? "SCHEDULED" : "DRAFT";

  // endsAt/startsAt are NOT NULL in the schema — DRAFT rows carry placeholder
  // dates and render "Not scheduled" (established phase-1 display rule).
  const now = new Date();
  const startsAt = scheduled && startAt ? startAt : now;
  const endsAt = closeAt ?? startsAt;

  // One row per unique email — @@unique([email, electionId]) would reject the
  // whole nested create on a duplicate.
  const voters = dedupeVoterRows(w.voters);

  return {
    ok: true as const,
    status,
    voters,
    candidates: w.candidates.map((c, i) => ({
      text: c.name,
      description: c.role || null,
      orderIndex: i,
    })),
    fields: {
      title: w.title,
      description: w.description || null,
      electionType: w.electionType,
      votingType: w.votingType,
      status,
      startsAt,
      endsAt,
      resultsMode: w.liveResults ? ("LIVE" as const) : ("AFTER_CLOSE" as const),
      // Jedini pisač ovog stupca u cijelom kodu (stvaranje i uređivanje dijele
      // ovu liniju). Bez njega je /results/[id] nedohvatljiv za svaki izbor koji
      // postoji (duplicateElection samo prepisuje zadanu vrijednost izvornika).
      // Nije Pro — javna stranica rezultata je besplatna na svakom planu.
      resultsVisible: w.publicResults,
      allowAbstain: w.allowAbstain,
      quorumThreshold: w.quorumThreshold,
      adminTurnoutReminder: w.adminTurnoutReminder,
      voterReminder24h: w.voterReminder24h,
    },
    w,
  };
}

// Zaštite plana — iste za stvaranje i uređivanje, i obje IZVAN `if (!draft)`:
// skica nije zaobilaznica, samo odgoda istog stanja. null = propušteno.
function planRefusal(
  entitlement: Entitlement,
  w: WizardPayload,
  voterCount: number,
): CreateResult | null {
  // Granica birača (§4). Broji se popis NAKON deduplikacije — to je broj
  // redaka koji bi doista nastali. Provjera stoji prije ijednog upisa, pa
  // odbijanje ne ostavlja ni izbore ni pola popisa.
  const cap = voterCap(entitlement);
  if (voterCount > cap) {
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

  return null;
}

// Izbori nisu (više) DRAFT/SCHEDULED, ne postoje ili su tuđi — sve tri grane
// daju isti odgovor, pa radnja nije proročište postojanja (invarijanta #3).
class NotEditable extends Error {}

export async function createElection(
  input: unknown,
  draft = false,
): Promise<CreateResult> {
  const p = prepareWizard(input, draft);
  if (!p.ok) return { success: false, error: p.error };

  try {
    const { organizationId, user } = await requireSession();
    const admin = await prisma.user.findUnique({
      where: { email: user.email },
      select: { id: true },
    });
    if (!admin) return { success: false, error: "failed" };

    // electionId je null: izbori još ne postoje, pa se pravo može razriješiti
    // samo na razini organizacije — točno redoslijed oko kojeg je resolver
    // napisan.
    const entitlement = await resolveEntitlement(null, organizationId);
    const refused = planRefusal(entitlement, p.w, p.voters.length);
    if (refused) return refused;

    const election = await prisma.election.create({
      data: {
        ...p.fields,
        organizationId,
        createdById: admin.id,
        options: { create: p.candidates },
        voters: { create: p.voters.map(toVoterFields) },
      },
      select: { id: true },
    });

    // Novi zakazani startsAt može prethoditi spremljenom roku metle — jedini
    // prolaz kojem kašnjenje mora ostati na razini pinga (sweep-gate D4).
    // Nacrti i rezervirani datumi ne pridonose ništa, pa se za njih ne briše.
    // Nikad ne baca (guta greške) — stvoreni izbori se ne prijavljuju kao pad.
    if (p.status === "SCHEDULED") await clearSweepGate();

    return { success: true, data: { id: election.id } };
  } catch {
    return { success: false, error: "failed" };
  }
}

// Način uređivanja čarobnjaka. Isti payload i ista pravila kao createElection;
// razlika je samo upis: izbori se ažuriraju, a kandidati i birači ZAMJENJUJU.
// To je sigurno jer uređivanje postoji samo prije objave — tokeni se kuju tek
// pri pokretanju, pa brisanje birača ne opoziva nijednu poslanu poveznicu.
export async function updateElection(
  id: unknown,
  input: unknown,
  draft = false,
): Promise<CreateResult> {
  const electionId = z.string().min(1).max(64).safeParse(id);
  if (!electionId.success) return { success: false, error: "invalid" };
  const p = prepareWizard(input, draft);
  if (!p.ok) return { success: false, error: p.error };

  try {
    const { organizationId } = await requireSession();
    const entitlement = await resolveEntitlement(electionId.data, organizationId);
    const refused = planRefusal(entitlement, p.w, p.voters.length);
    if (refused) return refused;

    await prisma.$transaction(async (tx) => {
      // Prvi upis u transakciji zaključava redak izbora. Metla koja ih u istom
      // trenutku pokreće (SCHEDULED → ACTIVE) čeka ovu transakciju ili je već
      // gotova — u drugom slučaju status više nije u EDITABLE_STATUSES, broj je 0 i
      // ništa niže se ne izvodi. Broj JEST provjera, kao u startElection.
      const { count } = await tx.election.updateMany({
        where: {
          id: electionId.data,
          organizationId,
          status: { in: [...EDITABLE_STATUSES] },
        },
        data: p.fields,
      });
      if (count === 0) throw new NotEditable();

      await tx.voteOption.deleteMany({ where: { electionId: electionId.data } });
      await tx.voteOption.createMany({
        data: p.candidates.map((c) => ({ ...c, electionId: electionId.data })),
      });
      await tx.voter.deleteMany({ where: { electionId: electionId.data } });
      await tx.voter.createMany({
        data: p.voters.map((v) => ({
          ...toVoterFields(v),
          electionId: electionId.data,
        })),
      });
    });

    // Isto kao pri stvaranju: novi zakazani početak može prethoditi roku metle.
    // SCHEDULED → DRAFT ne briše ništa — ostaje rani rok, a prerano buđenje je
    // bezopasno (sweep-gate D3: kasni najviše TTL, nikad zauvijek).
    if (p.status === "SCHEDULED") await clearSweepGate();

    // Naslov i status crta zajednički [id] layout, a klijentska navigacija s
    // /edit na pregled ga ne ponovno iscrtava. refresh() u odgovoru radnje
    // osvježi cijelo stablo prije navigacije — router.refresh() nakon push()
    // bi, zabilježeno u čarobnjaku, otkazao navigaciju.
    refresh();

    return { success: true, data: { id: electionId.data } };
  } catch (e) {
    return {
      success: false,
      error: e instanceof NotEditable ? "invalidStatus" : "failed",
    };
  }
}
