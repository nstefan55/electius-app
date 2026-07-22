import Image from "next/image";
import { headers } from "next/headers";
import { Poppins, Noto_Sans, Roboto_Mono } from "next/font/google";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";
import { NotFoundCard } from "@/components/ui/not-found-card";
import { notFoundCopy } from "@/lib/not-found-copy";
import { isDashboardHost } from "@/proxy";

// Same font setup as [locale]/layout.tsx — this page renders its own <html>,
// so it needs its own font loading too (the "404" numeral + heading are the
// whole point of the redesign; a serif system-font fallback looked broken).
const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700"],
  variable: "--font-poppins",
});
const notoSans = Noto_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-noto-sans",
});
const robotoMono = Roboto_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-roboto-mono",
});

// True app-root fallback for genuinely unmatched URLs — our root layout
// (src/app/[locale]/layout.tsx) sits behind a dynamic segment, so a normal
// nested not-found.tsx can't catch this case (confirmed empirically); this is
// the framework's documented fix for exactly that topology (Next 16,
// experimental.globalNotFound). Needs its own <html>/<body> — no [locale]
// layout renders here, so no NextIntlClientProvider either (NotFoundCard's
// link is a plain <a>, not next-intl's Link, for exactly this reason). The
// next-intl plugin still resolves the locale from the URL for
// getTranslations/getLocale even outside the [locale] segment.
//
// Unlike (app)/not-found.tsx and (voter)/not-found.tsx, this placement has no
// existing chrome to sit inside, so it adopts the 404-page-redesign-spec
// design's own standalone header + footer instead of just the content card.
export default async function GlobalNotFound() {
  const host = (await headers()).get("host") ?? "";
  const dashboard = isDashboardHost(host);
  const [t, locale] = await Promise.all([
    getTranslations("notFound"),
    getLocale(),
  ]);
  const homeHref = dashboard ? `/${locale}/home` : `/${locale}`;
  return (
    <html
      lang={locale}
      className={`${poppins.variable} ${notoSans.variable} ${robotoMono.variable}`}
    >
      <body className="flex min-h-screen flex-col bg-neutral-50 font-sans">
        <header className="flex h-14 shrink-0 items-center border-b border-neutral-200 bg-white px-6">
          <a href={homeHref} className="flex items-center gap-2.5">
            <Image
              src="/logo/logo-mark-light.png"
              alt="Electius"
              width={30}
              height={30}
              className="object-contain"
              priority
            />
            <span className="font-heading text-lg font-bold tracking-tight text-brand-900">
              Electius
            </span>
          </a>
        </header>
        <main className="flex flex-1 items-center justify-center p-6">
          <NotFoundCard
            badge={t("badge")}
            {...notFoundCopy(t, "generic")}
            homeLabel={t("cta")}
            homeHref={homeHref}
            backLabel={t("back")}
          />
        </main>
        <footer className="flex shrink-0 justify-center p-5">
          <span className="text-xs text-neutral-600">{t("footerTagline")}</span>
        </footer>
      </body>
    </html>
  );
}
