import Image from "next/image";
import { useTranslations } from "next-intl";
import { signInUrl, signUpUrl } from "@/lib/urls";

// (marketing) chrome — the THIRD chrome (apex host), distinct from the admin shell
// (design-system §8.1) and the voter chrome (§8.2). SCAFFOLD: minimal header + footer only;
// full copy/visual design is owned by the marketing-landing spec. No sidebar, no auth,
// no session read. Cross-host CTAs go through src/lib/urls.ts (never a hardcoded host).
export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const t = useTranslations("marketing");
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <header className="flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-6">
        <a href="/" className="flex items-center gap-2.5">
          <Image
            src="/logo/logo-mark.png"
            alt="Electious"
            width={30}
            height={30}
            className="object-contain"
            priority
          />
          <span className="font-heading text-xl font-bold tracking-tight text-neutral-800">
            Electious
          </span>
        </a>
        <nav className="flex items-center gap-4">
          <a
            href={signInUrl()}
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            {t("signIn")}
          </a>
          <a
            href={signUpUrl()}
            className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            {t("signUp")}
          </a>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      {/* SCAFFOLD — footer content owned by the marketing-landing spec. */}
      <footer className="border-t border-neutral-200 px-6 py-8 text-center text-xs text-neutral-600">
        © Electious
      </footer>
    </div>
  );
}
