import { useTranslations } from "next-intl";
import { STATUS_STYLES, type ElectionStatus } from "@/lib/elections-view";
import { cn } from "@/lib/utils";

// Aggregate-root chrome status chip (design-system §7.9). Server component — reuses
// the shared STATUS_STYLES + the dashboard.page.status i18n labels the list uses.
export function StatusBadge({ status }: { status: ElectionStatus }) {
  const t = useTranslations("dashboard.page");
  const style = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex h-5.5 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
        style.badge,
      )}
    >
      <span className={cn("size-1.5 rounded-full", style.dot)} />
      {t(`status.${status}`)}
    </span>
  );
}
