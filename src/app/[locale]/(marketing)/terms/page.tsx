import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Info } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { LandingNav } from "@/components/marketing/landing-nav";
import { LOCALES } from "@/i18n/config";
import { APEX_ORIGIN, CONTACT_EMAIL, SUPPORT_EMAIL } from "@/lib/urls";
import { TERMS_VERSION } from "@/lib/legal";

// Uvjeti korištenja (terms-of-service-spec). Apeks host, (marketing) grupa,
// statička i dostupna bez prijave — na nju upućuje i zaslon za postavljanje
// računa, na drugom hostu, u trenutku kad sesija postoji ali organizacija ne.
//
// INDEKSIRA SE, i kanonska adresa je SAMA SEBI uz hreflang na drugi jezik:
// hrvatski je tekst mjerodavan, pa bi kanonizacija na engleski izbacila iz
// indeksa baš onu verziju koja obvezuje. Isto kao kod pravila privatnosti.
//
// RAZLIKA prema pravilima privatnosti nije stilska: pravila privatnosti su
// OBAVIJEST i ispunjavaju se time što su dostupna, a ovo je UGOVOR i ispunjava
// se time što je prihvaćen. Zato uz ovu stranicu ide i zapis o pristanku
// (organizations.termsAcceptedAt + termsVersion, piše se na /setup) i oznaka
// inačice ispod naslova — bez nje je obećanje iz odjeljka o izmjenama
// neprovjerljivo.

const CONTAINER = "mx-auto max-w-184 px-6";

// Redoslijed odjeljaka i popis onoga što svaki od njih ima. Iz njega se iscrtava
// i sadržaj i tijelo, pa se ta dva ne mogu razići — isti obrazac kao SECTIONS na
// pravilima privatnosti, samo prošireni: `bullets` i `after` nisu svugdje, a
// tvrdnja „ovaj odjeljak ima nabrajanje" mora živjeti u kodu. Katalog kojemu
// nedostaje deklarirani ključ ruši prerenderiranje, dakle build; katalog koji
// ima odjeljak kojega u ovom popisu nema ne bi se iscrtao NIGDJE, tiho, pa se
// provjeravaju oba smjera (vidi provjeru niže).
const SECTIONS = [
  { id: "agreement", party: true },
  { id: "service", table: true, after: true },
  { id: "eligibility" },
  { id: "accounts" },
  { id: "use", bullets: true, after: true },
  { id: "content" },
  { id: "election" },
  // `supportMail` iscrtava adresu za povrat kao živu poveznicu odmah iza
  // tijela: odjeljak sada opisuje POSTUPAK povrata, a postupak koji upućuje na
  // drugi odjeljak je jedan skok previše. Adresa i dalje dolazi iz urls.ts, ne
  // iz kataloga — dvije bi se surface inače razišle.
  // `after` nosi potrošačku klauzulu, koja mora stajati ISPOD adrese: ona je
  // nadređena odredba („imaju prednost pred svime navedenim"), pa bi usred
  // odjeljka čitala kao još jedan odlomak, a ne kao iznimka od svih ostalih.
  { id: "payment", supportMail: true, after: true },
  { id: "availability" },
  { id: "thirdparty" },
  { id: "termination" },
  { id: "disclaimers", bullets: true, after: true },
  { id: "liability" },
  { id: "indemnity" },
  { id: "notice" },
  { id: "law" },
  { id: "changes" },
  { id: "contact", mail: true },
  { id: "voters", boxed: true },
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.terms.meta" });

  return {
    title: t("title"),
    description: t("description"),
    ...(APEX_ORIGIN ? { metadataBase: new URL(APEX_ORIGIN) } : {}),
    alternates: {
      canonical: `/${locale}/terms`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}/terms`])),
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
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200">
      <table className="w-full min-w-120 border-collapse text-left">
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
          {rows.map((cells) => (
            <tr key={cells[0]} className="odd:bg-white even:bg-neutral-50/60">
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

export default async function TermsOfService({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal.terms");
  const s = await getTranslations("legal.terms.s");

  const list = (key: string) => s.raw(key) as string[];

  // Provjera je OBOSTRANA i nije ukras. next-intl na nepoznat ključ NE puca:
  // zabilježi MISSING_MESSAGE i iscrta samu putanju ključa, pa build prođe
  // (izmjereno na pravilima privatnosti, izlaz 0) i objavi se pravni tekst u
  // kojemu odlomak glasi „legal.terms.s.liability.body". U drugom je smjeru
  // gore: odjeljak dodan samo u katalog ne bi se iscrtao NIGDJE, tiho — a ovo
  // je ugovor, pa je odredba koja postoji u prijevodu a ne i na objavljenoj
  // stranici gora od one koja nedostaje na oba mjesta. Stranica se
  // prerenderira statički, pa razilaženje ruši BUILD.
  const raw = t.raw("s") as Record<string, Record<string, unknown>>;
  const catalogIds = Object.keys(raw).sort();
  const codeIds = SECTIONS.map((x) => x.id)
    .slice()
    .sort();
  if (catalogIds.join() !== codeIds.join()) {
    throw new Error(
      `legal.terms.s [${catalogIds}] ne odgovara SECTIONS [${codeIds}]`,
    );
  }
  for (const section of SECTIONS) {
    const node = raw[section.id];
    if (typeof node?.title !== "string") {
      throw new Error(`legal.terms.s.${section.id} nema tekstualni "title"`);
    }
    // Deklarirani neobavezni dijelovi moraju postojati: `bullets: true` bez
    // nabrajanja u katalogu iscrtao bi praznu listu usred odredbe.
    const required = [
      "body",
      ..."bullets" in section ? ["bullets"] : [],
      ..."after" in section ? ["after"] : [],
    ];
    for (const field of required) {
      if (!Array.isArray(node[field])) {
        throw new Error(
          `legal.terms.s.${section.id} nema polje "${field}" kao popis`,
        );
      }
    }
  }

  const mailLink = (address: string) => (
    <a
      href={`mailto:${address}`}
      className="font-medium text-brand-700 hover:underline"
    >
      {address}
    </a>
  );

  return (
    <>
      {/* sectionsElsewhere: #how i #contact žive na odredišnoj stranici, ne
          ovdje — inače bi „Kako funkcionira" bilo mrtvo sidro, a „Kontakt" bi
          vodio na ovdašnji odjeljak umjesto na onaj koji naziv obećava. */}
      <LandingNav sectionsElsewhere />

      <main className="bg-white pt-14 pb-20">
        <div className={CONTAINER}>
          <p className="font-heading text-xs font-semibold tracking-[0.14em] text-brand-700 uppercase">
            {t("eyebrow")}
          </p>
          <h1 className="mt-3 font-heading text-[2rem] leading-tight font-bold text-neutral-950 sm:text-[2.25rem]">
            {t("title")}
          </h1>
          <p className="mt-3 text-sm text-neutral-600">
            {t("updated")}{" "}
            <span className="text-neutral-600">
              {t("version", { version: TERMS_VERSION })}
            </span>
          </p>

          {/* Dok pravna osoba nije registrirana, stranica to KAŽE umjesto da
              izmišlja drugu ugovornu stranu (spec §16 B1). */}
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

          <nav aria-labelledby="toc-title" className="mt-10">
            <h2
              id="toc-title"
              className="font-heading text-sm font-semibold text-neutral-800"
            >
              {t("tocTitle")}
            </h2>
            <ol className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
              {SECTIONS.map(({ id }, i) => (
                <li key={id} className="text-sm">
                  <a
                    href={`#${id}`}
                    className="text-neutral-600 hover:text-brand-700 hover:underline"
                  >
                    {/* neutral-400 pada AA na bijelom — redni broj je stvarni
                        sadržaj, a hijerarhiju nosi položaj, ne tinta. */}
                    <span className="text-neutral-600">{i + 1}.</span>{" "}
                    {s(`${id}.title`)}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="mt-12 flex flex-col gap-12">
            {SECTIONS.map((section) => {
              const { id } = section;
              const body = list(`${id}.body`);
              const paragraphs = body.map((p) => <P key={p}>{p}</P>);

              return (
                <Section key={id} id={id} title={s(`${id}.title`)}>
                  {"boxed" in section ? (
                    // Odjeljak za birače stoji u okviru jer NIJE ugovorna
                    // odredba: birač nije stranka i ništa ne prihvaća. Ista
                    // obrada kao „Za birače" u pravilima privatnosti.
                    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-6">
                      <div className="flex flex-col gap-4">{paragraphs}</div>
                    </div>
                  ) : (
                    paragraphs
                  )}

                  {"party" in section && (
                    <dl className="rounded-lg border border-neutral-200 bg-neutral-50 p-5 text-sm">
                      {(
                        [
                          ["entityLabel", "entity"],
                          ["addressLabel", "address"],
                        ] as const
                      ).map(([label, value]) => (
                        <div
                          key={label}
                          className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:gap-3"
                        >
                          <dt className="font-medium text-neutral-800 sm:w-40 sm:shrink-0">
                            {s(`${id}.${label}`)}
                          </dt>
                          <dd className="text-neutral-600">
                            {s(`${id}.${value}`)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  {"table" in section && (
                    <Table
                      caption={s(`${id}.limitsCaption`)}
                      head={list(`${id}.limitsHead`)}
                      rows={s.raw(`${id}.limits`) as string[][]}
                    />
                  )}

                  {"bullets" in section && (
                    <Bullets items={list(`${id}.bullets`)} />
                  )}

                  {"mail" in section && (
                    <>
                      <p className="text-base font-medium">
                        {mailLink(CONTACT_EMAIL)}
                      </p>
                      <P>{s(`${id}.supportLabel`)}</P>
                      <p className="text-base font-medium">
                        {mailLink(SUPPORT_EMAIL)}
                      </p>
                      <P>{s(`${id}.note`)}</P>
                    </>
                  )}

                  {"supportMail" in section && (
                    <p className="text-base font-medium">
                      {mailLink(SUPPORT_EMAIL)}
                    </p>
                  )}

                  {"after" in section &&
                    list(`${id}.after`).map((p) => <P key={p}>{p}</P>)}

                  {"party" in section && <P>{s(`${id}.note`)}</P>}
                </Section>
              );
            })}
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
