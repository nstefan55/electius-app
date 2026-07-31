import { useTranslations } from "next-intl";
import { ShieldCheck, Hash, Clock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { LoginForm } from "@/components/auth/login-form";
import { SessionBounce } from "@/components/auth/session-bounce";

// Sign-in (auth-phase-4): split-screen design-system UI over the phase-1
// BetterAuth form. Unauthenticated dashboard-host traffic lands here via the
// proxy gate. LoginForm swaps in the OTP panel on a 403 (unverified account).
export default function LoginPage() {
  const t = useTranslations("auth.login");
  return (
    <AuthSplitLayout
      title={t("title")}
      subtitle={t("subtitle")}
      brand={{
        title: t("brand.title"),
        subtitle: t("brand.subtitle"),
        features: [
          {
            icon: ShieldCheck,
            title: t("brand.anonymity.title"),
            description: t("brand.anonymity.description"),
          },
          {
            icon: Hash,
            title: t("brand.verifiable.title"),
            description: t("brand.verifiable.description"),
          },
          {
            icon: Clock,
            title: t("brand.effortless.title"),
            description: t("brand.effortless.description"),
          },
        ],
      }}
    >
      <SessionBounce />
      <LoginForm />
      <p className="text-center text-sm text-neutral-600">
        {t("newTo")}{" "}
        <Link
          href="/signup"
          className="font-medium text-brand-700 hover:underline"
        >
          {t("createAccount")}
        </Link>
      </p>
    </AuthSplitLayout>
  );
}
