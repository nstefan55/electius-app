import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  Users,
  BarChart3,
  Archive,
  type LucideIcon,
} from "lucide-react";
import type { DashboardStats } from "@/lib/db/elections";
import { cn } from "@/lib/utils";

// Four summary stat cards: active elections, total voters, avg turnout, archived.
export function StatCards({ stats }: { stats: DashboardStats }) {
  const t = useTranslations("dashboard.page");

  const cards: {
    label: string;
    hint: string;
    hintClass: string;
    value: string;
    icon: LucideIcon;
    iconClass: string;
  }[] = [
    {
      label: t("stats.activeElections"),
      hint: t("stats.activeElectionsHint"),
      hintClass: "text-success-700",
      value: String(stats.activeElections),
      icon: CheckCircle2,
      iconClass: "bg-success-50 text-success-700",
    },
    {
      label: t("stats.totalVoters"),
      hint: t("stats.totalVotersHint"),
      hintClass: "text-muted-foreground",
      value: stats.totalVoters.toLocaleString("en-US"),
      icon: Users,
      iconClass: "bg-brand-50 text-brand-700",
    },
    {
      label: t("stats.avgTurnout"),
      hint: t("stats.avgTurnoutHint"),
      hintClass: "text-muted-foreground",
      value: `${stats.avgTurnout}%`,
      icon: BarChart3,
      iconClass: "bg-brand-50 text-brand-700",
    },
    {
      label: t("stats.archived"),
      hint: t("stats.archivedHint"),
      hintClass: "text-muted-foreground",
      value: String(stats.archived),
      icon: Archive,
      iconClass: "bg-neutral-100 text-neutral-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-lg border border-border bg-card px-6 py-5.5 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-muted-foreground">
              {c.label}
            </span>
            <span
              className={cn(
                "flex size-8.5 items-center justify-center rounded-full",
                c.iconClass,
              )}
            >
              <c.icon className="size-4.25" />
            </span>
          </div>
          <div className="mt-3.5 font-heading text-[34px] leading-none font-bold text-neutral-800">
            {c.value}
          </div>
          <div className={cn("mt-2 text-[13px]", c.hintClass)}>{c.hint}</div>
        </div>
      ))}
    </div>
  );
}
