"use client";

import { useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Menu } from "@base-ui/react/menu";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import toast from "react-hot-toast";
import {
  Copy,
  Eye,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  formatVotingDate,
  STATUS_STYLES,
  type DashboardElection,
} from "@/lib/elections-view";
import {
  renameElection,
  duplicateElection,
  deleteElection,
} from "@/actions/elections";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Shared grid track so the column header and body rows line up (design: Elections.dc.html)
const GRID = "md:grid-cols-[minmax(0,1fr)_128px_208px_172px_80px]";

const MENU_ITEM =
  "flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm text-neutral-800 outline-none select-none data-highlighted:bg-neutral-100";

export function ElectionsList({
  elections,
}: {
  elections: DashboardElection[];
}) {
  const t = useTranslations("dashboard.electionsPage");
  const tp = useTranslations("dashboard.page");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Re-sync local optimistic rows when props change (e.g. after router.refresh()).
  // Adjusting state during render — not in an effect — avoids a cascading re-render.
  const [rows, setRows] = useState(elections);
  const [prevElections, setPrevElections] = useState(elections);
  if (elections !== prevElections) {
    setPrevElections(elections);
    setRows(elections);
  }

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const cancelRename = useRef(false); // Escape sets this so the blur-commit is skipped

  const run = (fn: () => Promise<{ success: boolean }>, onOk: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (res.success) {
        onOk();
        router.refresh();
      } else {
        toast.error(tp("actions.toast.error"));
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
      toast.error(tp("actions.toast.renameEmpty"));
      return;
    }
    setEditingId(null);
    if (!current || current.name === name) return; // no change → skip the round trip
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, name } : r)));
    run(
      () => renameElection(id, name),
      () => toast.success(tp("actions.toast.renamed")),
    );
  }

  function onDuplicate(id: string) {
    run(
      () => duplicateElection(id),
      () => toast.success(tp("actions.toast.duplicated")),
    );
  }

  function onConfirmDelete() {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleteTarget(null);
    setRows((rs) => rs.filter((r) => r.id !== id));
    run(
      () => deleteElection(id),
      () => toast.success(tp("actions.toast.deleted")),
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      {rows.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <div className="font-heading text-base font-semibold text-neutral-800">
            {tp("list.empty")}
          </div>
          <div className="mt-1.5 text-sm text-muted-foreground">
            {tp("list.emptyHint")}
          </div>
          <Link
            href="/elections/new"
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-brand-600"
          >
            <Plus className="size-4.5" />
            {tp("newElection")}
          </Link>
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
            {(["election", "status"] as const).map((col) => (
              <span
                key={col}
                className="font-heading text-[13px] font-semibold text-muted-foreground"
              >
                {tp(`list.columns.${col}`)}
              </span>
            ))}
            <span className="font-heading text-[13px] font-semibold text-muted-foreground">
              {t("columns.turnout")}
            </span>
            <span className="font-heading text-[13px] font-semibold text-muted-foreground">
              {tp("list.columns.window")}
            </span>
            <span className="text-right font-heading text-[13px] font-semibold text-muted-foreground">
              {t("columns.actions")}
            </span>
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
                        aria-label={tp("actions.renamePlaceholder")}
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
                      {tp(`status.${e.status}`)}
                    </span>
                  </div>

                  {/* Turnout — % + votes-of label above the bar (design) */}
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-heading text-[15px] font-semibold text-neutral-800">
                        {e.voters > 0 ? `${pct}%` : "—"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {e.voters > 0
                          ? t("votesOf", { voted: e.voted, voters: e.voters })
                          : t("noVoters")}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 max-w-40 overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className={cn(
                          "h-full rounded-full transition-[width] duration-500 ease-out",
                          style.bar,
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Voting window — schema requires startsAt/endsAt, so drafts carry
                      placeholder dates; "not scheduled" is a display rule on DRAFT. */}
                  <div className="text-[13px] text-muted-foreground">
                    {e.status === "DRAFT"
                      ? t("notScheduled")
                      : `${formatVotingDate(e.opens, locale)} – ${formatVotingDate(e.closes, locale)}`}
                  </div>

                  {/* Row actions — absolute top-right on mobile, last cell on desktop */}
                  <div className="absolute top-3 right-3 md:static md:justify-self-end">
                    <Menu.Root>
                      <Menu.Trigger
                        aria-label={tp("actions.menuLabel")}
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
                          <Menu.Popup className="min-w-46 rounded-lg border border-border bg-white p-1.5 shadow-md outline-none">
                            <Menu.Item
                              className={MENU_ITEM}
                              onClick={() => router.push(`/elections/${e.id}`)}
                            >
                              <Eye className="size-4" />
                              {t("viewResults")}
                            </Menu.Item>
                            <Menu.Item
                              className={MENU_ITEM}
                              onClick={() => startRename(e)}
                            >
                              <Pencil className="size-4" />
                              {tp("actions.rename")}
                            </Menu.Item>
                            <Menu.Item
                              className={MENU_ITEM}
                              onClick={() => onDuplicate(e.id)}
                            >
                              <Copy className="size-4" />
                              {tp("actions.duplicate")}
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
                              {tp("actions.delete")}
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
                  {tp("actions.deleteTitle")}
                </AlertDialog.Title>
                <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {tp("actions.deleteBody", { name: deleteTarget?.name ?? "" })}
                </AlertDialog.Description>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <AlertDialog.Close className="inline-flex h-11 items-center rounded-md px-5 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-neutral-100">
                {tp("actions.cancel")}
              </AlertDialog.Close>
              <button
                type="button"
                onClick={onConfirmDelete}
                className="inline-flex h-11 items-center rounded-md bg-error-700 px-5.5 text-[15px] font-semibold text-white transition-colors hover:bg-error-500"
              >
                {tp("actions.confirmDelete")}
              </button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
