import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Info } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { LandingNav } from "@/components/marketing/landing-nav";
import { LOCALES } from "@/i18n/config";
import { APEX_ORIGIN, CONTACT_EMAIL } from "@/lib/urls";

// Obavijest biračima o obradi podataka — čl. 14. GDPR-a.
//
// Zašto postoji kao zasebna stranica, a ne kao odjeljak pravila privatnosti:
// čl. 14. se primjenjuje baš zato što podatke NISMO dobili od ispitanika nego
// od organizacije, a čl. 12. st. 1. traži da obavijest bude sažeta i lako
// dostupna. Pravila privatnosti pisana su za administratora, imaju petnaest
// odjeljaka i tri tablice; birač koji ih otvori s mobitela na putu do listića
// nije obaviješten ni u kojem stvarnom smislu.
//
// ⚠ Ovu obavijest objavljujemo U IME organizacije. Voditelj obrade nad popisom
// birača je ona, a ne Electius — što pravila privatnosti i uvjeti korištenja
// oboje već kažu. Objavljivanje u njezino ime svjesna je odluka: obveza je
// njezina, ali nijedna je organizacija neće ispuniti sama, pa bi birač inače
// ostao bez ikakve obavijesti. Aranžman pripada u ugovor o obradi (čl. 28.
// st. 3.) čim taj dokument nastane, a do tada stoji u odlomku `behalf`.
//
// Adresu ove stranice ispisuje i predložak pozivnice (NOTICE_URL), jer čl. 14.
// st. 3. t. (b) veže rok obavještavanja upravo na prvu komunikaciju s
// ispitanikom — a to je pozivnica, ne posjet web-stranici.

const CONTAINER = "mx-auto max-w-184 px-6";

// Isti obrazac kao na uvjetima korištenja: jedan popis iscrtava i sadržaj i
// tijelo, pa se ta dva ne mogu razići, a deklarirani neobavezni dijelovi
// (`bullets`, `after`, `mail`, `privacyLink`) provjeravaju se prije iscrtavanja.
const SECTIONS = [
  { id: "source" },
  { id: "who" },
  { id: "what", bullets: true, after: true },
  { id: "why" },
  { id: "secrecy" },
  { id: "recipients", bullets: true, after: true },
  { id: "retention", bullets: true },
  { id: "rights", bullets: true, after: true },
  { id: "contact", mail: true },
  { id: "more", privacyLink: true },
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "legal.voterNotice.meta",
  });

  return {
    title: t("title"),
    description: t("description"),
    ...(APEX_ORIGIN ? { metadataBase: new URL(APEX_ORIGIN) } : {}),
    alternates: {
      canonical: `/${locale}/privacy/voters`,
      languages: Object.fromEntries(
        LOCALES.map((l) => [l, `/${l}/privacy/voters`]),
      ),
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

export default async function VoterPrivacyNotice({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal.voterNotice");
  const s = await getTranslations("legal.voterNotice.s");

  const list = (key: string) => s.raw(key) as string[];

  // Provjera je OBOSTRANA, iz istog razloga kao na uvjetima korištenja:
  // next-intl na nepoznat ključ ne puca nego iscrta samu putanju, pa bi se
  // objavila pravna obavijest u kojoj odlomak glasi „legal.voterNotice.s…".
  // U drugom smjeru je gore — odjeljak dodan samo u katalog ne iscrta se
  // nigdje, tiho, a ovo je obavijest čiji je cijeli smisao potpunost. Stranica
  // se prerenderira statički, pa razilaženje ruši BUILD.
  const raw = t.raw("s") as Record<string, Record<string, unknown>>;
  const catalogIds = Object.keys(raw).sort();
  const codeIds = SECTIONS.map((x) => x.id)
    .slice()
    .sort();
  if (catalogIds.join() !== codeIds.join()) {
    throw new Error(
      `legal.voterNotice.s [${catalogIds}] ne odgovara SECTIONS [${codeIds}]`,
    );
  }
  for (const section of SECTIONS) {
    const node = raw[section.id];
    if (typeof node?.title !== "string") {
      throw new Error(
        `legal.voterNotice.s.${section.id} nema tekstualni "title"`,
      );
    }
    for (const field of [
      "body",
      ...("bullets" in section ? ["bullets"] : []),
      ...("after" in section ? ["after"] : []),
    ]) {
      if (!Array.isArray(node[field])) {
        throw new Error(
          `legal.voterNotice.s.${section.id} nema polje "${field}" kao popis`,
        );
      }
    }
    // Tekstualni dodaci: bez njih bi „mail" iscrtao adresu bez objašnjenja, a
    // „privacyLink" poveznicu bez naziva.
    for (const field of [
      ...("mail" in section ? ["note"] : []),
      ...("privacyLink" in section ? ["linkLabel"] : []),
    ]) {
      if (typeof node[field] !== "string") {
        throw new Error(
          `legal.voterNotice.s.${section.id} nema tekstualni "${field}"`,
        );
      }
    }
  }

  return (
    <>
      {/* sectionsElsewhere: #how i #contact žive na odredišnoj stranici, pa bi
          ovdje bila mrtva sidra. */}
      <LandingNav sectionsElsewhere />

      <main className="bg-white pt-14 pb-20">
        <div className={CONTAINER}>
          <p className="font-heading text-xs font-semibold tracking-[0.14em] text-brand-700 uppercase">
            {t("eyebrow")}
          </p>
          <h1 className="mt-3 font-heading text-[2rem] leading-tight font-bold text-neutral-950 sm:text-[2.25rem]">
            {t("title")}
          </h1>
          <p className="mt-3 text-sm text-neutral-600">{t("updated")}</p>

          {/* Tko obavijest daje i u čije ime — prvo što birač mora znati, jer
              o tome ovisi kome upućuje svaki zahtjev na ostatku stranice. */}
          <div className="mt-8 rounded-md bg-brand-50 p-4">
            <div className="flex gap-3">
              <Info
                className="mt-0.5 size-5 shrink-0 text-brand-700"
                aria-hidden
              />
              <div>
                <p className="text-sm font-semibold text-brand-700">
                  {t("behalf.title")}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
                  {t("behalf.body")}
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

              return (
                <Section key={id} id={id} title={s(`${id}.title`)}>
                  {list(`${id}.body`).map((p) => (
                    <P key={p}>{p}</P>
                  ))}

                  {"bullets" in section && (
                    <Bullets items={list(`${id}.bullets`)} />
                  )}

                  {"after" in section &&
                    list(`${id}.after`).map((p) => <P key={p}>{p}</P>)}

                  {"mail" in section && (
                    <>
                      <p className="text-base font-medium">
                        <a
                          href={`mailto:${CONTACT_EMAIL}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {CONTACT_EMAIL}
                        </a>
                      </p>
                      <P>{s(`${id}.note`)}</P>
                    </>
                  )}

                  {"privacyLink" in section && (
                    <p className="text-[0.9375rem]">
                      <Link
                        href="/privacy"
                        className="font-medium text-brand-700 underline"
                      >
                        {s(`${id}.linkLabel`)}
                      </Link>
                    </p>
                  )}
                </Section>
              );
            })}
          </div>
        </div>
      </main>

      {/* Uski podnožni pojas, isti kao na pravilima i uvjetima — puno podnožje
          odredišne stranice vodilo bi na sidra kojih ovdje nema. */}
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
