import { getArchivedElections } from "@/lib/db/elections";
import { requireSession } from "@/lib/auth/require-session";
import { ArchiveList } from "@/components/elections/archive-list";

// ARCHIVED-elections list — top-level sidebar section, NO detail route. Kartice
// funneliraju na /elections/[id]/results i /results/report. Nepaginirano, pa
// naslov, pretraga i lista žive u jednoj klijentskoj komponenti.
export default async function ArchivePage() {
  const { organizationId } = await requireSession();
  const elections = await getArchivedElections(organizationId);
  return <ArchiveList elections={elections} />;
}
