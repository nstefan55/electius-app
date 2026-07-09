import { useTranslations } from "next-intl";
import { signInUrl, signUpUrl } from "@/lib/urls";

// Apex landing — owns the real "/" (root-collision: marketing owns /, the dashboard overview
// stays a real page at /dashboard — domain-architecture-spec §3). SCAFFOLD: hero + the two
// cross-host CTAs only; full landing copy/visual design is owned by the marketing-landing spec.
// CTAs are plain <a> built from src/lib/urls.ts (apex → dashboard host), never the same-host <Link>.
export default function Home() {
  const t = useTranslations("marketing");
  return (
    <div className="mx-auto flex max-w-content flex-col items-center justify-center gap-6 px-8 py-24 text-center">
      <h1 className="font-heading text-4xl font-bold text-neutral-800">
        {t("hero.title")}
      </h1>
      <p className="max-w-xl text-lg text-neutral-600">{t("hero.subtitle")}</p>
      <div className="flex items-center gap-4">
        <a
          href={signUpUrl()}
          className="rounded-md bg-brand-700 px-6 py-3 text-base font-medium text-white hover:bg-brand-600"
        >
          {t("signUp")}
        </a>
        <a
          href={signInUrl()}
          className="text-base font-medium text-brand-700 hover:underline"
        >
          {t("signIn")}
        </a>
      </div>
    </div>
  );
}
