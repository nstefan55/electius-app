import { requireSession } from "@/lib/auth/require-session";
import { getElectionsByStatus } from "@/lib/db/elections";
import { resultsRows } from "@/lib/elections-view";
import { ResultsOverviewList } from "@/components/elections/results-overview-list";

// Popis rezultata po izborima — ulazna točka iz bočne navigacije koja vodi na
// kanonski /elections/[id]/results (election-results-overview-phase-2-spec).
// Dohvaća sve izbore organizacije; resultsRows odlučuje koji pripadaju ovdje.
export default async function ResultsListPage() {
  const { organizationId } = await requireSession();
  const elections = await getElectionsByStatus(organizationId);
  return <ResultsOverviewList rows={resultsRows(elections)} />;
}
