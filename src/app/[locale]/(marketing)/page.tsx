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
  // FileX2, — vidi zakomentirani odsjek „Problem”
  Mail,
  // MessageSquareWarning, — vidi zakomentirani odsjek „Problem”
  PanelsTopLeft,
  Play,
  Send,
  ShieldCheck,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { LandingNav } from "@/components/marketing/landing-nav";
// import { PricingPlans } from "@/components/marketing/pricing-plans"; //TODO Add back when pricing is ready
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { BallotDemo } from "@/components/marketing/ballot-demo";
import { DemoTrigger } from "@/components/marketing/demo-trigger";
import {
  FlowStep,
  IconCard,
  SectionHeader,
  TrackLabel,
} from "@/components/marketing/section";
import { LOCALES } from "@/i18n/config";
import { APEX_ORIGIN, CONTACT_EMAIL, SUPPORT_EMAIL, signUpUrl } from "@/lib/urls";

const CONTAINER = "mx-auto max-w-350 px-6";
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
    ...(APEX_ORIGIN ? { metadataBase: new URL(APEX_ORIGIN) } : {}),
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}`])),
    },
    openGraph: {
      type: "website",
      title,
      description,
      locale,
      images: [
        { url: "/marketing/hero-banner.webp", width: 2560, height: 1086 },
      ],
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

  const adminSteps = [
    "prepare",
    "publish",
    "vote",
    "results",
    "archive",
  ] as const;
  const adminStepIcons = {
    prepare: <PanelsTopLeft className="size-6 text-brand-700" strokeWidth={1.8} />,
    publish: <Send className="size-6 text-brand-700" strokeWidth={1.8} />,
    vote: <Activity className="size-6 text-brand-700" strokeWidth={1.8} />,
    results: <FileSearch className="size-6 text-brand-700" strokeWidth={1.8} />,
    archive: <Archive className="size-6 text-brand-700" strokeWidth={1.8} />,
  };

  const voterSteps = ["link", "cast", "receipt"] as const;
  const voterStepIcons = {
    link: <Mail className="size-6 text-brand-700" strokeWidth={1.8} />,
    cast: <Check className="size-6 text-brand-700" strokeWidth={1.8} />,
    receipt: <ShieldCheck className="size-6 text-brand-700" strokeWidth={1.8} />,
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

  return (
    <>
      <LandingNav />

      {/* ───────── 1 · Hero ───────── */}
      <section
        id="top"
        className={`relative isolate flex min-h-[calc(100svh-4.5rem)] items-center bg-brand-50 ${ANCHOR}`}
      >
        <Image
          src="/hero/hero_banner.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-10 object-cover object-center"
        />
        <div
          className={`${CONTAINER} grid w-full grid-cols-1 items-center gap-16 py-20 lg:grid-cols-[31.25rem_1fr] lg:gap-16`}
        >
          <div>
            <div className="mb-5.5 inline-flex min-h-7.5 items-center gap-2 rounded-full bg-brand-100 px-3.5 py-1 sm:px-3">
              <span className="size-1.75 rounded-full bg-brand-700" />
              <span className="font-heading text-[0.78125rem] font-semibold tracking-[0.04em] text-brand-700">
                {t("hero.badge")}
              </span>
            </div>
            <h1 className="mb-5.5 font-heading text-[2.5rem] leading-[1.08] font-bold tracking-tight text-brand-900 sm:text-[3rem]">
              {t("hero.title")}
            </h1>
            <p className="mb-8.5 max-w-[30em] text-[1.1875rem] leading-relaxed text-neutral-600">
              {t("hero.subtitle")}
            </p>
            <div className="flex flex-wrap items-center gap-4.5">
              <a
                href={signUpUrl()}
                className="inline-flex h-14 items-center gap-2.5 rounded-md bg-brand-700 px-8 font-heading text-[1.0625rem] font-semibold text-white shadow-md hover:bg-brand-600 sm:px-7.5"
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

          {/* Hero Mockup */}
          <Image
            src="/marketing/assets/electius-product-mockup-hero-trimmed.png"
            alt={t("hero.mockupAlt")}
            width={2338}
            height={1020}
            priority
            quality={100}
            sizes="(min-width: 1400px) 788px, (min-width: 1024px) calc(100vw - 612px), 100vw"
            className="h-auto w-full"
          />
        </div>
      </section>

      {/* ───────── 2 · Kako funkcionira ───────── */}
      <section id="how" className={`bg-white py-24 ${ANCHOR}`}>
        <div className={CONTAINER}>
          <SectionHeader
            kicker={t("how.kicker")}
            title={t("how.title")}
            subtitle={t("how.subtitle")}
          />

          {/* Traka administratora — pet faza */}
          <div className="mt-14">
            <TrackLabel>{t("how.adminTrack")}</TrackLabel>
            <ol className="relative mt-8 grid grid-cols-1 gap-10 before:absolute before:top-7 before:right-[10%] before:left-[10%] before:hidden before:h-px before:bg-neutral-200 md:grid-cols-5 md:gap-6 md:before:block">
              {adminSteps.map((k, i) => (
                <FlowStep
                  key={k}
                  n={i + 1}
                  icon={adminStepIcons[k]}
                  title={t(`how.admin.${k}.title`)}
                  body={t(`how.admin.${k}.body`)}
                />
              ))}
            </ol>
          </div>

          {/* Traka birača  */}
          <div className="mt-10 rounded-xl border border-neutral-200/70 px-6 py-10 sm:px-10">
            <TrackLabel>{t("how.voterTrack")}</TrackLabel>
            {/* Tri stupca → središta na 16.67/50/83.33 %. */}
            <ol className="relative mt-8 grid grid-cols-1 gap-10 before:absolute before:top-7 before:right-[16.666%] before:left-[16.666%] before:hidden before:h-px before:bg-neutral-200 md:grid-cols-3 md:gap-6 md:before:block">
              {voterSteps.map((k, i) => (
                <FlowStep
                  key={k}
                  n={i + 1}
                  icon={voterStepIcons[k]}
                  title={t(`how.voter.${k}.title`)}
                  body={t(`how.voter.${k}.body`)}
                />
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ───────── 2 · Problem Section - Hidden ───────── */}
      {/* <section id="how" className={`bg-white py-24 ${ANCHOR}`}>
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
      </section> */}

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
      <section id="features" className={`bg-white py-20 ${ANCHOR}`}>
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
      {/* <section id="pricing" className={`bg-neutral-50 py-24 ${ANCHOR}`}>
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
      </section> */}

      {/* ───────── 7 · Česta pitanja ───────── */}
      <section id="faq" className={`bg-white py-20 ${ANCHOR}`}>
        <div className="mx-auto max-w-220 px-6">
          <SectionHeader
            kicker={t("faq.kicker")}
            title={t("faq.title")}
            className="mb-12"
          />
          <FaqAccordion />
        </div>
      </section>

      {/* ───────── 8 · Kontakt ───────── */}
      {/* mailto CTA umjesto obrasca — ne postoji backend koji bi primao
          poruke; pravi obrazac (server action + Resend) kad zatreba. Sidro #contact
          živi ovdje, ne više na podnožju — navigacijski "Kontakt" vodi na odsjek. */}
      <section id="contact" className={`bg-neutral-50 py-16 ${ANCHOR}`}>
        <div className={CONTAINER}>
          <SectionHeader
            kicker={t("contact.kicker")}
            title={t("contact.title")}
            subtitle={t("contact.subtitle")}
            className="mb-8"
          />
          <div className="flex flex-col items-center">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex h-14 items-center gap-2.5 rounded-md bg-brand-700 px-8 font-heading text-[1.0625rem] font-semibold text-white shadow-md hover:bg-brand-600"
            >
              <Mail className="size-4.5" aria-hidden="true" />
              {t("contact.cta")}
            </a>
            <span className="mt-4 text-base text-neutral-600">
              {CONTACT_EMAIL}
            </span>
          </div>
        </div>
      </section>

      {/* ───────── 9 · Završni CTA ─────────
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
              className="inline-flex h-14 items-center gap-2.5 rounded-md bg-brand-700 px-8.5 font-heading text-[1.0625rem] font-semibold text-white shadow-lg hover:bg-brand-600 sm:px-8"
            >
              {t("cta.primary")}
              <ArrowRight className="size-4.5" aria-hidden="true" />
            </a>
            <DemoTrigger className="inline-flex h-14 items-center gap-2.25 rounded-md border-[1.5px] border-white/40 px-7 text-base font-semibold text-white hover:border-white hover:bg-white/8">
              {t("cta.demo")}
            </DemoTrigger>
          </div>
        </div>
      </section> */}

      {/* ───────── 9 · Podnožje ───────── */}
      <footer className="bg-[#142844] pt-16 pb-10">
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
                postoje, a href="#" je poveznica koja laže. Iznimka je
                „Privatnost”: njezina stranica od sada postoji, pa je jedina
                stvarna poveznica u stupcu. */}
            <div>
              <div className="mb-4 font-heading text-sm font-semibold text-white">
                {t("footer.trust")}
              </div>
              {/* Redoslijed je izvorni (sigurnost · provjerljivost ·
                  privatnost · usklađenost) — „Privatnost" je poveznica, ali
                  ostaje na svom trećem mjestu. */}
              <div className="flex flex-col gap-3">
                {["security", "verifiability", "privacy", "compliance"].map(
                  (k) =>
                    k === "privacy" ? (
                      <Link
                        key={k}
                        href="/privacy"
                        className="text-sm text-neutral-400 hover:text-white"
                      >
                        {t("footer.privacy")}
                      </Link>
                    ) : (
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
              {/* Dvije adrese jer su dva pretinca: CONTACT_EMAIL je pravna i
                  revizijska (uvjeti korištenja upućuju na nju za prijave
                  sadržaja), SUPPORT_EMAIL je za pitanja o korištenju. */}
              <div className="flex flex-col gap-2">
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-sm text-neutral-400 hover:text-white"
                >
                  {CONTACT_EMAIL}
                </a>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-sm text-neutral-400 hover:text-white"
                >
                  {SUPPORT_EMAIL}
                </a>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-7">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-[0.8125rem] text-neutral-400">
                {t("footer.copyright")}
              </span>
              {/* Ugovor, ne signal povjerenja — zato ovdje, a ne u stupcu
                  povjerenja u kojemu stoji „Privatnost". */}
              <Link
                href="/terms"
                className="text-[0.8125rem] text-neutral-400 hover:text-white"
              >
                {t("footer.terms")}
              </Link>
            </div>
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
