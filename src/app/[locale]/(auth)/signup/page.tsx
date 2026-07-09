import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

// Boilerplate (routing Phase 2). Real signup (BetterAuth + Google OAuth + OTP) = separate auth spec.
// TODO(auth-spec): bounce to "/" if already signed in; on success → "/setup".
export default function SignupPage() {
  const t = useTranslations("auth");
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
      <h1 className="text-2xl font-semibold text-neutral-800">{t("signup.title")}</h1>
      <p className="text-sm text-neutral-600">{t("signup.subtitle")}</p>
      <p className="text-xs text-warning-700">{t("todo")}</p>
      <Link
        href="/setup"
        className="mt-2 text-sm font-medium text-brand-700 hover:underline"
      >
        {t("signup.continue")}
      </Link>
    </div>
  );
}
