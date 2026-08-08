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
