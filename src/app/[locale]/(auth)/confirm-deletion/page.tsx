import { useTranslations } from "next-intl";
import { ShieldCheck, Hash, Clock } from "lucide-react";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { ConfirmDeletionPanel } from "@/components/auth/confirm-deletion-panel";

// Odredište poveznice iz e-pošte za brisanje računa (?token=…). Javna na
// dashboard hostu (proxy PUBLIC_AUTH_PATHS) — mora se otvoriti i bez sesije,
// jer je "otvorio sam poštu na mobitelu" najčešći ishod. Panel vlada svakim
// stanjem i sam zove BetterAuthov callback. Brand panel preuzima copy prijave,
// isto kao /reset-password.
export default function ConfirmDeletionPage() {
  const t = useTranslations("auth.confirmDeletion");
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
      <ConfirmDeletionPanel />
    </AuthSplitLayout>
  );
}
