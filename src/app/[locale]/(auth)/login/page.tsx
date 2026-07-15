import { useTranslations } from "next-intl";
import { LoginForm } from "@/components/auth/login-form";

// Functional sign-in (auth-phase-1): BetterAuth email/password + Google OAuth.
// Unauthenticated dashboard-host traffic lands here via the proxy gate.
// TODO(auth-ui-spec): full design-system login screen (OTP, forgot password).
export default function LoginPage() {
  const t = useTranslations("auth");
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-neutral-800">
          {t("login.title")}
        </h1>
        <p className="text-sm text-neutral-600">{t("login.subtitle")}</p>
      </div>
      <LoginForm />
    </div>
  );
}
