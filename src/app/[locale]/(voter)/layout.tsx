import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

// (voter) chrome — mobile-first, apex host (design-system §8.2). White 56px logo-only header
// with a neutral-200 bottom border; neutral-50 page background; a 390px (var(--max-width-voter))
// centered content container. ZERO admin chrome, no auth, no session read. The per-screen
// progress dots (§7.16) belong to the ballot flow content, not this layout.
//
// Podnožje s poveznicom na obavijest o obradi podataka odstupa od §8.2, koji
// podnožje ne crta. Odstupanje je namjerno i traženo: čl. 12. st. 1. GDPR-a
// traži da obavijest bude LAKO DOSTUPNA, a birač koji je obrisao pozivnicu
// inače nema nijedan put do nje. Jedan redak, ispod kartice, izvan toka
// glasovanja.
//
// `setRequestLocale` + izričiti `locale` u getTranslations nisu ukras: bez
// njih bi next-intl posegnuo za zaglavljem zahtjeva, a ovo se raspored
// renderira i u stablu /results/[id], jedine ISR rute u aplikaciji — ondje je
// čitanje zaglavlja fatalno (DYNAMIC_SERVER_USAGE, HTTP 500 na svaki zahtjev).
export default async function VoterLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "voter" });

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <header className="flex h-14 shrink-0 items-center justify-center gap-2 border-b border-neutral-200 bg-white">
        <Image
          src="/logo/logo-mark-light.png"
          alt="Electius"
          width={26}
          height={26}
          className="object-contain"
          priority
        />
        <span className="font-heading text-[1.1875rem] font-bold tracking-tight text-brand-900">
          Electius
        </span>
      </header>
      <main className="mx-auto w-full max-w-voter grow px-6 py-8">
        {children}
      </main>
      <footer className="mx-auto w-full max-w-voter px-6 pb-8 text-center">
        <Link
          href="/privacy/voters"
          className="text-xs text-neutral-600 underline underline-offset-2 hover:text-brand-700"
        >
          {t("noticeLink")}
        </Link>
      </footer>
    </div>
  );
}
