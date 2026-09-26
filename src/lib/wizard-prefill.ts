import type { WizardData } from "@/components/elections/wizard/wizard-shared";
import type { ElectionForEdit } from "@/lib/db/elections";
import { instantToZonedWallClock } from "@/lib/elections-view";

// Spremljeni izbori → stanje čarobnjaka za način uređivanja. Obrat
// createElection-a: što ona iz čarobnjaka upiše u stupce, ovo iz stupaca vraća
// u čarobnjak. Računa se na poslužitelju i u klijent silazi gotovo.
//
// Samo `import type` iz komponente: wizard-shared je "use client", pa bi uvoz
// vrijednosti u poslužiteljski kod dao referencu klijenta, ne objekt.

type Schedule = Pick<WizardData, "startMode" | "startAt" | "closeAt">;

// Čarobnjak nema stupac za način pokretanja — createElection sprema samo status
// i dva datuma, pa se način izvodi natrag iz statusa (odluka 2026-09-26):
//   SCHEDULED → zakazano, s oba datuma
//   DRAFT     → ručno, bez početka. Skica NEMA datum pokretanja: dobiva ga tek
//               "Spremi promjene" sa zakazanim početkom, i tada postaje SCHEDULED.
//               Početak skice spremljene u zakazanom načinu namjerno se ne vraća.
//
// Pravilo "nema kraja" već postoji: endsAt <= startsAt znači rezervirani datum
// (isto što ekran prikazuje kao "Nije zakazano"), pa closeAt mora ostati "".
// Prošli kraj se NE briše — puni se, pa ga "Spremi promjene" odbije i vrati na
// korak 4, gdje ga administrator ispravi (izlaz iz slijepe ulice deadlinePassed).
export function prefillSchedule(
  e: Pick<ElectionForEdit, "status" | "startsAt" | "endsAt">,
): Schedule {
  return {
    startMode: e.status === "SCHEDULED" ? "scheduled" : "manual",
    startAt: e.status === "SCHEDULED" ? instantToZonedWallClock(e.startsAt) : "",
    closeAt: e.endsAt > e.startsAt ? instantToZonedWallClock(e.endsAt) : "",
  };
}

export function toWizardData(e: ElectionForEdit): WizardData {
  return {
    title: e.title,
    description: e.description ?? "",
    electionType: e.electionType,
    votingType: e.votingType,
    allowAbstain: e.allowAbstain,
    candidates: e.options.map((o) => ({
      name: o.text,
      role: o.description ?? undefined,
    })),
    // ponytail: bezimeni birač (samo stari seed ga ima — i čarobnjak i
    // naknadno dodavanje traže ime) dobiva adresu kao ime, jer voterRowSchema
    // traži ime i inače bi spremanje palo na cijelom popisu.
    voters: e.voters.map((v) => ({
      name: [v.firstName, v.lastName].filter(Boolean).join(" ") || v.email,
      email: v.email,
    })),
    ...prefillSchedule(e),
    liveResults: e.resultsMode === "LIVE",
    publicResults: e.resultsVisible,
    quorum: e.quorumThreshold !== null,
    // 50 = zadana vrijednost čarobnjaka (INITIAL_WIZARD_DATA); ne uvozi se
    // jer je vrijednost iz "use client" modula.
    quorumPct: e.quorumThreshold ?? 50,
    adminTurnoutReminder: e.adminTurnoutReminder,
    voterReminder24h: e.voterReminder24h,
  };
}
