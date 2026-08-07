// Čiste odluke oko obrezivanja arhive (entitlement-enforcement-spec §6).
// Bez Prisme i bez R2 — isto kao report-export.ts, da se mogu testirati bez
// poslužitelja. Sama metla živi u services/archive.service.ts.
//
// Obrezuje se SAMO proofData. merkleRoot, electionData i spremljeni PDF ostaju
// zauvijek (D6): obećanje Free plana je "zapis arhive se čuva zauvijek, teret
// dokaza se obrezuje nakon 12 mjeseci". Zato ovdje nema ni R2 ni report* stupaca.

/**
 * Nadgrobni zapis koji zamjenjuje teret dokaza.
 *
 * proofData je NOT NULL, pa se stupac ne ništi — piše se ovo. `algorithm` i
 * `root` ostaju čitljivi namjerno: revizor i dalje vidi na što se zapis obvezao
 * i kako je stablo građeno, a obrezani se redak razlikuje od izbora arhiviranih
 * prije nego što je pečat uopće postojao. Metla je UPDATE, nikad DELETE.
 */
export interface ArchiveTombstone {
  pruned: true;
  prunedAt: string;
  algorithm: string;
  leafOrdering: string;
  root: string;
}

/**
 * Smije li se ovaj redak obrezati SADA.
 *
 * `expiresAt` se NE čita s retka — prosljeđuje se datum izveden iz prava koje
 * vrijedi u trenutku obrezivanja (archiveExpiresAt). Pečat zadržavanja je
 * jednosmjeran: stampArchiveRetention ga postavlja pri padu na Free, a nitko ga
 * ne briše pri nadogradnji, pa bi metla koja vjeruje pečatu obrezala teret
 * dokaza organizaciji koja plaća. Rušilačka radnja provjerava pravo u trenutku
 * kad ruši, nikad pečat koji je mjesecima ranije upisao drugi put kroz kod.
 */
export const shouldPrune = (expiresAt: Date | null, now: Date): boolean =>
  expiresAt !== null && expiresAt.getTime() <= now.getTime();

/**
 * Algoritam i poredak listova iz spremljenog tereta dokaza.
 *
 * Čita se s retka, ne iz današnjih konstanti: niz koji opisuje algoritam JEST
 * ugovor, pa upisati današnji na zapis zapečaćen po drugom pravilu znači
 * potpisati tvrdnju koja nije istinita. Konstante su samo zaštita ako polje
 * nedostaje.
 */
export function readProofMeta(
  proofData: unknown,
  fallback: { algorithm: string; leafOrdering: string },
): { algorithm: string; leafOrdering: string } {
  const p = (proofData ?? {}) as Record<string, unknown>;
  return {
    algorithm:
      typeof p.algorithm === "string" ? p.algorithm : fallback.algorithm,
    leafOrdering:
      typeof p.leafOrdering === "string"
        ? p.leafOrdering
        : fallback.leafOrdering,
  };
}

export function buildArchiveTombstone(input: {
  root: string;
  algorithm: string;
  leafOrdering: string;
  prunedAt: Date;
}): ArchiveTombstone {
  return {
    pruned: true,
    prunedAt: input.prunedAt.toISOString(),
    algorithm: input.algorithm,
    leafOrdering: input.leafOrdering,
    root: input.root,
  };
}
