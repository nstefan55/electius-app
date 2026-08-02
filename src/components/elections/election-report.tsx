import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { ShieldCheck, Trophy } from "lucide-react";
import {
  elapsedParts,
  formatVotingDateTime,
  turnoutPct,
  voterCounts,
} from "@/lib/elections-view";
import {
  candidateInitials,
  quorumOutcome,
  rankCandidates,
  voterSharePct,
  winnerOutcome,
  type OptionTally,
} from "@/lib/results-view";
import { CONTACT_EMAIL } from "@/lib/urls";
import type { ArchiveSeal } from "@/lib/db/elections";

// List službenog izvještaja (dizajn: PDF Report Preview.dc.html).
// Poslužiteljska komponenta bez ijednog klijentskog dijela — sam list je ono što
// preglednik ispisuje u PDF, pa u njemu ne smije biti ničega interaktivnog.
//
// Nijedna brojka se ovdje ne računa: sve dolazi iz results-view.ts i
// elections-view.ts, istih funkcija koje čitaju stranica rezultata i CSV izvoz.
// Predložak koji sam računa postotak prva je greška koja razdvoji dva zaslona.

// Logotip organizacije ako je učitan, inače Electius znak — što je za Free
// razinu ionako točno.

export interface ElectionReportProps {
  electionId: string;
  title: string;
  orgName: string;
  orgLogoUrl: string | null;
  quorumThreshold: number | null;
  voters: number;
  votesCast: number;
  options: OptionTally[];
  generatedAt: Date;
  locale: string;
  sealed: ArchiveSeal | null;
  /** Glasanje još traje (access === "live"). Izvodi ga pozivatelj — komponenta
   *  ne zaključuje o pravima pristupa. */
  preliminary: boolean;
  /** Otvaranje glasanja (ISO) — mjeri proteklo vrijeme na privremenom listu. */
  opens: string;
  /** Birači sa statusom PENDING; hrani zajednički voterCounts. */
  notInvited: number;
}

export async function ElectionReport({
  electionId,
  title,
  orgName,
  orgLogoUrl,
  quorumThreshold,
  voters,
  votesCast,
  options,
  generatedAt,
  locale,
  sealed,
  preliminary,
  opens,
  notInvited,
}: ElectionReportProps) {
  const t = await getTranslations("dashboard.election.report");
  // Posuđuje iz namespacea rezultata: pobjednik, izjednačenje i udio moraju
  // glasiti IDENTIČNO na zaslonu i u izvještaju.
  const tr = await getTranslations("dashboard.election.results");

  const ranked = rankCandidates(options, votesCast);
  const outcome = winnerOutcome(ranked);
  // Pobjednička kartica pada dok glasanje traje, pa vodeći kandidat mora ući u
  // raspodjelu — inače bi ga list posve izostavio.
  const distribution = preliminary ? ranked : ranked.filter((c) => !c.isWinner);
  const quorum =
    quorumThreshold === null
      ? null
      : quorumOutcome(voters, votesCast, quorumThreshold);
  const nf = new Intl.NumberFormat(locale === "hr" ? "hr-HR" : "en-US");
  const turnout = turnoutPct(votesCast, voters);
  const stamp = formatVotingDateTime(generatedAt.toISOString(), locale);

  // Ocjena kvoruma je tvrdnja o ishodu: "nije postignut" usred glasanja znači
  // "još nije", a čita se kao presuda (D9). Prag se ispisuje, ocjena ne.
  const quorumState =
    quorum && !preliminary ? tr(quorum.met ? "quorumMet" : "quorumNotMet") : "";

  const turnoutRows = [
    { label: t("rowEligible"), value: nf.format(voters), tone: "" },
    { label: t("rowVotesCast"), value: nf.format(votesCast), tone: "" },
    {
      label: t("rowTurnout"),
      value: `${turnout}%`,
      tone: "text-brand-700",
    },
    ...(quorum
      ? [
          {
            label: t("rowQuorum"),
            value: preliminary
              ? `${quorum.requiredPct}%`
              : t("quorumValue", { pct: quorum.requiredPct, state: quorumState }),
            tone: preliminary
              ? ""
              : quorum.met
                ? "text-success-700"
                : "text-error-700",
          },
        ]
      : []),
  ];

  // Iste četiri brojke koje čitaju kartice pregleda i sažetak popisa birača —
  // jedna derivacija, pa se tri zaslona ne mogu razići.
  const counts = voterCounts({ total: voters, notInvited, voted: votesCast });
  const figures = [
    { label: t("statTotal"), value: counts.total },
    { label: t("statInvited"), value: counts.invited },
    { label: t("statVoted"), value: counts.voted },
    { label: t("statNotVoted"), value: counts.pending },
  ];

  // Proteklo, ne preostalo (D10): mjeri tempo sudjelovanja, a odbrojavanje do
  // kraja već stoji na pregledu izbora. Sati se ispisuju uvijek, dani samo kad
  // ih ima — "0 dana 4 sata" je šum.
  const elapsed = elapsedParts(opens, generatedAt.getTime());
  const duration = [
    elapsed.days > 0 ? t("durationDays", { count: elapsed.days }) : null,
    t("durationHours", { count: elapsed.hours }),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className="mx-auto w-full max-w-205 rounded-md border border-[#E2E6EC] bg-white px-8 py-10 shadow-md sm:px-15 sm:py-14 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      {/* Zaglavlje */}
      <header className="flex items-start justify-between gap-8">
        <div className="min-w-0">
          <div className="text-xs font-bold tracking-[0.18em] text-brand-700 uppercase">
            {t("official")}
          </div>
          <h2 className="mt-3 font-heading text-[27px] leading-tight font-bold text-brand-900">
            {title}
          </h2>
          <div className="mt-1.5 text-[15px] text-neutral-600 italic">
            {orgName}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {orgLogoUrl ? (
            // Obični <img>: domena kante dolazi iz env varijable, pa next/image
            // traži remotePatterns za host koji se mijenja po okruženju.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={orgLogoUrl} alt="" className="h-12 w-auto max-w-40 object-contain" />
          ) : (
            <>
              <Image
                src="/logo/logo-mark-light.png"
                alt=""
                width={48}
                height={48}
                className="h-12 w-auto"
              />
              <span className="font-heading text-[15px] font-bold text-brand-900">
                Electius
              </span>
            </>
          )}
        </div>
      </header>

      <div className="mt-6.5 h-0.5 rounded-sm bg-brand-900" />
      {/* neutral-600, ne neutral-400: 2,9:1 pada AA i dizajn ga označava kao
          boju samo za rezervirani tekst. Vrijeme uz datum — dva izvještaja s
          istog dana inače su nerazlučiva — i UTC izrijekom, jer formatter
          formatira u UTC-u, pa bi 17:04 na dokumentu značilo 19:04 lokalno. */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600">
        {/* Kad je privremeno, pečat stoji u traci upozorenja — ne dvaput. */}
        <span>{preliminary ? "" : t("generatedUtc", { date: stamp })}</span>
        {/* Pravi id izbora, označen kao takav. Izmišljena referentna oznaka na
            službenom dokumentu bila bi mala verzija lažne tvrdnje o reviziji. */}
        <span className="font-mono">
          {t("electionId")} {electionId}
        </span>
      </div>

      {/* Traka privremenog izvještaja (dizajn: §7.10 upozorenje). Stoji iznad
          rezultata jer mijenja značenje svega ispod. */}
      {preliminary && (
        <div className="mt-6 rounded-md border-l-[3px] border-warning-500 bg-warning-50 px-5 py-4 break-inside-avoid">
          <div className="font-heading text-[15px] font-bold text-warning-700">
            {t("preliminaryTitle")}
          </div>
          <p className="mt-1 text-sm text-warning-700">
            {t("preliminaryTurnout", { pct: turnout, duration })} ·{" "}
            {t("generatedUtc", { date: stamp })}
          </p>
          <p className="mt-1.5 text-sm text-neutral-600">{t("preliminaryNote")}</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {figures.map((f) => (
              <div key={f.label}>
                <dt className="text-[11.5px] text-neutral-600">{f.label}</dt>
                <dd className="font-heading text-[19px] leading-tight font-bold text-brand-900">
                  {nf.format(f.value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Rezultati */}
      <SectionHeading>{t("headingResults")}</SectionHeading>

      {/* Pobjednik je tvrdnja o ishodu koji se nije dogodio, pa dok glasanje
          traje kartice nema (D9). Same brojke po kandidatu ostaju — one su
          istinita tvrdnja o trenutku. */}
      {!preliminary && (
        <WinnerBlock
          outcome={outcome}
          labels={{
            winner: tr("winner"),
            tie: tr("winnerTie"),
            none: tr("winnerNone"),
            noneBody: tr("winnerNoneBody"),
          }}
          share={(votes) => tr("winnerShare", { pct: voterSharePct(votes, voters) })}
          quorumPill={
            quorum
              ? { label: t("quorumPill", { state: quorumState }), met: quorum.met }
              : null
          }
          nf={nf}
        />
      )}

      {ranked.length === 0 ? (
        <p className="mt-3.5 border-b border-[#EEF1F5] py-3 text-sm text-neutral-600">
          {tr("noCandidates")}
        </p>
      ) : (
        <div className="mt-3.5">
          {distribution.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-4 border-b border-[#EEF1F5] px-1 py-3 break-inside-avoid"
            >
              <div className="flex min-w-0 items-center gap-3.25">
                <span className="flex size-6.5 shrink-0 items-center justify-center rounded-full bg-neutral-100 font-heading text-xs font-bold text-neutral-600">
                  {ranked.indexOf(c) + 1}
                </span>
                <div className="min-w-0">
                  <span className="text-[14.5px] font-semibold text-neutral-800">
                    {c.text}
                  </span>
                  {/* Razmak je doslovan: bez njega čitač zaslona spaja ime i
                      ulogu u "Marko HorvatTajnik" — margina nije razmak. */}
                  {c.description && (
                    <>
                      {" "}
                      <span className="ml-1 text-[12.5px] text-neutral-400">
                        {c.description}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-baseline gap-2.5 text-right">
                <span className="text-sm text-neutral-600">
                  {tr("votesN", { count: c.votes })}
                </span>
                <span className="inline-block min-w-11 font-heading text-[15px] font-bold text-neutral-800">
                  {c.pct}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Izlaznost */}
      <SectionHeading>{t("headingTurnout")}</SectionHeading>
      <div className="mt-3.5 grid grid-cols-1 gap-x-10 sm:grid-cols-2">
        {turnoutRows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3 border-b border-[#EEF1F5] py-3 break-inside-avoid"
          >
            <span className="text-sm text-neutral-600">{row.label}</span>
            <span
              className={`font-heading text-sm font-bold ${row.tone || "text-neutral-800"}`}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {/* Napomena o zapisu glasova. auditBody opisuje KAKO se glasovi bilježe i
          istinit je za svaki izbor. Tvrdnja o zapečaćenom stablu dolazi SAMO kad
          pečat postoji — izvještaj zatvorenog izbora još nije zapečaćen (pečat
          ide pri arhiviranju), a lažna tvrdnja o provjeri na dokumentu koji
          organizacija trajno čuva gora je od nikakve. */}
      <SectionHeading>{t("headingAudit")}</SectionHeading>
      <div className="mt-3.5 flex gap-3.5 rounded-[10px] border border-[#D6F0DE] bg-success-50 px-5 py-4.5 break-inside-avoid">
        <ShieldCheck
          className="mt-px size-5 shrink-0 text-success-700"
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-sm leading-relaxed text-[#33544A]">
            {t("auditBody")}
          </p>
          {sealed && (
            <>
              <p className="mt-2.5 text-sm leading-relaxed text-[#33544A]">
                {t("auditSealedBody")}
              </p>
              <div className="mt-2.5">
                <div className="mb-1 text-[11.5px] font-bold text-neutral-600">
                  {tr("merkleRoot")}
                </div>
                <div className="rounded-md border border-[#D6F0DE] bg-white px-3 py-2 font-mono text-[11.5px] break-all text-brand-900">
                  {sealed.merkleRoot}
                </div>
              </div>
            </>
          )}
          <p className="mt-2.5 text-sm leading-relaxed text-neutral-600">
            {t("auditContact")}{" "}
            <span className="font-bold text-success-700">{CONTACT_EMAIL}</span>
          </p>
        </div>
      </div>

      <footer className="mt-8.5 flex items-center justify-between border-t border-border pt-4 text-[11.5px] text-neutral-400">
        <span>{t("footerBrand")}</span>
        {/* Broj stranice namjerno izostaje: ispisni motor preglednika ga dodaje
            sam, a "1 / 1" bi na dužem izvještaju bila neistina. */}
      </footer>
    </article>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-8 font-heading text-[13px] font-bold tracking-widest text-neutral-600 uppercase">
      {children}
    </h3>
  );
}

// Pobjednička kartica. `winnerOutcome` vraća tri ishoda i sva tri se ispisuju —
// predložak koji čita ranked[0] ispisao bi pobjednika kojeg nema.
function WinnerBlock({
  outcome,
  labels,
  share,
  quorumPill,
  nf,
}: {
  outcome: ReturnType<typeof winnerOutcome>;
  labels: { winner: string; tie: string; none: string; noneBody: string };
  share: (votes: number) => string;
  quorumPill: { label: string; met: boolean } | null;
  nf: Intl.NumberFormat;
}) {
  if (outcome.kind === "none") {
    return (
      <div className="mt-4 rounded-[10px] border border-border border-l-4 border-l-neutral-400 bg-neutral-50 px-6 py-5 break-inside-avoid">
        <div className="font-heading text-[17px] font-bold text-neutral-800">
          {labels.none}
        </div>
        <p className="mt-1 text-sm text-neutral-600">{labels.noneBody}</p>
      </div>
    );
  }

  const tie = outcome.kind === "tie";
  const lead = outcome.candidates[0];

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-6 rounded-[10px] border border-[#DDE6F2] border-l-4 border-l-brand-900 bg-[#F3F6FB] px-6 py-5 break-inside-avoid">
      <div className="flex min-w-0 items-center gap-4">
        {!tie && (
          <span className="flex size-13 shrink-0 items-center justify-center rounded-full bg-brand-900 font-heading text-lg font-bold text-white">
            {candidateInitials(lead.text)}
          </span>
        )}
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-warning-700 uppercase">
            <Trophy className="size-3.25" aria-hidden />
            {tie ? labels.tie : labels.winner}
          </div>
          {tie ? (
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {outcome.candidates.map((c) => (
                <li key={c.id}>
                  <span className="font-heading text-[17px] leading-tight font-bold text-brand-900">
                    {c.text}
                  </span>
                  {c.description && (
                    <>
                      {" "}
                      <span className="ml-1 text-[13px] text-neutral-600">
                        {c.description}
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <>
              <div className="mt-0.75 font-heading text-[19px] leading-tight font-bold text-brand-900">
                {lead.text}
              </div>
              {lead.description && (
                <div className="mt-px text-[13px] text-neutral-600">
                  {lead.description}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        {/* Izjednačeni dijele isti broj glasova — ispisuje se jednom. */}
        <div className="font-heading text-[26px] leading-none font-bold text-brand-900">
          {nf.format(lead.votes)}
        </div>
        <div className="mt-1 text-[12.5px] text-neutral-600">
          {share(lead.votes)}
        </div>
        {quorumPill && (
          <div
            className={`mt-2 inline-flex h-5.5 items-center rounded-full px-2.5 text-[11.5px] font-bold ${
              quorumPill.met
                ? "bg-success-50 text-success-700"
                : "bg-warning-50 text-warning-700"
            }`}
          >
            {quorumPill.label}
          </div>
        )}
      </div>
    </div>
  );
}
