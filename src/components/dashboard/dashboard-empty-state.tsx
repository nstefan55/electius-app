import { useTranslations } from "next-intl";
import {
  CircleCheckBig,
  Mail,
  QrCode,
  FileText,
  ShieldCheck,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const FEATURES: {
  key: string;
  Icon: LucideIcon;
  iconClass: string;
  pro: boolean;
}[] = [
  { key: "invites", Icon: Mail, iconClass: "bg-brand-50 text-brand-700", pro: false },
  { key: "qr", Icon: QrCode, iconClass: "bg-success-50 text-success-700", pro: false },
  { key: "reports", Icon: FileText, iconClass: "bg-brand-50 text-brand-700", pro: false },
  { key: "trust", Icon: ShieldCheck, iconClass: "bg-info-50 text-cyan-700", pro: false },
];

export function DashboardEmptyState() {
  const t = useTranslations("dashboard.empty");

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] items-center justify-center py-4">
      <div className="mx-auto w-full max-w-3xl text-center">
        <span className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-brand-50 text-brand-700 ring-8 ring-brand-700/5 sm:size-24">
          <CircleCheckBig className="size-9 sm:size-11" strokeWidth={2} />
        </span>

        <h1 className="font-heading text-[26px] leading-tight font-bold tracking-tight text-neutral-800 sm:text-[32px]">
          {t("title")}
        </h1>
        <p className="mx-auto mt-3.5 max-w-lg text-[15px] leading-relaxed text-muted-foreground sm:text-base">
          {t("subtitle")}
        </p>

        <div className="mt-7 flex justify-center">
          <Link
            href="/elections/new"
            className="inline-flex h-12 items-center gap-2.5 rounded-md bg-primary px-6 text-base font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-brand-600 focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
          >
            <Plus className="size-5" strokeWidth={2.2} />
            {t("cta")}
          </Link>
        </div>

        <div className="mt-10 border-t border-border pt-9 sm:mt-12">
          <div className="grid grid-cols-1 gap-4 text-left sm:grid-cols-2 sm:gap-5">
            {FEATURES.map(({ key, Icon, iconClass, pro }) => (
              <div
                key={key}
                className="flex gap-4 rounded-lg border border-border bg-card p-5 shadow-xs transition-all hover:-translate-y-1 duration-400 hover:border-brand-100 hover:shadow-sm"
              >
                <span
                  className={cn(
                    "flex size-10.5 shrink-0 items-center justify-center rounded-[10px]",
                    iconClass,
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-heading text-[15px] font-semibold text-neutral-800">
                      {t(`features.${key}.title`)}
                    </span>
                    {pro && (
                      <span className="inline-flex h-4.5 items-center rounded-full bg-violet-50 px-1.75 text-[10px] font-bold tracking-wide text-violet-700">
                        PRO
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[13px] leading-normal text-muted-foreground">
                    {t(`features.${key}.desc`)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="mx-auto mt-8 max-w-md text-xs leading-relaxed text-neutral-600">
          {t("trust")}
        </p>
      </div>
    </div>
  );
}
