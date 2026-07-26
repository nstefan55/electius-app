import { requireSession } from "@/lib/auth/require-session";
import { getVoterRosterForExport } from "@/lib/db/elections";
import { csvFilename, csvResponse, delimiterFor } from "@/lib/csv";
import {
  buildVoterCsv,
  resolveExportLocale,
  voterExportLabels,
} from "@/lib/voter-export";

// Preuzimanje popisa birača. Route handler jer preuzimanje treba
// Content-Disposition, a server akcije ne mogu postaviti zaglavlja.
// Jezik stiže kao query param — /api/* je izvan [locale] segmenta.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Ista zaštita kao svaka admin površina.
  const { organizationId } = await requireSession();
  const { id } = await params;

  const election = await getVoterRosterForExport(id, organizationId);
  // Nepostojeći i tuđi id daju isti 404 — bez potvrde da izbor postoji.
  if (!election) return new Response(null, { status: 404 });

  const locale = resolveExportLocale(
    new URL(request.url).searchParams.get("locale"),
  );
  const labels = voterExportLabels(locale);

  return csvResponse(
    buildVoterCsv(election.voters, labels, delimiterFor(locale)),
    csvFilename(election.title, labels.fileSuffix, new Date()),
  );
}
