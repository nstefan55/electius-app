import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getPublicResultsElection } from "@/lib/db/elections";

// SCAFFOLD (routing Phase 4) — public results inside the voter chrome, GATED by
// election.resultsVisible (the load-bearing structural requirement here). The detailed
// results UI (charts, per-candidate bars, winner, turnout) is owned by the public-results
// spec and slots in behind this gate. Server component fetches directly (coding-standards).
export default async function PublicResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const election = await getPublicResultsElection(id);
  // Gate: missing election OR results not public → 404 (never leak an unpublished result).
  if (!election || !election.resultsVisible) notFound();

  const t = await getTranslations("voter.results");
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <h1 className="font-heading text-2xl font-semibold text-neutral-800">
        {election.title}
      </h1>
      <p className="text-sm text-neutral-600">{t("subtitle")}</p>
    </div>
  );
}
