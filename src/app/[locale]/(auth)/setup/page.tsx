import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

// Boilerplate (routing Phase 2). Real profile setup content = its own spec.
// TODO(auth-spec): require a session here (else → "/login"); on success → "/onboarding".
export default function SetupPage() {
  const t = useTranslations("auth");
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
      <h1 className="text-2xl font-semibold text-neutral-800">{t("setup.title")}</h1>
      <p className="text-sm text-neutral-600">{t("setup.subtitle")}</p>
      <p className="text-xs text-warning-700">{t("todo")}</p>
      <Link
        href="/onboarding"
        className="mt-2 text-sm font-medium text-brand-700 hover:underline"
      >
        {t("setup.continue")}
      </Link>
    </div>
  );
}
