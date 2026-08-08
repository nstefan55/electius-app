import { getArchivedElections } from "@/lib/db/elections";
import { requireSession } from "@/lib/auth/require-session";
import { canUpgrade } from "@/lib/entitlements";
import { resolveEntitlement } from "@/lib/services/entitlement.service";
import { ArchiveList } from "@/components/elections/archive-list";

// ARCHIVED-elections list — top-level sidebar section, NO detail route. Kartice
// funneliraju na /elections/[id]/results i /results/report. Nepaginirano, pa
// naslov, pretraga i lista žive u jednoj klijentskoj komponenti.
export default async function ArchivePage() {
  const { organizationId } = await requireSession();
  const elections = await getArchivedElections(organizationId);

  // Pravilo čuvanja se izriče, a ne prešućuje. Ovo obrće raniju odluku iz
  // elections-archived-phase-1, koja je odbila oznaku plana jer ništa nije
  // provodilo ograničenje — to je prestalo vrijediti kad je stigao
  // pruneExpiredArchives: obrezivanje je stvarno ponašanje, i bilo je nenajavljeno.
  // Izriče se PRAVILO ČUVANJA, ne granica broja arhiva — broj arhiva ništa ne kapira.
  const entitlement = await resolveEntitlement(null, organizationId);

  return (
    <ArchiveList
      elections={elections}
      freeRetention={canUpgrade(entitlement)}
    />
  );
}
