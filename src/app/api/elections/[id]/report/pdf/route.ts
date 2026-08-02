import { requireSession } from "@/lib/auth/require-session";
import { prisma } from "@/lib/prisma";
import { getElectionDetail, getStoredReport } from "@/lib/db/elections";
import { resultsDetailAccess } from "@/lib/elections-view";
import { resolveExportLocale } from "@/lib/voter-export";
import {
  canServeStored,
  isStorable,
  reportFilename,
  reportObjectKey,
  shouldStore,
} from "@/lib/report-export";
import { renderReportPdf } from "@/lib/services/pdf.service";
import { getObject, putObject } from "@/lib/services/storage.service";
import { checkRateLimit, clientIp, retryAfterSeconds } from "@/lib/rate-limit";

// Preuzimanje PDF izvještaja (election-report-storage-spec §5).
//
// Route handler jer preuzimanje JEST svoje zaglavlje (Content-Type,
// Content-Disposition), a server akcije ih ne mogu postaviti. Jezik stiže kao
// query param — /api/* je izvan [locale] segmenta, pa ovdje nema next-intl
// konteksta.
//
// Brzi put: spremljen objekt na istom jeziku se poslužuje bez ijednog
// pokretanja preglednika.

// Iscrtavanje pokreće Chromium; Vercelova granica je 300 s na svim planovima.
export const maxDuration = 300;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Ista zaštita kao svaka admin površina.
  const { user, organizationId } = await requireSession();
  const { id } = await params;

  // Svaki render pokreće preglednik, pa i brzi put troši kvotu (§10).
  // Ključ je IP + korisnik; sesija nosi e-poštu, koja je jedinstvena po računu.
  const limit = await checkRateLimit(
    "reportRender",
    `${clientIp(request.headers)}:${user.email}`,
  );
  if (!limit.success) {
    return Response.json(
      { code: "RATE_LIMITED" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds(limit.reset)) },
      },
    );
  }

  // Isti cache()-omotani upit koji čita i stranica pregleda.
  const election = await getElectionDetail(id, organizationId);
  // Nepostojeći i tuđi id daju isti goli 404 — bez potvrde da izbor postoji.
  if (!election) return new Response(null, { status: 404 });

  // Zapečaćeni izbori: 404, ne objašnjenje. Razlog administrator dobiva na
  // stranici rezultata; ruta nema što objašnjavati. Ova ruta, a ne sakriven
  // gumb, jest granica.
  const access = resultsDetailAccess(election);
  if (!access || access === "sealed") return new Response(null, { status: 404 });

  const locale = resolveExportLocale(
    new URL(request.url).searchParams.get("locale"),
  );
  const storable = isStorable(access);
  const stored = await getStoredReport(id, organizationId);
  if (!stored) return new Response(null, { status: 404 });

  const filename = reportFilename(election.name, locale, new Date());

  if (
    canServeStored({
      storable,
      reportKey: stored.reportKey,
      reportLocale: stored.reportLocale,
      locale,
    })
  ) {
    // Tok, ne međuspremnik: spremljeni PDF nikad ne uđe cijeli u memoriju.
    const object = await getObject("private", stored.reportKey!).catch(
      (error: unknown) => {
        console.error("[report] R2 GET failed", { id, error });
        return null;
      },
    );
    if (object?.body) return pdfResponse(object.body, filename);
    // Ključ pokazuje u prazno — pada na iscrtavanje umjesto da vrati grešku.
    console.error("[report] stored object missing", { id, key: stored.reportKey });
  }

  let pdf: Uint8Array<ArrayBuffer>;
  try {
    pdf = await renderReportPdf({
      // Isti list koji administrator vidi u pregledu i sam ispisuje.
      path: `/${locale}/elections/${id}/results/report`,
      cookieHeader: request.headers.get("cookie") ?? "",
    });
  } catch (error) {
    console.error("[report] render failed", { id, error });
    return new Response(null, { status: 500 });
  }

  if (shouldStore({ storable, reportKey: stored.reportKey })) {
    const key = reportObjectKey(id);
    try {
      // Prvo objekt, pa stupac: ključ se nikad ne zapisuje za datoteku koje
      // nema. Obrnuti redoslijed ostavlja bazu koja pokazuje u prazno.
      await putObject("private", key, pdf, "application/pdf");
      await prisma.election.update({
        where: { id },
        data: {
          reportKey: key,
          reportGeneratedAt: new Date(),
          reportLocale: locale,
        },
      });
    } catch (error) {
      // Pohrana je najbolji trud, isporuka nije: administrator svejedno dobije
      // svoj PDF, stupci ostaju prazni i sljedeći klik pokušava ponovno.
      // Glasno, nikad progutano.
      console.error("[report] store failed", { id, key, error });
    }
  }

  return pdfResponse(pdf, filename);
}

function pdfResponse(body: BodyInit, filename: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      // Ime je slugificirano na ASCII (csv.ts), pa RFC 5987 filename* ne treba.
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Zbroj glasova nije za međuspremnike.
      "Cache-Control": "no-store",
    },
  });
}
