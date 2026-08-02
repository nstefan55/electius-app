import Image from "next/image";
import { useTranslations } from "next-intl";
import type { LucideIcon } from "lucide-react";
import { marketingHomeUrl } from "@/lib/urls";

// Split-screen auth chrome (auth-phase-4), ported from the design prototypes
// (context/design/electius-app-auth-pages-design): form panel left, navy
// brand-900 feature panel right (hidden below lg, where the footer links move
// into the form panel instead). Server component — pages pass localized copy.
// ponytail: privacy/terms links are "#" until the legal pages exist; the
// prototype's language link is skipped (switcher is gated, destined for Settings).

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
  const link =
    variant === "dark"
      ? "text-white/65 hover:text-white hover:underline"
      : "text-neutral-600 hover:underline";
  return (
    <>
      <a href="#" className={link}>
        {t("privacy")}
      </a>
      <a href="#" className={link}>
        {t("terms")}
      </a>
      <a href="mailto:contact@electius.com" className={link}>
        contact@electius.com
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
