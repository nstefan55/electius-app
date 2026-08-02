import Image from "next/image";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  Archive,
  BarChart3,
  ChevronRight,
  FileCheck2,
  FilePlus2,
  Lock,
  Mail,
  Plus,
  QrCode,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SquareCheckBig,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { auth } from "@/lib/auth";

// Onboarding (onboarding-page-spec): the post-setup "how it works" explainer,
// ported from the design prototype (Onboarding.dc.html) — hero, admin feature
// grid, voter delivery + 4-step flow, CTA panel. Static content, server-only;
// copy lives in the auth.onboarding i18n namespace (hr/en from the prototype).
// Chip tints outside the token palette (violet/cyan/navy-tint) stay arbitrary
// values — the design is deliberately "colorful"; not promoted to tokens.

const ADMIN_CARDS: { key: string; icon: LucideIcon; chip: string }[] = [
  { key: "create", icon: FilePlus2, chip: "bg-brand-50 text-brand-700" },
  { key: "people", icon: Users, chip: "bg-info-50 text-[#0E7490]" },
  { key: "safeguards", icon: ShieldCheck, chip: "bg-[#F5F3FF] text-[#6D28D9]" },
  { key: "results", icon: BarChart3, chip: "bg-success-50 text-success-700" },
  { key: "reports", icon: FileCheck2, chip: "bg-[#EEF2FB] text-brand-900" },
  { key: "archive", icon: Archive, chip: "bg-warning-50 text-warning-700" },
];

const VOTER_STEPS: { key: string; icon: LucideIcon; chip: string }[] = [
  { key: "invite", icon: Mail, chip: "bg-brand-50 text-brand-700" },
  { key: "open", icon: Lock, chip: "bg-[#F5F3FF] text-[#6D28D9]" },
  { key: "cast", icon: SquareCheckBig, chip: "bg-success-50 text-success-700" },
  { key: "anon", icon: ShieldAlert, chip: "bg-[#EEF2FB] text-brand-900" },
];

export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/${await getLocale()}/login`);

  const t = await getTranslations("auth.onboarding");
  const firstName = session.user.name.trim().split(/\s+/)[0] ?? "";

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-6 sm:px-8">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo/logo-mark-light.png"
            alt="Electius"
            width={30}
            height={30}
            className="object-contain"
            priority
          />
          <span className="font-heading text-[1.1875rem] font-bold tracking-tight text-brand-900">
            Electius
          </span>
        </div>
        <Link
          href="/home"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-600 hover:text-brand-700"
        >
          {t("skip")}
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </header>

      <div className="mx-auto max-w-250 px-6 pt-13 pb-18 sm:px-8">
        {/* Hero */}
        <div className="mx-auto max-w-170 text-center">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-brand-50 px-3.5 text-[0.78125rem] font-bold tracking-wider text-brand-700 uppercase">
            <Star className="size-3.5" aria-hidden />
            {t("welcomePill")}
          </span>
          <h1 className="mt-4.5 font-heading text-3xl leading-tight font-bold tracking-tight text-neutral-800 sm:text-4xl">
            {t("heroTitle", { name: firstName })}
          </h1>
          <p className="mt-3.5 text-[1.0625rem] leading-relaxed text-neutral-600">
            {t("heroSub")}
          </p>
        </div>

        {/* Admin section */}
        <section className="mt-14">
          <div className="mb-1.5 flex items-center gap-3">
            <span className="flex size-8.5 items-center justify-center rounded-[9px] bg-brand-900 text-white">
              <Settings className="size-4.5" aria-hidden />
            </span>
            <div>
              <div className="text-xs font-bold tracking-widest text-neutral-400 uppercase">
                {t("admin.eyebrow")}
              </div>
              <h2 className="mt-0.5 font-heading text-[1.375rem] font-bold text-neutral-800">
                {t("admin.title")}
              </h2>
            </div>
          </div>
          <p className="mb-5.5 text-[0.9375rem] text-neutral-600">{t("admin.sub")}</p>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-4.5">
            {ADMIN_CARDS.map(({ key, icon: Icon, chip }) => (
              <div
                key={key}
                className="rounded-[14px] border border-neutral-200 bg-white p-6 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-100 hover:shadow-md"
              >
                <span
                  className={`flex size-11.5 items-center justify-center rounded-xl ${chip}`}
                >
                  <Icon className="size-5.5" aria-hidden />
                </span>
                <h3 className="mt-4 font-heading text-[1.03125rem] leading-snug font-semibold text-neutral-800">
                  {t(`admin.cards.${key}.title`)}
                </h3>
                <p className="mt-1.5 text-sm leading-normal text-neutral-600">
                  {t(`admin.cards.${key}.desc`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Voter section */}
        <section className="mt-14">
          <div className="mb-1.5 flex items-center gap-3">
            <span className="flex size-8.5 items-center justify-center rounded-[9px] bg-success-700 text-white">
              <Users className="size-4.5" aria-hidden />
            </span>
            <div>
              <div className="text-xs font-bold tracking-widest text-neutral-400 uppercase">
                {t("voter.eyebrow")}
              </div>
              <h2 className="mt-0.5 font-heading text-[1.375rem] font-bold text-neutral-800">
                {t("voter.title")}
              </h2>
            </div>
          </div>
          <p className="mb-5.5 text-[0.9375rem] text-neutral-600">{t("voter.sub")}</p>

          {/* Delivery highlight — magic links + QR */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-3.5 rounded-xl border border-neutral-200 bg-white px-5 py-4.5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-brand-700">
                <Mail className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="font-heading text-[0.9375rem] font-semibold text-neutral-800">
                  {t("voter.magicTitle")}
                </div>
                <div className="mt-0.5 text-[0.84375rem] leading-normal text-neutral-600">
                  {t("voter.magicDesc")}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3.5 rounded-xl border border-neutral-200 bg-white px-5 py-4.5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-[#F5F3FF] text-[#6D28D9]">
                <QrCode className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="font-heading text-[0.9375rem] font-semibold text-neutral-800">
                  {t("voter.qrTitle")}
                </div>
                <div className="mt-0.5 text-[0.84375rem] leading-normal text-neutral-600">
                  {t("voter.qrDesc")}
                </div>
              </div>
            </div>
          </div>

          {/* 4-step voting flow */}
          <div className="rounded-[14px] border border-neutral-200 bg-white px-6 py-7 shadow-sm">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
              {VOTER_STEPS.map(({ key, icon: Icon, chip }, i) => (
                <div
                  key={key}
                  className="flex flex-col items-center px-2 text-center"
                >
                  <span
                    className={`flex size-13 items-center justify-center rounded-full ${chip}`}
                  >
                    <Icon className="size-5.5" aria-hidden />
                  </span>
                  <span className="-mt-2.5 flex size-5.5 items-center justify-center rounded-full border-2 border-white bg-neutral-800 font-heading text-[0.6875rem] font-bold text-white">
                    {i + 1}
                  </span>
                  <h3 className="mt-2.5 font-heading text-[0.9375rem] font-semibold text-neutral-800">
                    {t(`voter.steps.${key}.title`)}
                  </h3>
                  <p className="mt-1 text-[0.8125rem] leading-normal text-neutral-600">
                    {t(`voter.steps.${key}.desc`)}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex items-center gap-3 rounded-[10px] border border-[#D6F0DE] bg-success-50 px-4.5 py-3.5">
              <ShieldCheck
                className="size-5 shrink-0 text-success-700"
                aria-hidden
              />
              <span className="text-sm leading-normal text-[#33544A]">
                {t("voter.trustNote")}
              </span>
            </div>
          </div>
        </section>

        {/* CTA panel */}
        <div className="mt-13 rounded-2xl bg-brand-900 p-8 text-center shadow-lg sm:p-10">
          <h2 className="font-heading text-[1.625rem] leading-tight font-bold text-white">
            {t("cta.title")}
          </h2>
          <p className="mx-auto mt-3 max-w-130 text-base leading-normal text-white/70">
            {t("cta.sub")}
          </p>
          <div className="mt-6.5 flex flex-wrap justify-center gap-3">
            <Link
              href="/elections/new"
              className="inline-flex h-12.5 items-center gap-2 rounded-[9px] bg-brand-700 px-6.5 text-base font-semibold text-white transition-colors hover:bg-brand-600"
            >
              <Plus className="size-4.5" aria-hidden />
              {t("cta.primary")}
            </Link>
            <Link
              href="/home"
              className="inline-flex h-12.5 items-center gap-2 rounded-[9px] border border-white/25 px-6 text-base font-semibold text-white transition-colors hover:bg-white/10"
            >
              {t("cta.secondary")}
              <ChevronRight className="size-4.5" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
