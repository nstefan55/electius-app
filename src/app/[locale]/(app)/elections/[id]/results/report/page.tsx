import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { requireSession } from "@/lib/auth/require-session";
import { getElectionDetail, getElectionResults } from "@/lib/db/elections";
import { resultsDetailAccess } from "@/lib/elections-view";
import { exportFilename } from "@/lib/csv";
import { ElectionReport } from "@/components/elections/election-report";

// Pregled PDF izvještaja (election-results-pdf-report-spec).
//
// Isporuka je ispis preglednika: gumb zove window.print(), a @media print skida
// svu ljusku i ostavlja sam list. Nema Puppeteera, nema paketa od 50 MB, nema
// granice od 10 s — i nema problema sa sesijom, jer bezglavi preglednik nema
// kolačić pa bi snimio zaslon prijave.
// ponytail: ime spremljene datoteke bira preglednik (predlaže ga iz naslova
// stranice, vidi generateMetadata). Kad arhiva zatraži PDF u R2, generator se
// dograđuje na gotov predložak — nije prepisivanje.
//
// Statusna zaštita: ista `resultsDetailAccess` kao stranica rezultata, uz jednu
// razliku — zapečaćeni izbori ovdje daju 404, ne objašnjenje. Administratoru se
// razlog kaže na stranici rezultata; izvještaj nema što objašnjavati.
// Ruta se čuva sama: zaštita stranice rezultata ne seže do nje.

const SUFFIX: Record<string, string> = { hr: "izvjestaj", en: "report" };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organizationId } = await requireSession();
  // Isti cache()-omotani upit koji čita i stranica — bez dodatnog dohvaćanja.
  const election = await getElectionDetail(id, organizationId);
  if (!election) return {};

  const locale = await getLocale();
  // Naslov stranice JEST ime datoteke: preglednik ga predlaže pri spremanju u
  // PDF. Bez nastavka — .pdf dodaje sam.
  return {
    title: exportFilename(election.name, SUFFIX[locale] ?? "report", new Date()),
  };
}

export default async function ElectionReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, organizationId } = await requireSession();
  const election = await getElectionDetail(id, organizationId);
  if (!election) notFound();

  const access = resultsDetailAccess(election);
  if (!access || access === "sealed") notFound();

  const results = await getElectionResults(id, organizationId);
  if (!results) notFound();

  return (
    <ElectionReport
      electionId={id}
      title={election.name}
      orgName={user.organization}
      quorumThreshold={results.quorumThreshold}
      voters={results.voters}
      votesCast={results.votesCast}
      options={results.options}
      generatedAt={new Date()}
      locale={await getLocale()}
      sealed={results.sealed}
    />
  );
}
