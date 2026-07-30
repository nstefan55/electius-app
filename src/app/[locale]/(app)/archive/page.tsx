import { getElectionsByStatus } from "@/lib/db/elections";
import { requireSession } from "@/lib/auth/require-session";
import { ArchiveList } from "@/components/elections/archive-list";

// ARCHIVED-elections list — top-level sidebar section, NO detail route. Inline row
// actions funnel to /elections/[id]/results. Nepaginirano, pa naslov, pretraga i
// lista žive u jednoj klijentskoj komponenti.
export default async function ArchivePage() {
  const { organizationId } = await requireSession();
  const elections = await getElectionsByStatus(organizationId, "ARCHIVED");
  return <ArchiveList elections={elections} />;
}
