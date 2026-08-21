import "server-only";

import { prisma } from "@/lib/prisma";
import { canUpgrade, type Entitlement } from "@/lib/entitlements";

// Razrješavanje prava (entitlement-enforcement-spec §3). Čista polovica —
// što koje pravo smije — živi u @/lib/entitlements i klijent je smije čitati.
// Ovdje je samo odgovor na pitanje "koje pravo vrijedi", jer za to treba baza.
//
// Nijedna zaštita ne čita isPro izravno. Ako ga pročita, redoslijed razrješavanja
// postoji na jednom mjestu manje nego što ima zaštita.

// Zastavica se čita ovdje, ne u (app)/settings/page.tsx (§1, prijenos iz Stripe
// faze 2). Zadano false: odsutnost i tipfeler znače "svi su Pro" — pravno
// sigurna strana dok naplata nije moguća, i ujedno prekidač provođenja. Dok je
// isključena, ovaj modul svima vraća pro, pa nijedna granica ne odbija nikoga.
export const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";

/**
 * Pravo koje vrijedi za `electionId` u organizaciji `organizationId`.
 *
 * Redoslijed je nepromjenjiv i ne smije se razlikovati po pozivnom mjestu:
 *
 *   > kupnja pojedinog izbora → isPro → Free
 *
 * `electionId` je namjerno nullable: čarobnjak razrješava pravo PRIJE nego što
 * izbori postoje, pa tada može vidjeti samo stanje organizacije. To nije
 * ograničenje koje treba zaobići, nego upravo redoslijed oko kojeg je
 * pay-per-election projektiran. Ostaje nullable iako na MVP-u nitko ne koristi
 * granu kupnje — suziti ga kasnije znači ponovno otvarati svaku zaštitu.
 *
 * ponytail: jedan upit po zaštićenoj radnji. Nazivnik je organizacija, ne
 * sesija — metla arhive nema sesiju, a i pečat mora vrijediti za vlasnika
 * zapisa, a ne za administratora koji je slučajno kliknuo.
 */
export async function resolveEntitlement(
  // Nekorišten do faze kupnje pojedinog izbora — namjerno, vidi gore.
  electionId: string | null,
  organizationId: string,
): Promise<Entitlement> {
  if (!BILLING_ENABLED) return { kind: "pro" };

  // 1. Kupnja pojedinog izbora — izvan MVP-a, tablica ne postoji. Grana se
  //    dodaje ovdje i nigdje drugdje (§3).

  // 2. isPro. Projekciju piše isključivo billing.service, i to cijeloj
  //    organizaciji odjednom, pa je bilo koji administrator s oznakom dovoljan
  //    odgovor za organizaciju.
  const pro = await prisma.user.findFirst({
    where: { organizationId, isPro: true },
    select: { id: true },
  });

  // 3. Free.
  return pro ? { kind: "pro" } : { kind: "free" };
}

/**
 * Smije li ljuska nositi pilulu PRO.
 *
 * Dvije zamke, zato pravilo živi ovdje a ne na pozivnom mjestu:
 *
 * 1. Ne čita se `User.isPro`. Dok je naplata isključena svaka organizacija ima
 *    Pro ponašanje, a `isPro` je svugdje false — pilula bi bila skrivena upravo
 *    na računima koji Pro DRŽE, i lagala bi u stanju u kojem produkcija jest.
 * 2. Ali ni sam razrješivač nije odgovor: s isključenom naplatom vraća pro
 *    SVIMA, pa bi pilula sjedila na svakoj ljusci dok /settings istodobno
 *    prikazuje prelaunch stanje koje namjerno ne tvrdi nikakav plan. Dvije
 *    površine, jedan račun, dvije tvrdnje.
 *
 * Zato: oznaka se pojavljuje tek kad je naplata stvarna. Danas dakle nikad —
 * ljuska nosi Beta i ništa drugo. `BILLING_ENABLED ? user.isPro : true` na
 * pozivnom mjestu izgleda kao isto, a tvrdi redoslijed razrješavanja umjesto da
 * ga pita, i ustaja u dan kad krene kupnja pojedinog izbora.
 */
export async function showProBadge(organizationId: string): Promise<boolean> {
  if (!BILLING_ENABLED) return false;
  return (await resolveEntitlement(null, organizationId)).kind !== "free";
}

/**
 * Smije li ljuska nositi gumb „Nadogradi".
 *
 * Isti IZRAZ kojim se /upgrade čuva, i to je cijela poanta: vidljivost gumba i
 * dostupnost stranice moraju biti jedno pravilo, inače nastane gumb koji vodi u
 * preusmjeravanje. `canUpgrade` je pitanje o PONUDI — postoji li plan iznad
 * ovoga — a ne o zaključanosti pojedine značajke.
 *
 * Namjerno se NE čita `user.showPro` s ljuske: showProBadge vraća false svima
 * dok je naplata isključena, pa bi `!showPro` ponudio nadogradnju baš svakom
 * računu, uključujući one koje /upgrade istog trena odbije.
 *
 * BILLING_ENABLED se ovdje ne čita — razrješivač ga već kratko spaja i tada
 * svima vraća pro, pa gumba nema dok naplata ne postane stvarna.
 */
export async function showUpgradeCta(organizationId: string): Promise<boolean> {
  return canUpgrade(await resolveEntitlement(null, organizationId));
}
