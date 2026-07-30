"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Menu } from "@base-ui/react/menu";
import toast from "react-hot-toast";
import {
  MoreVertical,
  Eye,
  FileText,
  ScrollText,
  EyeOff,
  Trash2,
  Search,
  X,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { StatusBadge } from "@/components/elections/status-badge";
import {
  formatVotingDate,
  matchesQuery,
  type DashboardElection,
} from "@/lib/elections-view";
import { cn } from "@/lib/utils";

const MENU_ITEM =
  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-neutral-700 outline-none data-highlighted:bg-neutral-100";

// ARCHIVED-elections list with inline row actions and NO detail route (archive rows
// funnel to /elections/[id]/results). Scaffold: View details navigates; Export PDF /
// Audit log / Hide / Delete are placeholders (owned by results + archive-filtering specs).
//
// Naslov stranice živi ovdje, a ne na serverskoj stranici, jer pretraga stoji desno
// u istom redu i dijeli stanje s listom.
export function ArchiveList({ elections }: { elections: DashboardElection[] }) {
  const t = useTranslations("dashboard.election.lists.archive");
  const locale = useLocale();
  const soon = (label: string) => toast(t("comingSoon", { action: label }));

  const [query, setQuery] = useState("");
  const hasQuery = query.trim() !== "";
  // Lista je nepaginirana — filtriranje na klijentu ne može sakriti pogodak.
  const rows = useMemo(
    () => elections.filter((e) => matchesQuery(e, query)),
    [elections, query],
  );

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-semibold text-neutral-800">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-neutral-600">{t("subtitle")}</p>
        </div>
        {elections.length > 0 && (
          <div className="flex h-11 w-85 max-w-[42vw] items-center gap-2.5 rounded-[10px] border border-border bg-white px-3.5 transition-colors focus-within:border-brand-700 focus-within:shadow-focus">
            <Search className="size-4.5 shrink-0 text-neutral-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t("searchLabel")}
              placeholder={t("searchPlaceholder")}
              className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-neutral-800 outline-none placeholder:text-neutral-400 [&::-webkit-search-cancel-button]:hidden"
            />
            {hasQuery && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("clearSearch")}
                className="flex size-6.5 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-600 transition-colors hover:bg-neutral-200 hover:text-neutral-800"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </header>

      {elections.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-neutral-50 p-6 text-sm text-neutral-600">
          {t("empty")}
        </p>
      ) : (
        <>
          <p className="mb-4 text-[13px] text-neutral-600">
            {hasQuery
              ? t("resultFiltered", {
                  count: rows.length,
                  total: elections.length,
                })
              : t("resultAll", { count: elections.length })}
          </p>

          {rows.length === 0 ? (
            <div className="rounded-lg border border-border bg-white px-6 py-16 text-center shadow-sm">
              <div className="mx-auto mb-4.5 flex size-13 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
                <Search className="size-6" />
              </div>
              <p className="font-heading text-[17px] font-semibold text-neutral-800">
                {t("emptyTitle", { query: query.trim() })}
              </p>
              <p className="mt-1.5 text-sm text-neutral-600">{t("emptyBody")}</p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-5 h-10 rounded-md bg-brand-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                {t("clearSearch")}
              </button>
            </div>
          ) : (
            <ul className="overflow-hidden rounded-lg border border-border bg-white">
              {rows.map((e) => {
                const pct =
                  e.voters > 0 ? Math.round((e.voted / e.voters) * 100) : 0;
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
                        {formatVotingDate(e.closes, locale)} · {e.voted}/
                        {e.voters} ({pct}%)
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
                        <Menu.Positioner
                          side="bottom"
                          align="end"
                          sideOffset={6}
                          className="z-50 outline-none"
                        >
                          <Menu.Popup className="min-w-48 rounded-lg border border-border bg-white p-1.5 shadow-md outline-none">
                            <Menu.Item
                              className={MENU_ITEM}
                              render={<Link href={`/elections/${e.id}/results`} />}
                            >
                              <Eye className="size-4" />
                              {t("actions.view")}
                            </Menu.Item>
                            <Menu.Item
                              className={MENU_ITEM}
                              onClick={() => soon(t("actions.exportPdf"))}
                            >
                              <FileText className="size-4" />
                              {t("actions.exportPdf")}
                            </Menu.Item>
                            <Menu.Item
                              className={MENU_ITEM}
                              onClick={() => soon(t("actions.auditLog"))}
                            >
                              <ScrollText className="size-4" />
                              {t("actions.auditLog")}
                            </Menu.Item>
                            <Menu.Item
                              className={MENU_ITEM}
                              onClick={() => soon(t("actions.hide"))}
                            >
                              <EyeOff className="size-4" />
                              {t("actions.hide")}
                            </Menu.Item>
                            <Menu.Separator className="my-1 h-px bg-border" />
                            <Menu.Item
                              className={cn(
                                MENU_ITEM,
                                "text-error-700 data-highlighted:bg-error-50",
                              )}
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
          )}
        </>
      )}
    </>
  );
}
