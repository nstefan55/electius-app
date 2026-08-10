// Što smije koji entitlement. Namjerno bez `server-only`, bez Prisme, bez env-a
// i bez Stripe tipova — klijentska komponenta mora moći prikazati "42 od 50 birača".
// Redoslijed razrješavanja (resolveEntitlement) je server-only i pripada fazi 2.

export const FREE_VOTER_CAP = 50;
export const PRO_VOTER_CAP = 500;

export type Entitlement =
  | { kind: "free" }
  | { kind: "pro" }
  // Pay-per-election je izvan MVP-a, ali varijanta postoji od prvog dana: kad
  // stigne, dodaje se grana u resolveru, a ne tip. Bez nje bi svaki switch iz
  // faze 2 naknadno postao neiscrpan.
  | { kind: "purchased"; voterCap: number };

export function voterCap(e: Entitlement): number {
  switch (e.kind) {
    case "free":
      return FREE_VOTER_CAP;
    case "pro":
      return PRO_VOTER_CAP;
    // Kupljena granica, nikad oznaka tiera.
    case "purchased":
      return e.voterCap;
  }
}

// Od kojeg udjela granice se prikazuje tiha najava "42 od 50" (§8). Jedno
// pravilo, dva zaslona — čarobnjakov korak 3 i popis birača — jer otkriti
// granicu tek pri odbijanju s 300 pripremljenih redaka je najskuplji trenutak.
export const CAP_HINT_THRESHOLD = 0.8;

export const nearCap = (used: number, cap: number): boolean =>
  cap > 0 && used >= cap * CAP_HINT_THRESHOLD;

export function canBrandReports(e: Entitlement): boolean {
  switch (e.kind) {
    case "free":
      return false;
    case "pro":
    case "purchased":
      return true;
  }
}

// Rezultati uživo tijekom glasovanja (resultsMode = LIVE) — oglašeno kao Pro
// ("Rezultati uživo tijekom glasovanja — pratite rast izlaznosti u stvarnom
// vremenu"). Bez LIVE-a administrator zbroj vidi tek na zatvaranju; izlaznost
// se prati uvijek i ni na jednom tieru nije skrivena.
export function canUseLiveResults(e: Entitlement): boolean {
  switch (e.kind) {
    case "free":
      return false;
    case "pro":
    case "purchased":
      return true;
  }
}

// Automatski podsjetnici biračima 24 h prije zatvaranja — oglašeno kao Pro.
// Imenovano pravilo, a ne `kind === "free"` na pozivnom mjestu, jer isti uvjet
// čitaju tri strane: čarobnjak (zaključan prekidač), createElection (granica
// povjerenja) i metla (šalje ili preskače). Tri kopije razišle bi se prvom
// promjenom tiera.
export function canUseAutoReminders(e: Entitlement): boolean {
  switch (e.kind) {
    case "free":
      return false;
    case "pro":
    case "purchased":
      return true;
  }
}

// Obavijesti administratoru o izlaznosti dok glasanje traje (email-delivery §4).
//
// VLASTITO pravilo, a ne ponovno korištenje canUseAutoReminders, iako ih cjenik
// prodaje istom rečenicom: to su dvije odvojeno uključive značajke s dva stupca i
// dva prekidača, pa bi dijeljena zaštita značila da promjena tiera za podsjetnike
// biračima tiho pomakne i ovo. Iscrpan switch čini dodavanje varijante pogreškom
// prevođenja umjesto propusne zadane grane.
export function canUseAdminTurnout(e: Entitlement): boolean {
  switch (e.kind) {
    case "free":
      return false;
    case "pro":
    case "purchased":
      return true;
  }
}

// Postoji li plan iznad ovoga — pitanje o PONUDI, ne o zaključanosti. Pro
// organizacija na 480 od 500 birača vidi istu najavu granice, ali ponuditi joj
// nadogradnju znači prodavati ono što već ima. Zato svaka poveznica na /upgrade
// visi o ovome, a ne o samoj granici.
export function canUpgrade(e: Entitlement): boolean {
  switch (e.kind) {
    case "free":
      return true;
    case "pro":
    case "purchased":
      return false;
  }
}

// Kalendarska godina, nikad 365 * 24 * 60 * 60 * 1000 — u prijelaznoj godini to
// pada dan ranije, a ništa to ne bi primijetilo jer expiresAt još nitko ne čita.
// Jedina izvedba tog pravila: archive.service.ts je imao vlastiti oneYearFrom i
// zvao ga je uz izravno čitanje createdBy.isPro. Spojeno kad je resolver stigao,
// pa pečat i metla sada računaju isti datum iz istog izvora (invarijanta #5).
export function archiveExpiresAt(e: Entitlement, sealedAt: Date): Date | null {
  switch (e.kind) {
    case "pro":
    case "purchased":
      return null;
    case "free": {
      const d = new Date(sealedAt);
      d.setFullYear(d.getFullYear() + 1);
      return d;
    }
  }
}
