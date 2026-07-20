import { useTranslations } from "next-intl";
import { ShieldCheck, Hash, Clock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

// Forgot password: email form → Resend-delivered reset link. Public on the
// dashboard host (proxy PUBLIC_AUTH_PATHS). Brand panel reuses the login copy —
// same auth family, one set of keys.
export default function ForgotPasswordPage() {
  const t = useTranslations("auth.forgot");
  const tl = useTranslations("auth.login");
  return (
    <AuthSplitLayout
      title={t("title")}
      subtitle={t("subtitle")}
      brand={{
        title: tl("brand.title"),
        subtitle: tl("brand.subtitle"),
        features: [
          {
            icon: ShieldCheck,
            title: tl("brand.anonymity.title"),
            description: tl("brand.anonymity.description"),
          },
          {
            icon: Hash,
            title: tl("brand.verifiable.title"),
            description: tl("brand.verifiable.description"),
          },
          {
            icon: Clock,
            title: tl("brand.effortless.title"),
            description: tl("brand.effortless.description"),
          },
        ],
      }}
    >
      <ForgotPasswordForm />
      <p className="text-center text-sm text-neutral-600">
        {t("backTo")}{" "}
        <Link
          href="/login"
          className="font-medium text-brand-700 hover:underline"
        >
          {t("backToLink")}
        </Link>
      </p>
    </AuthSplitLayout>
  );
}
