// Koja je značajka poslala administratora na /upgrade (pro-features-gating §5).
//
// Čisto preslikavanje: parametar iz URL-a → ključ kataloga za kontekstualno
// zaglavlje. Bez Prisme, bez env-a, bez `server-only` — zaštite ga zovu i s
// klijenta da izgrade href.
//
// Pet vrijednosti za šest mjesta: obje granice birača (čarobnjakov korak 3 i
// popis birača) dijele `voterCap`, jer je zaštita ista i tekst bi bio isti.
//
// Nepoznata ili odsutna vrijednost pada na generičko zaglavlje, nikad na
// iznimku: poveznica se zalijepi, zapamti i prepisuje rukom, a stranica na koju
// se dolazi zbog kupnje ne smije se rušiti na tipfeler.

export const UPGRADE_FEATURES = [
  "liveResults",
  "voterReminder24h",
  "voterCap",
  "brandedReports",
  "archiveRetention",
] as const;

export type UpgradeFeature = (typeof UPGRADE_FEATURES)[number];
export type UpgradeContextKey = UpgradeFeature | "generic";

export function upgradeContextKey(
  param: string | string[] | undefined,
): UpgradeContextKey {
  // Ponovljeni parametar (?feature=a&feature=b) stiže kao polje — to nije
  // namjera nego smeće, pa ide na isto mjesto kao nepoznata vrijednost.
  if (typeof param !== "string") return "generic";
  return (UPGRADE_FEATURES as readonly string[]).includes(param)
    ? (param as UpgradeFeature)
    : "generic";
}

// Jedno mjesto koje gradi poveznicu, pa se parametar i preslikavanje iznad ne
// mogu razići: tip odbija vrijednost koja nema zaglavlje.
export const upgradeHref = (feature: UpgradeFeature) =>
  `/upgrade?feature=${feature}`;
