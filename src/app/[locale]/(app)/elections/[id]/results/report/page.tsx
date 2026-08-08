import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/require-session";
import {
  getElectionDetail,
  getElectionOverview,
  getElectionResults,
} from "@/lib/db/elections";
import { resultsDetailAccess } from "@/lib/elections-view";
import { exportFilename } from "@/lib/csv";
import { REPORT_SUFFIX } from "@/lib/report-export";
import { resolveExportLocale } from "@/lib/voter-export";
import { canBrandReports, canUpgrade } from "@/lib/entitlements";
import { resolveEntitlement } from "@/lib/services/entitlement.service";
import { upgradeHref } from "@/lib/upgrade-context";
import { Link } from "@/i18n/navigation";
import { ElectionReport } from "@/components/elections/election-report";

// Pregled PDF izvještaja (election-results-pdf-report-spec).
//
// Dva puta do istog dokumenta, oba kroz OVAJ list i @media print CSS:
//   1. gumb Ispis — window.print(), ime datoteke bira preglednik (predlaže ga
//      iz naslova stranice, vidi generateMetadata),
//   2. gumb Preuzmi — /api/elections/[id]/report/pdf, gdje bezglavi Chromium
//      otvara upravo ovu stranicu (election-report-storage-spec).
// Zato ovdje nema drugog predloška: promjena lista mijenja oba puta.
//
// Ranije zabilježene zamjerke Puppeteeru više ne stoje: kolačić sesije se
// prosljeđuje (pdf.service), a granica izvođenja je 300 s na svim Vercel
// planovima, ne 10 s.
//
// Statusna zaštita: ista `resultsDetailAccess` kao stranica rezultata, uz jednu
// razliku — zapečaćeni izbori ovdje daju 404, ne objašnjenje. Administratoru se
// razlog kaže na stranici rezultata; izvještaj nema što objašnjavati.
// Ruta se čuva sama: zaštita stranice rezultata ne seže do nje.

// REPORT_SUFFIX je isti izvor koji koristi preuzimanje — naslov stranice i ime
// spremljene datoteke ne smiju se razići.

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
    title: exportFilename(
      election.name,
      REPORT_SUFFIX[resolveExportLocale(locale)],
      new Date(),
    ),
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

  // "live" znači da glasanje još traje — jedina razlika koju list treba znati.
  const preliminary = access === "live";

  // notInvited samo kad zatreba: getElectionOverview je cache()-omotan i već
  // vraća isti broj koji čitaju kartice pregleda, pa izvještaj ne može reći
  // drugu brojku od zaslona. Zatvoreni izbori ovaj upit ne plaćaju.
  const overview = preliminary
    ? await getElectionOverview(id, organizationId)
    : null;

  // Zaštita logotipa (§5). Pravo se traži za IZBORE, ne za gledatelja: kad
  // stigne kupnja pojedinog izbora, kupljeni izbor nosi logotip i na Free
  // organizaciji. Na MVP-u su ta dva odgovora uvijek ista, pa to ne košta ništa.
  // Komponenta se ne mijenja — na null već crta Electius oznaku, i zato je ovo
  // jedna linija. Spremljeni PDF zadržava brendiranje s kojim je nastao: to je
  // zapis o izborima, a ne živi prikaz pretplate.
  const entitlement = await resolveEntitlement(id, organizationId);

  // Na Free planu je logotip organizacije ukras: prenese se, prikaže natrag u
  // postavkama i nigdje se ne upotrijebi — OVA stranica mu je jedini potrošač u
  // cijelom kodu. Red teksta na mjestu neuspjeha je ono što je nedostajalo.
  //
  // ⚠ print:hidden je uvjet, ne stil. Tijelo izvještaja JEST ispisani dokument i
  // kroz njega bezglavi Chromium radi spremljeni PDF — ponuda unutar tijela
  // otisnula bi se u zapis koji organizacija čuva. Zato stoji izvan lista i
  // nestaje pod ispisom.
  const brandingUpsell = canUpgrade(entitlement) && !canBrandReports(entitlement);
  const tu = await getTranslations("dashboard.upgrade");

  return (
    <>
      {brandingUpsell && (
        <div className="mb-5 rounded-md border-l-[3px] border-brand-500 bg-brand-50 px-4 py-3 text-[0.8125rem] leading-relaxed text-neutral-800 print:hidden">
          {tu("gates.brandedReports")}{" "}
          <Link
            href={upgradeHref("brandedReports")}
            className="font-semibold text-brand-700 underline underline-offset-2"
          >
            {tu("learnMore")}
          </Link>
        </div>
      )}
    <ElectionReport
      electionId={id}
      title={election.name}
      orgName={user.organization}
      orgLogoUrl={canBrandReports(entitlement) ? user.organizationLogo : null}
      quorumThreshold={results.quorumThreshold}
      voters={results.voters}
      votesCast={results.votesCast}
      options={results.options}
      generatedAt={new Date()}
      locale={await getLocale()}
      sealed={results.sealed}
      preliminary={preliminary}
      opens={results.opens}
      notInvited={overview?.notInvited ?? 0}
    />
    </>
  );
}
