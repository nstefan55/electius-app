import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Activity,
  Archive,
  ArrowRight,
  Check,
  EyeOff,
  FileSearch,
  FileX2,
  MessageSquareWarning,
  PanelsTopLeft,
  Play,
  Send,
  ShieldCheck,
} from "lucide-react";
import { LandingNav } from "@/components/marketing/landing-nav";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { BallotDemo } from "@/components/marketing/ballot-demo";
import { DemoTrigger } from "@/components/marketing/demo-trigger";
import { IconCard, SectionHeader } from "@/components/marketing/section";
import { LOCALES } from "@/i18n/config";
import { CONTACT_EMAIL, signUpUrl } from "@/lib/urls";

// Apex odredišna stranica — vlasnik pravog "/" (sudar korijena: marketing drži /,
// pregled nadzorne ploče ostaje /home — domain-architecture-spec §3).
// Jedina javna i indeksabilna stranica u aplikaciji, pa se metapodaci isplate
// samo ovdje. CTA-ovi su obični <a> iz src/lib/urls.ts (apex → dashboard host),
// nikad isto-hostni <Link>.

const CONTAINER = "mx-auto max-w-295 px-6";
const ANCHOR = "scroll-mt-20"; // ljepljiva navigacija je visoka 72px

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing.meta" });
  const title = t("title");
  const description = t("description");

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}`])),
    },
    openGraph: {
      type: "website",
      title,
      description,
      locale,
      images: [{ url: "/marketing/hero-banner.png", width: 3168, height: 1344 }],
    },
  };
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("marketing");

  const problems = ["paper", "forms", "enterprise"] as const;
  const problemIcons = {
    paper: <FileX2 className="size-6 text-error-700" strokeWidth={1.8} />,
    forms: (
      <MessageSquareWarning
        className="size-6 text-warning-700"
        strokeWidth={1.8}
      />
    ),
    enterprise: (
      <PanelsTopLeft className="size-6 text-neutral-600" strokeWidth={1.8} />
    ),
  };
  const problemTints = {
    paper: "bg-error-50",
    forms: "bg-warning-50",
    enterprise: "bg-neutral-100",
  };

  const features = [
    "verifiability",
    "anonymity",
    "results",
    "audit",
    "setup",
    "archive",
  ] as const;
  const featureIcons = {
    verifiability: ShieldCheck,
    anonymity: EyeOff,
    results: Activity,
    audit: FileSearch,
    setup: Send,
    archive: Archive,
  };

  // NOTE: odsjek „Dokaz” (4 brojke + 3 izjave) je zakomentiran — sadržaj je bio
  // izmišljen, a proizvod još nema kupce (homepage-spec D1). Podaci i sam odsjek
  // ostaju u kodu i u katalozima pod `marketing.placeholder.*` da se vrate jednim
  // potezom kad postoje prave brojke i pristanak za citate.
  // const stats = t.raw("placeholder.stats") as { num: string; label: string }[];
  // const quotes = t.raw("placeholder.quotes") as {
  //   quote: string;
  //   name: string;
  //   initials: string;
  //   role: string;
  // }[];
  // const quoteTints = ["bg-brand-900", "bg-brand-700", "bg-success-700"];

  return (
    <>
      <LandingNav />

      {/* ───────── 1 · Hero ───────── */}
      {/* Puna visina ekrana minus ljepljiva navigacija (72px). `svh` jer se na
          mobitelu adresna traka skuplja — `vh` bi ostavio prazninu. */}
      <section
        id="top"
        className={`relative isolate flex min-h-[calc(100svh-4.5rem)] items-center bg-brand-50 ${ANCHOR}`}
      >
        {/* ponytail: next/image umjesto CSS background-image — ovo je LCP element
            jedine indeksabilne stranice, a CSS pozadina zaobilazi optimizaciju.
            Izvornik je stisnut sa 3168×1344 PNG / 3,5 MB na 2560×1086 WebP / 23 KB
            (mekani gradijent, pa se gubitak ne vidi). */}
        <Image
          src="/marketing/hero-banner.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-10 object-cover object-center"
        />
        <div
          className={`${CONTAINER} grid w-full grid-cols-1 items-center gap-16 py-20 lg:grid-cols-[1.04fr_0.96fr]`}
        >
          <div>
            <div className="mb-5.5 inline-flex h-7.5 items-center gap-2 rounded-full bg-brand-100 px-3">
              <span className="size-1.75 rounded-full bg-brand-700" />
              <span className="font-heading text-[0.78125rem] font-semibold tracking-[0.04em] text-brand-700">
                {t("hero.badge")}
              </span>
            </div>
            <h1 className="mb-5.5 font-heading text-[2.5rem] leading-[1.08] font-bold tracking-tight text-brand-900 sm:text-[3.375rem]">
              {t("hero.title")}
            </h1>
            <p className="mb-8.5 max-w-[30em] text-[1.1875rem] leading-relaxed text-neutral-600">
              {t("hero.subtitle")}
            </p>
            <div className="flex flex-wrap items-center gap-4.5">
              <a
                href={signUpUrl()}
                className="inline-flex h-14 items-center gap-2.5 rounded-md bg-brand-700 px-7.5 font-heading text-[1.0625rem] font-semibold text-white shadow-md hover:bg-brand-600"
              >
                {t("hero.cta")}
                <ArrowRight className="size-4.5" aria-hidden="true" />
              </a>
              <DemoTrigger className="inline-flex h-14 items-center gap-2.25 px-2 text-base font-semibold text-brand-900 hover:text-brand-700">
                <span className="inline-flex size-10 items-center justify-center rounded-full border border-neutral-200 bg-white shadow-xs">
                  <Play
                    className="size-3.75 fill-brand-700 text-brand-700"
                    aria-hidden="true"
                  />
                </span>
                {t("hero.demo")}
              </DemoTrigger>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-4.5">
              <span className="text-[0.8125rem] font-semibold tracking-[0.02em] text-neutral-600">
                {t("hero.trustedBy")}
              </span>
              {["unions", "universities", "boards"].map((k, i) => (
                <span key={k} className="flex items-center gap-4.5">
                  {i > 0 ? (
                    <span className="size-1 rounded-full bg-neutral-200" />
                  ) : null}
                  <span className="text-sm font-semibold text-neutral-600">
                    {t(`hero.${k}`)}
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* Maketa listića — ilustracija proizvoda, ne podatak. */}
          <div className="relative">
            <div className="relative z-1 rounded-xl border border-neutral-200 bg-white p-6 shadow-lg">
              <div className="mb-4.5 flex items-center justify-between">
                <div>
                  <div className="font-heading text-base font-semibold text-neutral-800">
                    {t("hero.card.election")}
                  </div>
                  <div className="mt-0.5 text-[0.8125rem] text-neutral-600">
                    {t("hero.card.choose")}
                  </div>
                </div>
                <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-success-50 px-2.5">
                  <span className="size-1.5 animate-[elLivePulse_2s_infinite] rounded-full bg-success-500" />
                  <span className="text-xs font-semibold text-success-700">
                    {t("hero.card.live")}
                  </span>
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                <div className="relative rounded-xl border-2 border-brand-700 bg-brand-50 px-4.5 py-4 shadow-xs">
                  <div className="absolute top-3 bottom-3 left-0 w-1 rounded-r-sm bg-brand-700" />
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-heading text-[0.9375rem] font-semibold text-neutral-800">
                        {t("hero.card.cand1")}
                      </div>
                      <div className="mt-0.5 text-[0.8125rem] text-neutral-600">
                        {t("hero.card.cand1Platform")}
                      </div>
                    </div>
                    <span className="inline-flex size-6 items-center justify-center rounded-full bg-brand-700">
                      <Check
                        className="size-3.25 text-white"
                        strokeWidth={3}
                        aria-hidden="true"
                      />
                    </span>
                  </div>
                </div>
                <div className="rounded-xl border-[1.5px] border-neutral-200 bg-white px-4.5 py-4">
                  <div className="font-heading text-[0.9375rem] font-semibold text-neutral-800">
                    {t("hero.card.cand2")}
                  </div>
                  <div className="mt-0.5 text-[0.8125rem] text-neutral-600">
                    {t("hero.card.cand2Platform")}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-md bg-neutral-100 px-3.5 py-3">
                <div className="mb-1 text-[0.6875rem] font-semibold tracking-[0.04em] text-neutral-600 uppercase">
                  {t("hero.card.receipt")}
                </div>
                <div className="font-mono text-[0.78125rem] leading-normal break-all text-neutral-800">
                  0x a3f9 7c21 e0b4 · d51f 9a08 …
                </div>
              </div>
            </div>

            <div className="absolute -right-3.5 bottom-10 z-2 flex animate-[elFloat_5s_ease-in-out_infinite] items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-4 py-3 shadow-md">
              <span className="inline-flex size-8.5 items-center justify-center rounded-full bg-brand-50">
                <ShieldCheck
                  className="size-4.5 text-brand-700"
                  aria-hidden="true"
                />
              </span>
              <div>
                <div className="font-heading text-[0.9375rem] leading-none font-bold text-neutral-800">
                  {t("hero.card.votes")}
                </div>
                <div className="mt-0.75 text-xs text-success-700">
                  {t("hero.card.verified")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── 2 · Problem ───────── */}
      <section id="how" className={`bg-white py-24 ${ANCHOR}`}>
        <div className={CONTAINER}>
          <SectionHeader
            kicker={t("problem.kicker")}
            title={t("problem.title")}
            subtitle={t("problem.subtitle")}
          />
          <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
            {problems.map((k) => (
              <IconCard
                key={k}
                icon={problemIcons[k]}
                tint={problemTints[k]}
                title={t(`problem.${k}.title`)}
                body={t(`problem.${k}.body`)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ───────── 3 · Priča ───────── */}
      <section className="relative overflow-hidden bg-brand-900 py-25">
        <div
          aria-hidden="true"
          className="absolute -top-30 -right-20 size-95 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.22),transparent_70%)]"
        />
        <div
          className={`${CONTAINER} relative z-1 grid grid-cols-1 items-center gap-16 lg:grid-cols-[0.9fr_1.1fr]`}
        >
          <div>
            <div className="mb-3.5 font-heading text-[0.8125rem] font-semibold tracking-[0.08em] text-brand-500 uppercase">
              {t("story.kicker")}
            </div>
            <h2 className="font-heading text-[2rem] leading-tight font-bold tracking-tight text-white sm:text-[2.375rem]">
              {t("story.title")}
            </h2>
          </div>
          <div>
            <p className="mb-5 text-[1.125rem] leading-relaxed text-brand-100">
              {t("story.p1")}
            </p>
            <p className="mb-7 text-[1.125rem] leading-relaxed text-brand-100">
              {t("story.p2a")}
              <strong className="font-semibold text-white">
                {t("story.lifecycle")}
              </strong>
              {t("story.p2b")}
            </p>
            <div className="flex flex-wrap gap-7">
              {["chip1", "chip2", "chip3"].map((k) => (
                <div key={k} className="flex items-center gap-2.5">
                  <Check
                    className="size-5 text-brand-500"
                    strokeWidth={2.2}
                    aria-hidden="true"
                  />
                  <span className="text-[0.9375rem] font-semibold text-white">
                    {t(`story.${k}`)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────── 4 · Dokaz — ZAKOMENTIRANO ─────────
          NOTE: BLOKADA ZA LANSIRANJE (homepage-spec D1). Brojke (2,4 mil.+ glasova,
          850+ organizacija, 99,99 % dostupnost) i tri potpisane izjave bile su
          izmišljene — proizvod nema kupce. Odsjek je zakomentiran umjesto obrisan
          jer je raspored složen oko 4 brojke i 3 kartice; kad postoje prave brojke
          i pristanak za citate, vraća se odkomentiranjem ovog bloka I varijabli
          `stats` / `quotes` / `quoteTints` gore. Tekstovi ostaju u katalozima pod
          `marketing.placeholder.*`. Zabilježeno u future-updates-spec.md § Marketing.

      <section className="bg-neutral-50 py-24">
        <div className={CONTAINER}>
          <div className="grid grid-cols-2 gap-6 border-b border-neutral-200 pb-16 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="font-heading text-[2.625rem] leading-none font-bold text-brand-900">
                  {s.num}
                </div>
                <div className="mt-2 text-[0.9375rem] text-neutral-600">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
            {quotes.map((q, i) => (
              <figure
                key={q.name}
                className="flex flex-col rounded-lg border border-neutral-200 bg-white p-7 shadow-sm"
              >
                <div
                  aria-hidden="true"
                  className="font-heading text-[2.375rem] leading-none text-brand-100"
                >
                  &ldquo;
                </div>
                <blockquote className="mt-1 mb-5 flex-1 text-base leading-relaxed text-neutral-800">
                  {q.quote}
                </blockquote>
                <figcaption className="flex items-center gap-3">
                  <span
                    className={`inline-flex size-10 items-center justify-center rounded-full font-heading text-[0.9375rem] font-semibold text-white ${quoteTints[i]}`}
                  >
                    {q.initials}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-neutral-800">
                      {q.name}
                    </span>
                    <span className="block text-[0.8125rem] text-neutral-600">
                      {q.role}
                    </span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>
      ───────── kraj zakomentiranog odsjeka ───────── */}

      {/* ───────── 5 · Značajke ───────── */}
      <section id="features" className={`bg-white py-24 ${ANCHOR}`}>
        <div className={CONTAINER}>
          <SectionHeader
            kicker={t("features.kicker")}
            title={t("features.title")}
            subtitle={t("features.subtitle")}
            className="mb-14"
          />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((k) => {
              const Icon = featureIcons[k];
              return (
                <IconCard
                  key={k}
                  icon={
                    <Icon className="size-6 text-brand-700" strokeWidth={1.8} />
                  }
                  tint="bg-brand-50"
                  title={t(`features.${k}.title`)}
                  body={t(`features.${k}.body`)}
                />
              );
            })}
          </div>
        </div>
      </section>

      {/* ───────── 6 · Cijene ───────── */}
      <section id="pricing" className={`bg-neutral-50 py-24 ${ANCHOR}`}>
        <div className={CONTAINER}>
          <SectionHeader
            kicker={t("pricing.kicker")}
            title={t("pricing.title")}
            subtitle={t("pricing.subtitle")}
          />
          <p className="mx-auto mt-2.5 mb-9 max-w-190 text-center text-[0.9375rem] leading-relaxed text-neutral-600">
            {t("pricing.compare")}
          </p>
          <PricingPlans />
        </div>
      </section>

      {/* ───────── 7 · Česta pitanja ───────── */}
      <section id="faq" className={`bg-white py-24 ${ANCHOR}`}>
        <div className="mx-auto max-w-220 px-6">
          <SectionHeader
            kicker={t("faq.kicker")}
            title={t("faq.title")}
            className="mb-12"
          />
          <FaqAccordion />
        </div>
      </section>

      {/* ───────── 8 · Završni CTA ───────── */}
      <section
        id="cta"
        className={`relative overflow-hidden bg-brand-900 py-25 ${ANCHOR}`}
      >
        <div
          aria-hidden="true"
          className="absolute -bottom-35 left-1/2 h-90 w-155 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.28),transparent_70%)]"
        />
        <div className="relative z-1 mx-auto max-w-190 px-6 text-center">
          <Image
            src="/logo/logo-mark.png"
            alt=""
            width={510}
            height={503}
            className="mx-auto mb-6.5 h-16 w-auto"
          />
          <h2 className="mb-4.5 font-heading text-[2.25rem] leading-[1.12] font-bold tracking-tight text-white sm:text-[2.75rem]">
            {t("cta.title")}
          </h2>
          <p className="mb-9 text-[1.1875rem] leading-relaxed text-brand-100">
            {t("cta.subtitle")}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href={signUpUrl()}
              className="inline-flex h-14 items-center gap-2.5 rounded-md bg-brand-700 px-8 font-heading text-[1.0625rem] font-semibold text-white shadow-lg hover:bg-brand-600"
            >
              {t("cta.primary")}
              <ArrowRight className="size-4.5" aria-hidden="true" />
            </a>
            <DemoTrigger className="inline-flex h-14 items-center gap-2.25 rounded-md border-[1.5px] border-white/40 px-7 text-base font-semibold text-white hover:border-white hover:bg-white/8">
              {t("cta.demo")}
            </DemoTrigger>
          </div>
        </div>
      </section>

      {/* ───────── 9 · Podnožje ───────── */}
      <footer id="contact" className={`bg-[#142844] pt-16 pb-10 ${ANCHOR}`}>
        <div className={CONTAINER}>
          <div className="grid grid-cols-1 gap-10 border-b border-white/12 pb-11 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <div className="mb-4 flex items-center gap-2.5">
                <Image
                  src="/logo/logo-mark.png"
                  alt="Electius"
                  width={510}
                  height={503}
                  className="h-10 w-auto"
                />
                <span className="font-heading text-xl font-bold text-white">
                  Electius
                </span>
              </div>
              <p className="max-w-[26em] text-sm leading-relaxed text-neutral-400">
                {t("footer.tagline")}
              </p>
            </div>

            <div>
              <div className="mb-4 font-heading text-sm font-semibold text-white">
                {t("footer.product")}
              </div>
              <div className="flex flex-col gap-3">
                <a
                  href="#features"
                  className="text-sm text-neutral-400 hover:text-white"
                >
                  {t("footer.features")}
                </a>
                <a
                  href="#how"
                  className="text-sm text-neutral-400 hover:text-white"
                >
                  {t("footer.how")}
                </a>
                <a
                  href="#pricing"
                  className="text-sm text-neutral-400 hover:text-white"
                >
                  {t("footer.pricing")}
                </a>
                <DemoTrigger className="text-left text-sm text-neutral-400 hover:text-white">
                  {t("footer.demo")}
                </DemoTrigger>
              </div>
            </div>

            {/* Stupac povjerenja: obični tekst, ne poveznice — te stranice još ne
                postoje, a href="#" je poveznica koja laže. */}
            <div>
              <div className="mb-4 font-heading text-sm font-semibold text-white">
                {t("footer.trust")}
              </div>
              <div className="flex flex-col gap-3">
                {["security", "verifiability", "privacy", "compliance"].map(
                  (k) => (
                    <span key={k} className="text-sm text-neutral-400">
                      {t(`footer.${k}`)}
                    </span>
                  ),
                )}
              </div>
            </div>

            <div>
              <div className="mb-4 font-heading text-sm font-semibold text-white">
                {t("footer.contact")}
              </div>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-sm text-neutral-400 hover:text-white"
              >
                {CONTACT_EMAIL}
              </a>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-7">
            <span className="text-[0.8125rem] text-neutral-400">
              {t("footer.copyright")}
            </span>
            <span className="text-[0.8125rem] text-neutral-400">
              {t("footer.motto")}
            </span>
          </div>
        </div>
      </footer>

      {/* Jedan modal za sva tri okidača (hero, završni CTA, podnožje). */}
      <BallotDemo />
    </>
  );
}
