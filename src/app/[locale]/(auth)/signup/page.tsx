import { useTranslations } from "next-intl";
import { ClipboardList, BarChart3, FileCheck2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { SignupForm } from "@/components/auth/signup-form";

// Sign-up (auth-phase-4): split-screen design-system UI over the phase-3
// registration wiring; success → /setup → /onboarding → "/".
export default function SignupPage() {
  const t = useTranslations("auth.signup");
  return (
    <AuthSplitLayout
      title={t("title")}
      subtitle={t("subtitle")}
      brand={{
        title: t("brand.title"),
        subtitle: t("brand.subtitle"),
        features: [
          {
            icon: ClipboardList,
            title: t("brand.guided.title"),
            description: t("brand.guided.description"),
          },
          {
            icon: BarChart3,
            title: t("brand.turnout.title"),
            description: t("brand.turnout.description"),
          },
          {
            icon: FileCheck2,
            title: t("brand.reports.title"),
            description: t("brand.reports.description"),
          },
        ],
      }}
    >
      <SignupForm />
      <p className="text-center text-sm text-neutral-600">
        {t("haveAccount")}{" "}
        <Link
          href="/login"
          className="font-medium text-brand-700 hover:underline"
        >
          {t("signIn")}
        </Link>
      </p>
    </AuthSplitLayout>
  );
}
