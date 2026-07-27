import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Lock } from "lucide-react";
import { requireSession } from "@/lib/auth/require-session";
import { getElectionDetail, getElectionResults } from "@/lib/db/elections";
import { resultsDetailAccess } from "@/lib/elections-view";
import { ElectionResults } from "@/components/elections/election-results";

// Kanonska stranica rezultata — odredište redaka s /results i akcija s /archive.
// Čita isti cache()-omotani upit kao layout, pa dodatnog dohvaćanja nema; autorizaciju
// po organizaciji layout je već obavio (križni id → notFound prije ovoga).
//
// Statusna zaštita (election-results-id-phase-1-spec):
//   CLOSED · ARCHIVED · ACTIVE+LIVE → zbroj
//   ACTIVE + AFTER_CLOSE            → zapečaćeno, NE 404 — administrator vlasnik
//                                     mora znati zašto je prazno i kada se puni
//   DRAFT · SCHEDULED               → notFound(), listića još nema
export default async function ElectionResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, organizationId } = await requireSession();
  const election = await getElectionDetail(id, organizationId);
  if (!election) notFound();

  const access = resultsDetailAccess(election);
  if (!access) notFound();
  if (access === "sealed") return <SealedNotice title={election.name} />;

  // Drugi org-scoped upit uz getElectionDetail; oba su cache()-omotana.
  const results = await getElectionResults(id, organizationId);
  if (!results) notFound();

  return (
    <ElectionResults
      orgName={user.organization}
      electionType={results.electionType}
      votingType={results.votingType}
      quorumThreshold={results.quorumThreshold}
      opens={results.opens}
      closes={results.closes}
      voters={results.voters}
      votesCast={results.votesCast}
      options={results.options}
      days={results.days}
      locale={await getLocale()}
    />
  );
}

// Isti ključevi kao modal na /results — jedno objašnjenje, dva mjesta prikaza.
async function SealedNotice({ title }: { title: string }) {
  const t = await getTranslations("dashboard.resultsPage");

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning-50 text-warning-700">
          <Lock className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-xl font-semibold text-neutral-800">
            {t("sealedTitle")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">
            {t("sealedBody", { title })}
          </p>
        </div>
      </div>
    </section>
  );
}
