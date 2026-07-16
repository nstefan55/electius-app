import { useTranslations } from "next-intl";
import { SignupForm } from "@/components/auth/signup-form";

// Functional sign-up (auth-phase-3): POST /api/auth/register (BetterAuth
// signUpEmail + scrypt) or Google OAuth; success → /setup → /onboarding → "/".
// TODO(auth-ui-spec): full design-system signup screen (OTP, terms).
export default function SignupPage() {
  const t = useTranslations("auth");
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-neutral-800">
          {t("signup.title")}
        </h1>
        <p className="text-sm text-neutral-600">{t("signup.subtitle")}</p>
      </div>
      <SignupForm />
    </div>
  );
}
