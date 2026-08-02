import { requireSession } from "@/lib/auth/require-session";
import { getOrganizationExport } from "@/lib/db/organization";
import { buildOrganizationExport } from "@/lib/organization-export";
import { exportFilename } from "@/lib/csv";
import { resolveExportLocale } from "@/lib/voter-export";
import { checkRateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import hr from "../../../../../messages/hr.json";
import en from "../../../../../messages/en.json";

// Preuzimanje cjelovitog izvoza organizacije (GDPR čl. 20).
//
// Route handler jer preuzimanje JEST svoje zaglavlje (Content-Type,
// Content-Disposition), a server akcije ih ne mogu postaviti. Isti oblik kao
// izvoz popisa birača i rezultata.
//
// Tok podataka ide kroz ovu rutu, nikad kroz potpisani URL: potpisani URL je
// token na donositelja koji nadživi sesiju i ostaje u povijesti preglednika, u
// zapisima posredničkih poslužitelja i u porukama. Popis svih birača
// organizacije je zadnji teret koji to smije dobiti.
//
// `format` param namjerno ne postoji: ruta poslužuje JSON, a ZIP (§4) je
// blokiran na novoj ovisnosti. Kad stigne, dobiva svoj param bez promjene ove
// putanje.

const CATALOGS = { hr, en } as const;

export async function GET(request: Request) {
  // Ista zaštita kao svaka admin površina.
  const { user, organizationId } = await requireSession();

  // Ključ je račun, ne IP (§5). E-pošta je jedinstvena po korisniku, pa je to
  // isti identitet kao id.
  const limit = await checkRateLimit("export", user.email);
  if (!limit.success) {
    return Response.json(
      { code: "RATE_LIMITED" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds(limit.reset)) },
      },
    );
  }

  const source = await getOrganizationExport(organizationId, user.email);
  if (!source) return new Response(null, { status: 404 });

  const now = new Date();
  const payload = buildOrganizationExport(source, now);

  // Jezik utječe SAMO na ime datoteke — ključevi u dokumentu su stabilan
  // engleski. /api/* je izvan [locale] segmenta, pa katalog dolazi izravno.
  const locale = resolveExportLocale(
    new URL(request.url).searchParams.get("locale"),
  );
  const suffix = CATALOGS[locale].dashboard.settings.export.fileSuffix;
  const filename = `${exportFilename(source.organization.name, suffix, now)}.json`;

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // slugify jamči ASCII ime, pa RFC 5987 filename* nije potreban.
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Sadržaj su osobni podaci cijele organizacije — bez keširanja.
      "Cache-Control": "no-store",
    },
  });
}
