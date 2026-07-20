import { useTranslations } from "next-intl";
import { ShieldCheck, Hash, Clock } from "lucide-react";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

// Reset password: landing page of the emailed reset link (?token=… or
// ?error=INVALID_TOKEN — the client form reads the query). Public on the
// dashboard host (proxy PUBLIC_AUTH_PATHS). Brand panel reuses the login copy.
export default function ResetPasswordPage() {
  const t = useTranslations("auth.reset");
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
      <ResetPasswordForm />
    </AuthSplitLayout>
  );
}
