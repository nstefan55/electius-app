"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Menu } from "@base-ui/react/menu";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import toast from "react-hot-toast";
import {
  Maximize2,
  MoreVertical,
  Pencil,
  Copy,
  Archive,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  sortRecent,
  STATUS_STYLES,
  type DashboardElection,
} from "@/lib/elections-view";
import {
  renameElection,
  duplicateElection,
  archiveElection,
  deleteElection,
} from "@/actions/elections";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Shared grid track so the column header and body rows line up
const GRID = "md:grid-cols-[minmax(0,1fr)_120px_190px_130px_44px]";

const MENU_ITEM =
  "flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm text-neutral-800 outline-none select-none data-highlighted:bg-neutral-100";

export function RecentElections({
  elections,
}: {
  elections: DashboardElection[];
}) {
  const t = useTranslations("dashboard.page");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Re-sync local optimistic rows when props change (e.g. after router.refresh()).
  // Adjusting state during render — not in an effect — avoids a cascading re-render.
  const [rows, setRows] = useState(() => sortRecent(elections));
  const [prevElections, setPrevElections] = useState(elections);
  if (elections !== prevElections) {
    setPrevElections(elections);
    setRows(sortRecent(elections));
  }

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const cancelRename = useRef(false); // Escape sets this so the blur-commit is skipped

  const activeCount = rows.filter((e) => e.status === "ACTIVE").length;

  const run = (fn: () => Promise<{ success: boolean }>, onOk: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (res.success) {
        onOk();
        router.refresh();
      } else {
        toast.error(t("actions.toast.error"));
        router.refresh(); // pull back the authoritative rows on failure
      }
    });

  function startRename(e: DashboardElection) {
    setEditingId(e.id);
    setEditValue(e.name);
    // focus after the input mounts
    requestAnimationFrame(() => editRef.current?.select());
  }

  function commitRename(id: string) {
    if (cancelRename.current) {
      cancelRename.current = false;
      setEditingId(null);
      return;
    }
    const name = editValue.trim();
    const current = rows.find((r) => r.id === id);
    if (!name) {
      toast.error(t("actions.toast.renameEmpty"));
      return;
    }
    setEditingId(null);
    if (!current || current.name === name) return; // no change → skip the round trip
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, name } : r)));
    run(
      () => renameElection(id, name),
      () => toast.success(t("actions.toast.renamed")),
    );
  }

  function onDuplicate(id: string) {
    run(
      () => duplicateElection(id),
      () => toast.success(t("actions.toast.duplicated")),
    );
  }

  function onArchive(id: string) {
    setRows((rs) => rs.filter((r) => r.id !== id)); // archived drops off the dashboard
    run(
      () => archiveElection(id),
      () => toast.success(t("actions.toast.archived")),
    );
  }

  function onConfirmDelete() {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleteTarget(null);
    setRows((rs) => rs.filter((r) => r.id !== id));
    run(
      () => deleteElection(id),
      () => toast.success(t("actions.toast.deleted")),
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-5">
        <div>
          <h3 className="font-heading text-xl font-semibold text-neutral-800">
            {t("list.title")}
          </h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("list.count", { count: rows.length, active: activeCount })}
          </p>
        </div>
        <Link
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-brand-500"
          href="/elections"
        >
          {t("list.viewAll")}
          <Maximize2 className="size-4" />
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <div className="font-heading text-base font-semibold text-neutral-800">
            {t("list.empty")}
          </div>
          <div className="mt-1.5 text-sm text-muted-foreground">
            {t("list.emptyHint")}
          </div>
        </div>
      ) : (
        <>
          {/* Column header — hidden on mobile, where rows stack. */}
          <div
            className={cn(
              "hidden gap-4 border-b border-border bg-neutral-50 px-6 py-3 md:grid",
              GRID,
            )}
          >
            {(["election", "status", "turnout", "window"] as const).map(
              (col) => (
                <span
                  key={col}
                  className="font-heading text-[13px] font-semibold text-muted-foreground"
                >
                  {t(`list.columns.${col}`)}
                </span>
              ),
            )}
            <span aria-hidden />
          </div>

          <ul aria-busy={isPending}>
            {rows.map((e) => {
              const style = STATUS_STYLES[e.status];
              const pct =
                e.voters > 0 ? Math.round((e.voted / e.voters) * 100) : 0;
              const isEditing = editingId === e.id;
              return (
                <li
                  key={e.id}
                  className={cn(
                    "relative grid grid-cols-1 gap-2 border-b border-border px-6 py-4 transition-colors last:border-b-0 hover:bg-brand-50 md:items-center md:gap-4",
                    GRID,
                  )}
                >
                  {/* Name + type (inline-editable) */}
                  <div className="min-w-0 pr-10 md:pr-0">
                    {isEditing ? (
                      <input
                        ref={editRef}
                        value={editValue}
                        autoFocus
                        onChange={(ev) => setEditValue(ev.target.value)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") commitRename(e.id);
                          if (ev.key === "Escape") {
                            cancelRename.current = true;
                            setEditingId(null);
                          }
                        }}
                        onBlur={() => commitRename(e.id)}
                        aria-label={t("actions.renamePlaceholder")}
                        className="w-full rounded-md border border-brand-700 bg-white px-2.5 py-1.5 font-heading text-[15px] font-semibold text-neutral-800 shadow-focus outline-none"
                      />
                    ) : (
                      <>
                        <div className="truncate font-heading text-[15px] font-semibold text-neutral-800">
                          {e.name}
                        </div>
                        <div className="mt-0.5 text-[13px] text-muted-foreground">
                          {e.type}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Status */}
                  <div>
                    <span
                      className={cn(
                        "inline-flex h-5.5 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
                        style.badge,
                      )}
                    >
                      <span className={cn("size-1.5 rounded-full", style.dot)} />
                      {t(`status.${e.status}`)}
                    </span>
                  </div>

                  {/* Turnout */}
                  <div className="flex items-center gap-2.5">
                    <div className="h-1.5 max-w-30 flex-1 overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className={cn(
                          "h-full rounded-full transition-[width] duration-500 ease-out",
                          style.bar,
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="min-w-13.5 text-[13px] font-semibold text-neutral-800">
                      {e.voters > 0 ? `${pct}%` : "—"}
                    </span>
                  </div>

                  {/* Voting window */}
                  <div className="text-[13px] text-muted-foreground">
                    {e.opens} – {e.closes}
                  </div>

                  {/* Row actions — absolute top-right on mobile, last cell on desktop */}
                  <div className="absolute top-3 right-3 md:static md:justify-self-end">
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
                          <Menu.Popup className="min-w-44 rounded-lg border border-border bg-white p-1.5 shadow-md outline-none">
                            <Menu.Item
                              className={MENU_ITEM}
                              onClick={() => startRename(e)}
                            >
                              <Pencil className="size-4" />
                              {t("actions.rename")}
                            </Menu.Item>
                            <Menu.Item
                              className={MENU_ITEM}
                              onClick={() => onDuplicate(e.id)}
                            >
                              <Copy className="size-4" />
                              {t("actions.duplicate")}
                            </Menu.Item>
                            <Menu.Item
                              className={MENU_ITEM}
                              onClick={() => onArchive(e.id)}
                            >
                              <Archive className="size-4" />
                              {t("actions.archive")}
                            </Menu.Item>
                            <Menu.Separator className="my-1 h-px bg-border" />
                            <Menu.Item
                              className={cn(
                                MENU_ITEM,
                                "text-error-700 data-highlighted:bg-error-50",
                              )}
                              onClick={() =>
                                setDeleteTarget({ id: e.id, name: e.name })
                              }
                            >
                              <Trash2 className="size-4" />
                              {t("actions.delete")}
                            </Menu.Item>
                          </Menu.Popup>
                        </Menu.Positioner>
                      </Menu.Portal>
                    </Menu.Root>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Delete confirmation */}
      <AlertDialog.Root
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
          <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-white p-6 shadow-lg outline-none">
            <div className="flex gap-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-error-50 text-error-700">
                <TriangleAlert className="size-5" />
              </span>
              <div className="min-w-0">
                <AlertDialog.Title className="font-heading text-xl font-semibold text-neutral-800">
                  {t("actions.deleteTitle")}
                </AlertDialog.Title>
                <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t("actions.deleteBody", { name: deleteTarget?.name ?? "" })}
                </AlertDialog.Description>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <AlertDialog.Close className="inline-flex h-11 items-center rounded-md px-5 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-neutral-100">
                {t("actions.cancel")}
              </AlertDialog.Close>
              <button
                type="button"
                onClick={onConfirmDelete}
                className="inline-flex h-11 items-center rounded-md bg-error-700 px-5.5 text-[15px] font-semibold text-white transition-colors hover:bg-error-500"
              >
                {t("actions.confirmDelete")}
              </button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
