import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Info, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { LandingNav } from "@/components/marketing/landing-nav";
import { LOCALES } from "@/i18n/config";
import { APEX_ORIGIN, CONTACT_EMAIL } from "@/lib/urls";

// Pravila privatnosti (privacy-policy-spec). Apeks host, (marketing) grupa,
// statička i dostupna bez prijave — registracija na nju upućuje prije nego što
// sesija uopće postoji.
//
// INDEKSIRA SE, za razliku od javnih rezultata: pravni dokument je ono što
// Google i Stripe provjeravaju pri odobravanju aplikacije, a AZOP-u je ovo
// jedini javni artefakt. Kanonska adresa je SAMA SEBI, uz hreflang na drugi
// jezik: hrvatska je verzija pravno mjerodavan tekst za hrvatske ispitanike,
// pa je kanonizirati na englesku znači izbaciti je iz indeksa (spec §17).
//
// Cijeli sadržaj živi u messages/{hr,en}.json pod legal.privacy. Tablice se
// čitaju preko t.raw() — isti obrazac kao marketinški cjenik.

const CONTAINER = "mx-auto max-w-184 px-6";

// Redoslijed odjeljaka. Iz njega se iscrtava i sadržaj i tijelo, pa se ta dva
// ne mogu razići.
const SECTIONS = [
  "who",
  "what",
  "collect",
  "basis",
  "ballot",
  "cookies",
  "processors",
  "retention",
  "security",
  "rights",
  "transfers",
  "children",
  "changes",
  "contact",
  "voters",
] as const;

// Vrijedi li pojedina tvrdnja iz §E, poredano uz `s.ballot.rows`. ŽIVI U KODU,
// a ne u katalogu, i to je nosivo: vrijednost `"yes"` u messages/*.json sjedila
// bi dva retka do `"yes": "Da"`, u datoteci čiji je cijeli ugovor „prevedi
// nizove". Prevoditelj koji `"yes"` prevede u `"da"` obori usporedbu, pa se
// PRVA tvrdnja o tajnosti glasovanja objavi s oznakom „Ne" — stranica tada
// tvrdi da MOŽEMO saznati kako je netko glasao. Bez greške u tipovima, bez pada
// testa, bez pada builda. Ovdje je takvo stanje neizrazivo.
const BALLOT_HOLDS = [true, true, false, false] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.privacy.meta" });

  return {
    title: t("title"),
    description: t("description"),
    ...(APEX_ORIGIN ? { metadataBase: new URL(APEX_ORIGIN) } : {}),
    alternates: {
      canonical: `/${locale}/privacy`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}/privacy`])),
    },
    openGraph: {
      type: "article",
      title: t("title"),
      description: t("description"),
      locale,
    },
  };
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="font-heading text-[1.375rem] leading-snug font-semibold text-neutral-800">
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.9375rem] leading-relaxed text-neutral-600">
      {children}
    </p>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li
          key={item}
          className="flex gap-2.5 text-[0.9375rem] leading-relaxed text-neutral-600"
        >
          <span
            aria-hidden
            className="mt-2.25 size-1.5 shrink-0 rounded-full bg-brand-500"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

// Tablica u vlastitom vodoravnom klizaču — jedina iznimka od pravila da se
// stranica ne smije pomicati postrance na 390 px.
function Table({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200">
      <table className="w-full min-w-140 border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-neutral-50">
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="border-b border-neutral-200 px-4 py-3 font-heading text-sm font-semibold text-neutral-800"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="odd:bg-white even:bg-neutral-50/60">
              {cells.map((cell, j) => (
                <td
                  key={j}
                  className="border-b border-neutral-200 px-4 py-3 align-top text-sm leading-relaxed text-neutral-600 last:border-b-0"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Boja nikad nije informacija (design-system §10): oznaka nosi samu riječ
// „Da"/„Ne", a tinta je samo pojačava.
function Verdict({ holds, label }: { holds: boolean; label: string }) {
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full px-2 text-xs font-medium ${
        holds
          ? "bg-success-50 text-success-700"
          : "bg-warning-50 text-warning-700"
      }`}
    >
      {label}
    </span>
  );
}

export default async function PrivacyPolicy({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal.privacy");
  const s = await getTranslations("legal.privacy.s");

  const pairs = (key: string) => t.raw(key) as [string, string][];
  const list = (key: string) => t.raw(key) as string[];

  // Stranica se prerenderira statički, pa razilaženje ovdje ruši BUILD umjesto
  // da tiho iscrta krivu presudu uz pogrešnu tvrdnju.
  const ballotRows = pairs("s.ballot.rows");
  if (ballotRows.length !== BALLOT_HOLDS.length) {
    throw new Error(
      `legal.privacy.s.ballot.rows ima ${ballotRows.length} redaka, a BALLOT_HOLDS ${BALLOT_HOLDS.length}`,
    );
  }

  const mail = (
    <a
      href={`mailto:${CONTACT_EMAIL}`}
      className="font-medium text-brand-700 hover:underline"
    >
      {CONTACT_EMAIL}
    </a>
  );

  return (
    <>
      {/* sectionsOnHome: #how i #contact žive na odredišnoj stranici, ne ovdje.
          Bez toga bi „Kako funkcionira" ovdje bilo mrtvo sidro, a „Kontakt" bi
          vodio na ovdašnji odjeljak M umjesto na onaj koji naziv obećava. */}
      <LandingNav sectionsOnHome />

      <main className="bg-white pt-14 pb-20">
        <div className={CONTAINER}>
          {/* ── Zaglavlje ── */}
          <p className="font-heading text-xs font-semibold tracking-[0.14em] text-brand-700 uppercase">
            {t("eyebrow")}
          </p>
          <h1 className="mt-3 font-heading text-[2rem] leading-tight font-bold text-neutral-950 sm:text-[2.25rem]">
            {t("title")}
          </h1>
          <p className="mt-3 text-sm text-neutral-600">{t("updated")}</p>

          {/* Dok pravna osoba nije registrirana, stranica to KAŽE umjesto da
              izmišlja voditelja obrade (spec §14 B1). */}
          <div className="mt-8 rounded-md bg-warning-50 p-4">
            <div className="flex gap-3">
              <Info
                className="mt-0.5 size-5 shrink-0 text-warning-700"
                aria-hidden
              />
              <div>
                <p className="text-sm font-semibold text-warning-700">
                  {t("draft.title")}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
                  {t("draft.body")}
                </p>
              </div>
            </div>
          </div>

          <p className="mt-8 text-base leading-relaxed text-neutral-600">
            {t("intro")}
          </p>

          {/* ── Sadržaj ── */}
          <nav aria-labelledby="toc-title" className="mt-10">
            <h2
              id="toc-title"
              className="font-heading text-sm font-semibold text-neutral-800"
            >
              {t("tocTitle")}
            </h2>
            <ol className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
              {SECTIONS.map((id, i) => (
                <li key={id} className="text-sm">
                  <a
                    href={`#${id}`}
                    className="text-neutral-600 hover:text-brand-700 hover:underline"
                  >
                    <span className="text-neutral-400">{i + 1}.</span>{" "}
                    {s(`${id}.title`)}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="mt-12 flex flex-col gap-12">
            {/* ── A · Tko smo mi ── */}
            <Section id="who" title={s("who.title")}>
              <P>{s("who.body")}</P>
              <dl className="rounded-lg border border-neutral-200 bg-neutral-50 p-5 text-sm">
                <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
                  <dt className="w-40 shrink-0 font-medium text-neutral-800">
                    {s("who.entityLabel")}
                  </dt>
                  <dd className="text-neutral-600">{s("who.entity")}</dd>
                </div>
                <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:gap-4">
                  <dt className="w-40 shrink-0 font-medium text-neutral-800">
                    {s("who.addressLabel")}
                  </dt>
                  <dd className="text-neutral-600">{s("who.address")}</dd>
                </div>
                <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:gap-4">
                  <dt className="w-40 shrink-0 font-medium text-neutral-800">
                    {s("who.emailLabel")}
                  </dt>
                  <dd>{mail}</dd>
                </div>
              </dl>
              <P>{s("who.note")}</P>
            </Section>

            {/* ── B · Čime se Electius bavi ── */}
            <Section id="what" title={s("what.title")}>
              <P>{s("what.body")}</P>
            </Section>

            {/* ── C · Koje podatke prikupljamo ── */}
            <Section id="collect" title={s("collect.title")}>
              <h3 className="font-heading text-base font-semibold text-neutral-800">
                {s("collect.adminTitle")}
              </h3>
              <P>{s("collect.adminIntro")}</P>
              <Table
                caption={s("collect.adminTitle")}
                head={[s("collect.colData"), s("collect.colSource")]}
                rows={pairs("s.collect.admin")}
              />

              <h3 className="mt-4 font-heading text-base font-semibold text-neutral-800">
                {s("collect.voterTitle")}
              </h3>
              <P>{s("collect.voterIntro")}</P>
              <Table
                caption={s("collect.voterTitle")}
                head={[s("collect.colData"), s("collect.colSource")]}
                rows={pairs("s.collect.voter")}
              />

              <h3 className="mt-4 font-heading text-base font-semibold text-neutral-800">
                {s("collect.notTitle")}
              </h3>
              <Bullets items={list("s.collect.not")} />
            </Section>

            {/* ── D · Svrhe i pravne osnove ── */}
            <Section id="basis" title={s("basis.title")}>
              <P>{s("basis.intro")}</P>
              <Table
                caption={s("basis.title")}
                head={[s("basis.colPurpose"), s("basis.colBasis")]}
                rows={pairs("s.basis.rows")}
              />
              <P>{s("basis.voterNote")}</P>
            </Section>

            {/* ── E · Tajnost glasovanja ── */}
            <Section id="ballot" title={s("ballot.title")}>
              <P>{s("ballot.intro")}</P>
              <Table
                caption={s("ballot.title")}
                head={[
                  s("ballot.colClaim"),
                  s("ballot.colVerdict"),
                  s("ballot.colWhy"),
                ]}
                rows={ballotRows.map(([claim, why], i) => [
                  <span key="c" className="font-medium text-neutral-800">
                    {claim}
                  </span>,
                  <Verdict
                    key="v"
                    holds={BALLOT_HOLDS[i]}
                    label={BALLOT_HOLDS[i] ? s("ballot.yes") : s("ballot.no")}
                  />,
                  why,
                ])}
              />
              <P>{s("ballot.receipt")}</P>
            </Section>

            {/* ── F · Kolačići ── */}
            <Section id="cookies" title={s("cookies.title")}>
              <P>{s("cookies.body")}</P>
              <Table
                caption={s("cookies.title")}
                head={[
                  s("cookies.colName"),
                  s("cookies.colPurpose"),
                  s("cookies.colDuration"),
                  s("cookies.colOptOut"),
                ]}
                rows={t.raw("s.cookies.rows") as string[][]}
              />
              <Bullets items={list("s.cookies.bullets")} />
              <P>{s("cookies.banner")}</P>
            </Section>

            {/* ── G · Pružatelji usluga ── */}
            <Section id="processors" title={s("processors.title")}>
              <P>{s("processors.intro")}</P>
              <Table
                caption={s("processors.title")}
                head={[
                  s("processors.colName"),
                  s("processors.colPurpose"),
                  s("processors.colData"),
                ]}
                rows={(t.raw("s.processors.rows") as [string, string, string][]).map(
                  ([name, purpose, data]) => [
                    <span key="n" className="font-medium text-neutral-800">
                      {name}
                    </span>,
                    purpose,
                    data,
                  ],
                )}
              />
            </Section>

            {/* ── H · Rokovi čuvanja ── */}
            <Section id="retention" title={s("retention.title")}>
              <P>{s("retention.intro")}</P>
              <Table
                caption={s("retention.title")}
                head={[s("retention.colData"), s("retention.colPeriod")]}
                rows={pairs("s.retention.rows")}
              />
              <P>{s("retention.note")}</P>
              <div className="rounded-md bg-brand-50 p-4">
                <p className="text-sm leading-relaxed text-neutral-600">
                  {s("retention.deletion")}
                </p>
              </div>
            </Section>

            {/* ── Sigurnost ── */}
            <Section id="security" title={s("security.title")}>
              <P>{s("security.intro")}</P>
              <Bullets items={list("s.security.bullets")} />
              <P>{s("security.breach")}</P>
              <P>{s("security.noCert")}</P>
            </Section>

            {/* ── I · Vaša prava ── */}
            <Section id="rights" title={s("rights.title")}>
              <P>{s("rights.intro")}</P>
              <Table
                caption={s("rights.title")}
                head={[s("rights.colRight"), s("rights.colHow")]}
                rows={(t.raw("s.rights.rows") as [string, string][]).map(
                  ([right, how]) => [
                    <span key="r" className="font-medium text-neutral-800">
                      {right}
                    </span>,
                    how,
                  ],
                )}
              />
              <P>{s("rights.response")}</P>
              <h3 className="font-heading text-base font-semibold text-neutral-800">
                {s("rights.authorityTitle")}
              </h3>
              <P>{s("rights.authority")}</P>
              <div className="flex gap-3 rounded-md bg-warning-50 p-4">
                <ShieldCheck
                  className="mt-0.5 size-5 shrink-0 text-warning-700"
                  aria-hidden
                />
                <p className="text-sm leading-relaxed text-neutral-600">
                  {s("rights.voterTrap")}
                </p>
              </div>
            </Section>

            {/* ── J · Prijenos izvan EGP-a ── */}
            <Section id="transfers" title={s("transfers.title")}>
              <P>{s("transfers.body")}</P>
              <P>{s("transfers.pending")}</P>
            </Section>

            {/* ── K · Djeca ── */}
            <Section id="children" title={s("children.title")}>
              {list("s.children.body").map((p) => (
                <P key={p}>{p}</P>
              ))}
            </Section>

            {/* ── L · Izmjene ── */}
            <Section id="changes" title={s("changes.title")}>
              <P>{s("changes.body")}</P>
              <P>{s("changes.noAcceptance")}</P>
            </Section>

            {/* ── M · Kontakt ── */}
            <Section id="contact" title={s("contact.title")}>
              <P>{s("contact.body")}</P>
              <p className="text-base font-medium">{mail}</p>
              <P>{s("contact.note")}</P>
              <P>{s("contact.escalation")}</P>
            </Section>

            {/* ── N · Za birače ── */}
            <Section id="voters" title={s("voters.title")}>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-6">
                <div className="flex flex-col gap-4">
                  {list("s.voters.body").map((p) => (
                    <P key={p}>{p}</P>
                  ))}
                </div>
              </div>
            </Section>
          </div>
        </div>
      </main>

      {/* Uski podnožni pojas — puno podnožje odredišne stranice živi u njoj
          samoj i ovdje bi vodilo na sidrišta kojih na ovoj stranici nema. */}
      <footer className="bg-[#142844] py-8">
        <div
          className={`${CONTAINER} flex flex-wrap items-center justify-between gap-4`}
        >
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo/logo-mark.png"
              alt="Electius"
              width={510}
              height={503}
              className="h-8 w-auto"
            />
            <span className="font-heading text-base font-bold text-white">
              Electius
            </span>
          </Link>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-[0.8125rem] text-neutral-400 hover:text-white"
          >
            {CONTACT_EMAIL}
          </a>
        </div>
      </footer>
    </>
  );
}
