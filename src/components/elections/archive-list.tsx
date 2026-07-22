"use client";

import { useLocale, useTranslations } from "next-intl";
import { Menu } from "@base-ui/react/menu";
import toast from "react-hot-toast";
import { MoreVertical, Eye, FileText, ScrollText, EyeOff, Trash2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { StatusBadge } from "@/components/elections/status-badge";
import {
  formatVotingDate,
  type DashboardElection,
} from "@/lib/elections-view";
import { cn } from "@/lib/utils";

const MENU_ITEM =
  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-neutral-700 outline-none data-highlighted:bg-neutral-100";

// ARCHIVED-elections list with inline row actions and NO detail route (archive rows
// funnel to /elections/[id]/results). Scaffold: View details navigates; Export PDF /
// Audit log / Hide / Delete are placeholders (owned by results + archive-filtering specs).
export function ArchiveList({ elections }: { elections: DashboardElection[] }) {
  const t = useTranslations("dashboard.election.lists.archive");
  const locale = useLocale();
  const soon = (label: string) => toast(t("comingSoon", { action: label }));

  if (elections.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-neutral-50 p-6 text-sm text-neutral-600">
        {t("empty")}
      </p>
    );
  }

  return (
    <ul className="overflow-hidden rounded-lg border border-border bg-white">
      {elections.map((e) => {
        const pct = e.voters > 0 ? Math.round((e.voted / e.voters) * 100) : 0;
        return (
          <li
            key={e.id}
            className="flex items-center gap-4 border-b border-border px-6 py-4 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-heading text-[15px] font-semibold text-neutral-800">
                {e.name}
              </div>
              <div className="mt-0.5 text-[13px] text-muted-foreground">
                {formatVotingDate(e.opens, locale)} –{" "}
                {formatVotingDate(e.closes, locale)} · {e.voted}/{e.voters} (
                {pct}%)
              </div>
            </div>
            <StatusBadge status={e.status} />
            <Menu.Root>
              <Menu.Trigger
                aria-label={t("actions.menuLabel")}
                className="flex size-8.5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-neutral-100 data-popup-open:bg-neutral-100"
              >
                <MoreVertical className="size-4.5" />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50 outline-none">
                  <Menu.Popup className="min-w-48 rounded-lg border border-border bg-white p-1.5 shadow-md outline-none">
                    <Menu.Item
                      className={MENU_ITEM}
                      render={<Link href={`/elections/${e.id}/results`} />}
                    >
                      <Eye className="size-4" />
                      {t("actions.view")}
                    </Menu.Item>
                    <Menu.Item className={MENU_ITEM} onClick={() => soon(t("actions.exportPdf"))}>
                      <FileText className="size-4" />
                      {t("actions.exportPdf")}
                    </Menu.Item>
                    <Menu.Item className={MENU_ITEM} onClick={() => soon(t("actions.auditLog"))}>
                      <ScrollText className="size-4" />
                      {t("actions.auditLog")}
                    </Menu.Item>
                    <Menu.Item className={MENU_ITEM} onClick={() => soon(t("actions.hide"))}>
                      <EyeOff className="size-4" />
                      {t("actions.hide")}
                    </Menu.Item>
                    <Menu.Separator className="my-1 h-px bg-border" />
                    <Menu.Item
                      className={cn(MENU_ITEM, "text-error-700 data-highlighted:bg-error-50")}
                      onClick={() => soon(t("actions.delete"))}
                    >
                      <Trash2 className="size-4" />
                      {t("actions.delete")}
                    </Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </li>
        );
      })}
    </ul>
  );
}
