import { requireSession } from "@/lib/auth/require-session";
import { getElectionDetail, getElectionResults } from "@/lib/db/elections";
import { resultsDetailAccess } from "@/lib/elections-view";
import { csvFilename, csvResponse, delimiterFor } from "@/lib/csv";
import { resolveExportLocale } from "@/lib/voter-export";
import { buildResultsCsv, resultsExportLabels } from "@/lib/results-export";

// Preuzimanje zbroja glasova. Route handler jer preuzimanje treba
// Content-Disposition, a server akcije ne mogu postaviti zaglavlja.
// Jezik stiže kao query param — /api/* je izvan [locale] segmenta.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Ista zaštita kao svaka admin površina.
  const { user, organizationId } = await requireSession();
  const { id } = await params;

  // Isti cache()-omotani upiti koje čita i stranica rezultata.
  const election = await getElectionDetail(id, organizationId);
  // Nepostojeći i tuđi id daju isti 404 — bez potvrde da izbor postoji.
  if (!election) return new Response(null, { status: 404 });

  // Zapečaćeni izbori ovdje daju 404: datoteka sa zbrojem bila bi u suprotnosti
  // s obećanjem danim biračima. Ova ruta, a ne onemogućen gumb, jest granica.
  const access = resultsDetailAccess(election);
  if (!access || access === "sealed") return new Response(null, { status: 404 });

  const results = await getElectionResults(id, organizationId);
  if (!results) return new Response(null, { status: 404 });

  const locale = resolveExportLocale(
    new URL(request.url).searchParams.get("locale"),
  );
  const labels = resultsExportLabels(locale);

  return csvResponse(
    buildResultsCsv(
      { ...results, orgName: user.organization, title: election.name },
      labels,
      delimiterFor(locale),
    ),
    csvFilename(election.name, labels.fileSuffix, new Date()),
  );
}
