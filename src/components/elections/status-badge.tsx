import { useTranslations } from "next-intl";
import { STATUS_STYLES, type ElectionStatus } from "@/lib/elections-view";
import { cn } from "@/lib/utils";

// Aggregate-root chrome status chip (design-system §7.9). Server component — reuses
// the shared STATUS_STYLES + the dashboard.page.status i18n labels the list uses.
// `md` is the election top bar's larger chip, where an ACTIVE election pulses to
// read as live (Election Overview.dc.html).
export function StatusBadge({
  status,
  size = "sm",
}: {
  status: ElectionStatus;
  size?: "sm" | "md";
}) {
  const t = useTranslations("dashboard.page");
  const style = STATUS_STYLES[status];
  const md = size === "md";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        md ? "h-7.5 px-3.5 text-[13px] font-semibold" : "h-5.5 px-2.5 text-xs",
        style.badge,
      )}
    >
      <span
        className={cn(
          "rounded-full",
          md ? "size-1.75" : "size-1.5",
          style.dot,
          md && status === "ACTIVE" && "animate-pulse",
        )}
      />
      {t(`status.${status}`)}
    </span>
  );
}
