import Image from "next/image";
import { useTranslations } from "next-intl";
import type { LucideIcon } from "lucide-react";
import { CONTACT_EMAIL, marketingHomeUrl, privacyUrl } from "@/lib/urls";

// Split-screen auth chrome (auth-phase-4), ported from the design prototypes
// (context/design/electius-app-auth-pages-design): form panel left, navy
// brand-900 feature panel right (hidden below lg, where the footer links move
// into the form panel instead). Server component — pages pass localized copy.
// Pravila privatnosti su prava, MEĐUHOSTOVSKA poveznica: stranica živi na
// apeksu, a ovaj je zaslon na dashboard hostu (relativni /privacy ondje završi
// na prijavi — vidi privacyUrl()). Uvjeti korištenja ostaju običan tekst dok
// im stranica ne postoji: poveznica koja ne vodi nikamo je poveznica koja laže,
// isto pravilo kao u stupcu povjerenja u marketinškom podnožju.
// ponytail: the prototype's language link is skipped (switcher is gated,
// destined for Settings).

interface BrandFeature {
  icon: LucideIcon;
  title: string;
  description: string;
}

interface AuthSplitLayoutProps {
  title: string;
  subtitle: string;
  brand: {
    title: string;
    subtitle: string;
    features: BrandFeature[];
  };
  children: React.ReactNode;
}

function FooterLinks({ variant }: { variant: "light" | "dark" }) {
  const t = useTranslations("auth.footer");
  // Podcrtane su i U MIROVANJU, ne tek na hover: otkad `muted` ima istu tintu
  // (zbog kontrasta, niže), boja više ne razlikuje poveznicu od običnog teksta,
  // a hover na dodirnom zaslonu ne postoji. Podcrtavanje je jedini signal koji
  // radi bez boje i bez pokazivača.
  const link =
    variant === "dark"
      ? "text-white/65 underline underline-offset-2 hover:text-white"
      : "text-neutral-600 underline underline-offset-2 hover:text-brand-700";
  // Ista tinta kao poveznice, samo bez podcrtavanja na hover. Da NIJE poveznica
  // već govore izostanak tog affordancea i izostanak pokazivača — boja tu nije
  // nosila ništa osim pada kontrasta. `neutral-400` na bijelom je 2,5:1, a
  // `white/45` na brand-900 3,7:1; oba padaju AA za tekst od 13 px (prag 4,5:1),
  // a `globals.css` popravlja `neutral-400` samo pod postavkom visokog
  // kontrasta, koju odjavljeni posjetitelj na /signup nikad nema. Naziv pravnog
  // dokumenta na koji tražimo kvačicu ne smije biti ispisan rezerviranom tintom.
  const muted = variant === "dark" ? "text-white/65" : "text-neutral-600";
  return (
    <>
      <a href={privacyUrl()} className={link}>
        {t("privacy")}
      </a>
      <span className={muted}>{t("terms")}</span>
      <a href={`mailto:${CONTACT_EMAIL}`} className={link}>
        {CONTACT_EMAIL}
      </a>
    </>
  );
}

export function AuthSplitLayout({
  title,
  subtitle,
  brand,
  children,
}: AuthSplitLayoutProps) {
  return (
    <div className="flex min-h-screen bg-white">
      {/* Form panel */}
      <div className="flex min-w-0 flex-1 flex-col p-6 lg:px-12 lg:py-8">
        {/* Cross-host anchor (not <Link>) — the marketing landing lives on the apex host. */}
        <a
          href={marketingHomeUrl()}
          className="flex items-center gap-2.5 self-start"
        >
          <Image
            src="/logo/logo-mark-light.png"
            alt="Electius"
            width={34}
            height={34}
            className="object-contain"
            priority
          />
          <span className="font-heading text-xl font-bold tracking-tight text-brand-900">
            Electius
          </span>
        </a>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="flex w-full max-w-100 flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h1 className="font-heading text-[1.75rem] font-semibold text-neutral-800">
                {title}
              </h1>
              <p className="text-[0.9375rem] leading-normal text-neutral-600">
                {subtitle}
              </p>
            </div>
            {children}
          </div>
        </div>

        {/* Mobile footer — the brand panel (with its own footer) is hidden below lg. */}
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 pt-4 text-[0.8125rem] lg:hidden">
          <FooterLinks variant="light" />
        </div>
      </div>

      {/* Brand panel */}
      <div className="hidden min-w-0 flex-1 flex-col bg-brand-900 px-16 pt-16 pb-10 lg:flex">
        <div className="my-auto flex max-w-115 flex-col gap-10">
          <div className="flex flex-col gap-3">
            <h2 className="font-heading text-[2rem] leading-tight font-semibold text-white">
              {brand.title}
            </h2>
            <p className="text-base leading-relaxed text-white/75">
              {brand.subtitle}
            </p>
          </div>
          <div className="flex flex-col gap-7">
            {brand.features.map(({ icon: Icon, title: featureTitle, description }) => (
              <div key={featureTitle} className="flex items-start gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="size-5 text-brand-500" aria-hidden />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[0.9375rem] font-semibold text-white">
                    {featureTitle}
                  </span>
                  <span className="text-sm leading-relaxed text-white/70">
                    {description}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[0.8125rem]">
          <FooterLinks variant="dark" />
        </div>
      </div>
    </div>
  );
}
