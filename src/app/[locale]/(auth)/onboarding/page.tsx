import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

// Boilerplate (routing Phase 2). Real how-it-works content = onboarding-page.md spec.
// TODO(auth-spec): require a session here (else → "/login"); on finish → "/".
// Centering lives here since auth-phase-4 — login/signup own a full-screen design.
export default function OnboardingPage() {
  const t = useTranslations("auth");
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <h1 className="text-2xl font-semibold text-neutral-800">
          {t("onboarding.title")}
        </h1>
        <p className="text-sm text-neutral-600">{t("onboarding.subtitle")}</p>
        <p className="text-xs text-warning-700">{t("todo")}</p>
        <Link
          href="/"
          className="mt-2 text-sm font-medium text-brand-700 hover:underline"
        >
          {t("onboarding.continue")}
        </Link>
      </div>
    </main>
  );
}
