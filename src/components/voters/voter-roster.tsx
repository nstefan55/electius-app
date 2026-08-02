"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Menu } from "@base-ui/react/menu";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog } from "@base-ui/react/dialog";
import toast from "react-hot-toast";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  TriangleAlert,
  UserPlus,
  X,
} from "lucide-react";
import {
  removeVoter,
  resendVoterInvite,
  updateVoterName,
} from "@/actions/voters";
import { AddVotersDialog } from "@/components/voters/add-voters-dialog";
import { useRouter } from "@/i18n/navigation";
import type { RosterVoter, VoterRoster as Roster } from "@/lib/db/voters";
import type { ElectionStatus } from "@/lib/elections-view";
import { cn } from "@/lib/utils";

// Popis birača za /elections/[id]/voters (voter-management-spec). Bez vlastitog
// prototipa — tablica po design-system §7.13, značke §7.9, alatna traka
// preslikana s /elections.
//
// Anonimnost: redak pokazuje DA je birač glasao (status), nikad ŠTO — nema
// stupca s listićem ni vremena glasanja (batchOrder je nasumičan upravo zato).

const GRID = "md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_168px_64px]";

const MENU_ITEM =
  "flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm text-neutral-800 outline-none select-none data-highlighted:bg-neutral-100";

const STATUS_STYLE = {
  PENDING: { chip: "bg-neutral-100 text-neutral-600", dot: "bg-neutral-400" },
  INVITED: { chip: "bg-brand-100 text-brand-700", dot: "bg-brand-500" },
  VOTED: { chip: "bg-success-50 text-success-700", dot: "bg-success-500" },
} as const;

const STATUS_OPTIONS = ["PENDING", "INVITED", "VOTED"] as const;

export function VoterRoster({
  electionId,
  electionStatus,
  roster,
  query,
}: {
  electionId: string;
  electionStatus: ElectionStatus;
  roster: Roster;
  query: { q: string; status: string };
}) {
  const t = useTranslations("dashboard.voters");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState(query.q);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RosterVoter | null>(null);
  const [removeTarget, setRemoveTarget] = useState<RosterVoter | null>(null);
  const [resendTarget, setResendTarget] = useState<RosterVoter | null>(null);

  // Pretraga i filtar žive u URL-u, ne u stanju: uz poslužiteljsko stranicanje
  // filtriranje po dohvaćenoj stranici bi promašilo podudaranja na ostalima.
  function setParams(patch: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // Svaka promjena pretrage/filtra vraća na prvu stranicu.
    if (!("page" in patch)) next.delete("page");
    const qs = next.toString();
    router.replace(`/elections/${electionId}/voters${qs ? `?${qs}` : ""}`);
  }

  // Odgoda da svaki pritisak tipke ne pokrene upit.
  useEffect(() => {
    if (search === query.q) return;
    const timer = setTimeout(() => setParams({ q: search }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const { counts, voters, page, pageCount, matched } = roster;
  const filtering = Boolean(query.q || query.status);
  // Ista pravila kao akcije na poslužitelju — gumb koji uvijek pada nije ponuda.
  const canAdd = electionStatus !== "CLOSED" && electionStatus !== "ARCHIVED";
  const canRemove =
    electionStatus === "DRAFT" || electionStatus === "SCHEDULED";
  const canResend = electionStatus === "ACTIVE";
  const num = (n: number) =>
    n.toLocaleString(locale === "hr" ? "hr-HR" : "en-US");

  const run = (fn: () => Promise<{ success: boolean; error?: string }>, ok: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.success) toast.success(ok);
      else if (res.error === "windowOver") toast.error(t("toast.windowOver"));
      else toast.error(t(res.error === "invalidStatus" ? "toast.notAllowed" : "toast.failed"));
      router.refresh();
    });

  return (
    <div className="space-y-4 pb-4">
      {/* Sažetak — ista derivacija kao pregled izbora (voterCounts) */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-white px-5 py-4 shadow-sm">
        <Summary label={t("summary.total")} value={num(counts.total)} />
        <Summary label={t("summary.invited")} value={num(counts.invited)} />
        <Summary
          label={t("summary.voted")}
          value={num(counts.voted)}
          className="text-success-700"
        />
        <Summary label={t("summary.pending")} value={num(counts.pending)} />
        {canAdd && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="ml-auto inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-brand-600"
          >
            <UserPlus className="size-4.25" aria-hidden />
            {t("add.button")}
          </button>
        )}
      </div>

      {/* Alatna traka */}
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            {t("filters.search")}
          </span>
          <span className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400"
              aria-hidden
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("filters.searchPlaceholder")}
              maxLength={120}
              className="h-10 w-72 max-w-full rounded-md border border-border bg-white pr-3 pl-9 text-sm text-neutral-800 transition-colors outline-none focus:border-brand-700 focus:shadow-focus"
            />
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            {t("filters.status")}
          </span>
          <span className="relative">
            <select
              value={query.status}
              onChange={(e) => setParams({ status: e.target.value })}
              className="h-10 min-w-44 cursor-pointer appearance-none rounded-md border border-border bg-white pr-9 pl-3 text-sm text-neutral-800 transition-colors outline-none focus:border-brand-700 focus:shadow-focus"
            >
              <option value="">{t("filters.allStatuses")}</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-neutral-400"
              aria-hidden
            />
          </span>
        </label>

        {filtering && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setParams({ q: "", status: "" });
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border bg-white px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-neutral-100 hover:text-neutral-800"
          >
            <X className="size-3.75" />
            {t("filters.clear")}
          </button>
        )}

        <div className="ml-auto self-center text-[0.8125rem] text-muted-foreground">
          {filtering
            ? t("filters.showing", { shown: matched, total: counts.total })
            : t("filters.count", { total: counts.total })}
        </div>
      </div>

      {/* Tablica */}
      <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
        {counts.total === 0 ? (
          <Empty
            title={t("empty.title")}
            body={t("empty.body")}
            action={
              canAdd && (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-[0.9375rem] font-semibold text-primary-foreground transition-colors hover:bg-brand-600"
                >
                  <Plus className="size-4.5" />
                  {t("add.button")}
                </button>
              )
            }
          />
        ) : voters.length === 0 ? (
          <Empty title={t("empty.noMatchTitle")} body={t("empty.noMatchBody")} />
        ) : (
          <>
            <div
              className={cn(
                "hidden gap-4 border-b border-border bg-neutral-50 px-6 py-3 md:grid",
                GRID,
              )}
            >
              {(["name", "email", "status"] as const).map((col) => (
                <span
                  key={col}
                  className="font-heading text-[0.8125rem] font-semibold text-muted-foreground"
                >
                  {t(`columns.${col}`)}
                </span>
              ))}
              <span className="text-right font-heading text-[0.8125rem] font-semibold text-muted-foreground">
                {t("columns.actions")}
              </span>
            </div>

            <ul aria-busy={isPending}>
              {voters.map((v) => {
                const style = STATUS_STYLE[v.status];
                const fullName = [v.firstName, v.lastName]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <li
                    key={v.id}
                    className={cn(
                      "relative grid grid-cols-1 gap-1 border-b border-border px-6 py-3.5 transition-colors last:border-b-0 hover:bg-brand-50 md:items-center md:gap-4",
                      GRID,
                    )}
                  >
                    <div className="min-w-0 pr-10 font-heading text-[0.9375rem] font-semibold text-neutral-800 md:pr-0">
                      {fullName || (
                        <span className="font-body font-normal text-neutral-400">
                          {t("noName")}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 truncate font-mono text-[0.8125rem] text-muted-foreground">
                      {v.email}
                    </div>
                    <div>
                      <span
                        className={cn(
                          "inline-flex h-5.5 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
                          style.chip,
                        )}
                      >
                        <span
                          className={cn("size-1.5 rounded-full", style.dot)}
                        />
                        {t(`status.${v.status}`)}
                      </span>
                    </div>

                    <div className="absolute top-2.5 right-3 md:relative md:top-auto md:right-auto md:justify-self-end">
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
                            <Menu.Popup className="min-w-52 rounded-lg border border-border bg-white p-1.5 shadow-md outline-none">
                              {canResend && v.status !== "VOTED" && (
                                <Menu.Item
                                  className={MENU_ITEM}
                                  onClick={() => setResendTarget(v)}
                                >
                                  <Send className="size-4" />
                                  {t("actions.resend")}
                                </Menu.Item>
                              )}
                              <Menu.Item
                                className={MENU_ITEM}
                                onClick={() => setEditTarget(v)}
                              >
                                <Pencil className="size-4" />
                                {t("actions.edit")}
                              </Menu.Item>
                              {canRemove && v.status !== "VOTED" && (
                                <>
                                  <Menu.Separator className="my-1 h-px bg-border" />
                                  <Menu.Item
                                    className={cn(
                                      MENU_ITEM,
                                      "text-error-700 data-highlighted:bg-error-50",
                                    )}
                                    onClick={() => setRemoveTarget(v)}
                                  >
                                    <Trash2 className="size-4" />
                                    {t("actions.remove")}
                                  </Menu.Item>
                                </>
                              )}
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
      </div>

      {/* Stranicanje */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-[0.8125rem] text-muted-foreground">
            {t("pagination.page", { page, pages: pageCount })}
          </span>
          <div className="flex gap-2">
            <PageButton
              disabled={page <= 1}
              onClick={() => setParams({ page: String(page - 1) })}
              label={t("pagination.prev")}
              icon={<ChevronLeft className="size-4" />}
            />
            <PageButton
              disabled={page >= pageCount}
              onClick={() => setParams({ page: String(page + 1) })}
              label={t("pagination.next")}
              icon={<ChevronRight className="size-4" />}
              trailing
            />
          </div>
        </div>
      )}

      <AddVotersDialog
        electionId={electionId}
        electionStatus={electionStatus}
        open={addOpen}
        onOpenChange={setAddOpen}
      />

      <EditNameDialog
        voter={editTarget}
        onClose={() => setEditTarget(null)}
        onSave={(firstName, lastName) => {
          const id = editTarget?.id;
          setEditTarget(null);
          if (id)
            run(
              () => updateVoterName({ voterId: id, firstName, lastName }),
              t("toast.renamed"),
            );
        }}
      />

      {/* Ponovno slanje re-mint-a token, pa stara poveznica prestaje raditi —
          potvrda to mora reći, inače birač s dvije e-poruke klikne krivu. */}
      <ConfirmDialog
        open={resendTarget !== null}
        onClose={() => setResendTarget(null)}
        tone="brand"
        title={t("actions.resendTitle")}
        body={t("actions.resendBody", { email: resendTarget?.email ?? "" })}
        confirm={t("actions.resendConfirm")}
        cancel={t("actions.cancel")}
        onConfirm={() => {
          const id = resendTarget?.id;
          setResendTarget(null);
          if (id) run(() => resendVoterInvite(id), t("toast.resent"));
        }}
      />

      <ConfirmDialog
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        tone="error"
        title={t("actions.removeTitle")}
        body={t("actions.removeBody", { email: removeTarget?.email ?? "" })}
        confirm={t("actions.removeConfirm")}
        cancel={t("actions.cancel")}
        onConfirm={() => {
          const id = removeTarget?.id;
          setRemoveTarget(null);
          if (id) run(() => removeVoter(id), t("toast.removed"));
        }}
      />
    </div>
  );
}

function Summary({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div
        className={cn(
          "font-heading text-xl font-semibold text-neutral-800",
          className,
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="font-heading text-base font-semibold text-neutral-800">
        {title}
      </div>
      <div className="mt-1.5 text-sm text-muted-foreground">{body}</div>
      {action}
    </div>
  );
}

function PageButton({
  disabled,
  onClick,
  label,
  icon,
  trailing,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  trailing?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border bg-white px-3.5 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {!trailing && icon}
      {label}
      {trailing && icon}
    </button>
  );
}

// Ime je jedino promjenjivo polje — e-mail je identitet birača.
function EditNameDialog({
  voter,
  onClose,
  onSave,
}: {
  voter: RosterVoter | null;
  onClose: () => void;
  onSave: (firstName: string, lastName: string) => void;
}) {
  const t = useTranslations("dashboard.voters.edit");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");

  // Ponovno napuni polja kad se otvori drugi birač.
  const [prev, setPrev] = useState<string | null>(null);
  if (voter && voter.id !== prev) {
    setPrev(voter.id);
    setFirst(voter.firstName ?? "");
    setLast(voter.lastName ?? "");
  }

  return (
    <Dialog.Root
      open={voter !== null}
      onOpenChange={(open) => {
        if (!open) {
          setPrev(null);
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-white p-6 shadow-lg outline-none">
          <Dialog.Title className="font-heading text-xl font-semibold text-neutral-800">
            {t("title")}
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 font-mono text-[0.8125rem] text-muted-foreground">
            {voter?.email}
          </Dialog.Description>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-sm font-medium text-neutral-800">
                {t("firstName")}
              </span>
              <input
                value={first}
                autoFocus
                onChange={(e) => setFirst(e.target.value)}
                maxLength={100}
                className="h-11 w-full rounded-md border border-border bg-white px-3 text-sm text-neutral-800 outline-none focus:border-brand-700 focus:shadow-focus"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-medium text-neutral-800">
                {t("lastName")}
              </span>
              <input
                value={last}
                onChange={(e) => setLast(e.target.value)}
                maxLength={100}
                className="h-11 w-full rounded-md border border-border bg-white px-3 text-sm text-neutral-800 outline-none focus:border-brand-700 focus:shadow-focus"
              />
            </label>
          </div>
          <p className="mt-3 text-[0.8125rem] text-muted-foreground">
            {t("emailNote")}
          </p>

          <div className="mt-6 flex justify-end gap-3">
            <Dialog.Close className="inline-flex h-11 items-center rounded-md px-5 text-[0.9375rem] font-medium text-muted-foreground transition-colors hover:bg-neutral-100">
              {t("cancel")}
            </Dialog.Close>
            <button
              type="button"
              onClick={() => onSave(first.trim(), last.trim())}
              className="inline-flex h-11 items-center rounded-md bg-primary px-5.5 text-[0.9375rem] font-semibold text-primary-foreground transition-colors hover:bg-brand-600"
            >
              {t("save")}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  tone,
  title,
  body,
  confirm,
  cancel,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  tone: "brand" | "error";
  title: string;
  body: string;
  confirm: string;
  cancel: string;
}) {
  const isError = tone === "error";
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-white p-6 shadow-lg outline-none">
          <div className="flex gap-3.5">
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full",
                isError
                  ? "bg-error-50 text-error-700"
                  : "bg-brand-50 text-brand-700",
              )}
            >
              {isError ? (
                <TriangleAlert className="size-5" />
              ) : (
                <Send className="size-5" />
              )}
            </span>
            <div className="min-w-0">
              <AlertDialog.Title className="font-heading text-xl font-semibold text-neutral-800">
                {title}
              </AlertDialog.Title>
              <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {body}
              </AlertDialog.Description>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <AlertDialog.Close className="inline-flex h-11 items-center rounded-md px-5 text-[0.9375rem] font-medium text-muted-foreground transition-colors hover:bg-neutral-100">
              {cancel}
            </AlertDialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              className={cn(
                "inline-flex h-11 items-center rounded-md px-5.5 text-[0.9375rem] font-semibold text-white transition-colors",
                isError
                  ? "bg-error-700 hover:bg-error-500"
                  : "bg-brand-700 hover:bg-brand-600",
              )}
            >
              {confirm}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
