"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog } from "@base-ui/react/dialog";
import {
  Archive,
  ArrowLeft,
  CirclePause,
  Download,
  Eye,
  FileText,
  Pencil,
  Printer,
  Trash2,
  X,
} from "lucide-react";
import {
  archiveElection,
  closeElection,
  deleteElection,
} from "@/actions/elections";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { StatusBadge } from "@/components/elections/status-badge";
import { ArchiveConfirmDialog } from "@/components/elections/archive-confirm-dialog";
import {
  formatVotingDateTime,
  resultsDetailAccess,
  shortRoot,
  type ElectionStatus,
  type ResultsMode,
} from "@/lib/elections-view";

// Election top bar — the aggregate-root chrome for /elections/[id]
// (election-overview-phase-1-spec, design: Election Overview.dc.html).
// Client component because every action but Exit opens a modal or mutates.
//
// Action visibility is purely status-driven, straight from the spec:
//   Edit    DRAFT | SCHEDULED   (editing a running election is not allowed)
//   Close   ACTIVE only         (ends the window early, irreversible)
//   Archive CLOSED only         (seals the record — there is no unseal)
//   Remove  everything BUT ACTIVE
// Preview + Exit are always available.
export interface BallotOption {
  id: string;
  text: string;
  description: string | null;
}

interface ElectionTopbarProps {
  id: string;
  title: string;
  status: ElectionStatus;
  resultsMode: ResultsMode;
  opens: string; // ISO
  closes: string; // ISO
  orgName: string;
  multiChoice: boolean;
  options: BallotOption[];
}

const GHOST_BTN =
  "inline-flex h-9.5 cursor-pointer items-center gap-1.75 rounded-md border border-border bg-white px-3.5 text-sm font-semibold text-neutral-800 transition-colors hover:bg-neutral-100";
const DANGER_BTN =
  "inline-flex h-9.5 cursor-pointer items-center gap-1.75 rounded-md border border-error-500/40 bg-white px-3.5 text-sm font-semibold text-error-700 transition-colors hover:border-error-500 hover:bg-error-50";

export function ElectionTopbar({
  id,
  title,
  status,
  resultsMode,
  opens,
  closes,
  orgName,
  multiChoice,
  options,
}: ElectionTopbarProps) {
  const t = useTranslations("dashboard.election.topbar");
  // Namjerno posuđuje iz namespacea popisa: zapečaćeno objašnjenje i redak
  // statusa moraju glasiti IDENTIČNO ovdje i u modalu na /results — dva
  // prijevoda istog pravila razišla bi se prvom izmjenom.
  const tr = useTranslations("dashboard.resultsPage");
  // Pečat: oznaka i poruke iz namespacea ⋯ izbornika — ista radnja na četiri mjesta.
  const ta = useTranslations("dashboard.page.actions");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname(); // bez prefiksa lokalizacije — odgovara ravnim hrefovima
  const [preview, setPreview] = useState(false);
  const [confirm, setConfirm] = useState<"close" | "remove" | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const showEdit = status === "DRAFT" || status === "SCHEDULED";
  const showClose = status === "ACTIVE";
  const showArchive = status === "CLOSED";
  const showRemove = status !== "ACTIVE";

  // Pregled PDF izvještaja je cjelostranični podprikaz: vlastita traka (natrag +
  // ispis), bez statusa, kartica i akcija nad izborima. Izlazi se prije računanja
  // stanja obične trake — ondje se ništa od toga ne prikazuje.
  const reportHref = `/elections/${id}/results/report`;
  if (pathname === reportHref) {
    return (
      <ReportTopbar
        id={id}
        backHref={`/elections/${id}/results`}
        title={title}
      />
    );
  }

  // Kartica rezultata dobiva vlastiti podnaslov i gumbe za izvoz; ostale
  // kartice ostaju nepromijenjene (election-results-id-phase-1-spec).
  const onResults = pathname === `/elections/${id}/results`;
  const access = onResults ? resultsDetailAccess({ status, resultsMode }) : null;
  const subtitle = !access
    ? t("subtitle")
    : access === "closed"
      ? tr("lineClosed", { date: formatVotingDateTime(closes, locale) })
      : tr(access === "live" ? "lineLive" : "lineSealed");
  // Izvoz prati stranicu: zapečaćeni izbori ne prikazuju zbroj, pa ni gumbe.
  const showExports = access !== null && access !== "sealed";
  // Unscheduled drafts carry endsAt === startsAt (wizard placeholder rule).
  const closeLabel =
    closes === opens ? t("notScheduled") : formatVotingDateTime(closes, locale);

  const handleClose = () =>
    startTransition(async () => {
      const res = await closeElection(id);
      setConfirm(null);
      if (res.success) {
        toast.success(t("closeDone"));
        router.refresh(); // top bar re-renders as CLOSED (Remove replaces Close)
      } else {
        toast.error(
          t(res.error === "invalidStatus" ? "errors.notActive" : "errors.failed"),
        );
      }
    });

  const handleRemove = () =>
    startTransition(async () => {
      const res = await deleteElection(id);
      setConfirm(null);
      if (res.success) {
        toast.success(t("removeDone"));
        router.push("/elections"); // this election no longer exists
      } else {
        toast.error(t("errors.failed"));
      }
    });

  // Pokreće se iz ArchiveConfirmDialog (isti dijalog kao u popisima); pečat
  // ništa ne uklanja, ali se ne može poništiti, pa se prije pita.
  const handleArchive = () =>
    startTransition(async () => {
      const res = await archiveElection(id);
      if (res.success) {
        toast.success(ta("toast.sealed", { root: shortRoot(res.merkleRoot) }));
        router.refresh(); // traka se ponovno iscrtava kao ARCHIVED
      } else {
        toast.error(
          ta(
            res.error === "invalidStatus"
              ? "toast.archiveNotClosed"
              : "toast.error",
          ),
        );
      }
    });

  return (
    <>
      <header className="-mx-8 -mt-8 mb-6 flex min-h-19 flex-wrap items-center justify-between gap-5 border-b border-border bg-neutral-50 px-8 py-3.5 print:hidden">
        <div className="min-w-0">
          <h1 className="truncate font-heading text-xl font-semibold text-neutral-800">
            {title}
          </h1>
          <p className="mt-0.75 text-[0.8125rem] text-neutral-600">{subtitle}</p>
        </div>

        {/* Bez shrink-0: inače se red drži max-content širine i flex-wrap se nikad ne aktivira. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <StatusBadge status={status} size="md" />

          {showEdit && (
            <button
              type="button"
              // ponytail: no edit route exists yet — the wizard only creates.
              // Placeholder until the wizard grows an edit mode (see
              // docs/post-mvp-feature-list.md).
              onClick={() => toast(t("editSoon"))}
              className={GHOST_BTN}
            >
              <Pencil className="size-4" aria-hidden />
              {t("edit")}
            </button>
          )}

          <button
            type="button"
            onClick={() => setPreview(true)}
            className={GHOST_BTN}
          >
            <Eye className="size-4" aria-hidden />
            {t("preview")}
          </button>

          {showClose && (
            <button
              type="button"
              onClick={() => setConfirm("close")}
              className={DANGER_BTN}
            >
              <CirclePause className="size-4" aria-hidden />
              {t("close")}
            </button>
          )}

          {showArchive && (
            <button
              type="button"
              onClick={() => setArchiveOpen(true)}
              disabled={pending}
              className={`${GHOST_BTN} disabled:cursor-not-allowed disabled:opacity-40`}
            >
              <Archive className="size-4" aria-hidden />
              {ta("archive")}
            </button>
          )}

          {showRemove && (
            <button
              type="button"
              onClick={() => setConfirm("remove")}
              className={DANGER_BTN}
            >
              <Trash2 className="size-4" aria-hidden />
              {t("remove")}
            </button>
          )}

          {showExports && (
            <>
              <Link href={reportHref} className={GHOST_BTN}>
                <FileText className="size-4" aria-hidden />
                {tr("pdf")}
              </Link>
              {/* Obični <a>: Content-Disposition preuzima datoteku sam, pa ne
                  treba fetch → blob → sintetički klik. */}
              <a
                href={`/api/elections/${id}/results/export?locale=${locale}`}
                className={GHOST_BTN}
              >
                <Download className="size-4" aria-hidden />
                {t("exportCsv")}
              </a>
            </>
          )}

          <Link
            href="/elections"
            aria-label={t("exit")}
            title={t("exit")}
            className="flex size-11 items-center justify-center rounded-md border border-border bg-white text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
          >
            <X className="size-4.5" aria-hidden />
          </Link>
        </div>
      </header>

      <BallotPreview
        open={preview}
        onOpenChange={setPreview}
        title={title}
        orgName={orgName}
        multiChoice={multiChoice}
        options={options}
      />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        variant={confirm ?? "close"}
        title={confirm === "remove" ? t("removeTitle") : t("closeTitle")}
        body={
          confirm === "remove"
            ? t("removeBody")
            : t("closeBody", { date: closeLabel })
        }
        cancel={t("cancel")}
        confirm={confirm === "remove" ? t("removeConfirm") : t("closeConfirm")}
        pending={pending}
        onConfirm={confirm === "remove" ? handleRemove : handleClose}
      />

      <ArchiveConfirmDialog
        target={archiveOpen ? { id, name: title } : null}
        pending={pending}
        onOpenChange={(open) => !open && setArchiveOpen(false)}
        onConfirm={() => {
          setArchiveOpen(false);
          handleArchive();
        }}
      />
    </>
  );
}

// Traka pregleda PDF izvještaja. Jedan gumb, ne dva: pod isporukom preko ispisa
// preglednika "Otvori cijeli PDF" i "Preuzmi PDF" otvaraju isti dijalog, a gumb
// koji laže da radi nešto drugo gori je od nepostojećeg.
// Dva gumba, jer rade dvije različite stvari: Ispis predaje list ispisnom
// motoru preglednika, Preuzmi traži poslužiteljski render koji se za zatvorene
// izbore i sprema. Jedan gumb za oboje bio bi laž o jednom od njih.
function ReportTopbar({
  id,
  backHref,
  title,
}: {
  id: string;
  backHref: string;
  title: string;
}) {
  const t = useTranslations("dashboard.election.report");
  const locale = useLocale();
  const [downloading, setDownloading] = useState(false);

  // fetch + blob, ne obični <a href>: pad iscrtavanja tako daje lokaliziranu
  // poruku umjesto stranice greške preglednika.
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await fetch(
        `/api/elections/${id}/report/pdf?locale=${locale}`,
      );
      if (!response.ok) {
        toast.error(
          t(response.status === 429 ? "downloadRateLimited" : "downloadFailed"),
        );
        return;
      }
      // Ime datoteke dolazi iz Content-Disposition — jedan izvor s poslužiteljem.
      const disposition = response.headers.get("content-disposition") ?? "";
      const name = disposition.match(/filename="([^"]+)"/)?.[1] ?? "report.pdf";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("downloadFailed"));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <header className="-mx-8 -mt-8 mb-6 flex min-h-19 flex-wrap items-center justify-between gap-5 border-b border-border bg-neutral-50 px-8 py-3.5 print:hidden">
      <div className="flex min-w-0 items-center gap-3.5">
        <Link
          href={backHref}
          aria-label={t("back")}
          title={t("back")}
          className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-white text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
        >
          <ArrowLeft className="size-4.5" aria-hidden />
        </Link>
        <div className="min-w-0">
          <h1 className="font-heading text-xl font-semibold text-neutral-800">
            {t("title")}
          </h1>
          <p className="mt-0.75 truncate text-[0.8125rem] text-neutral-600">
            {title}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" onClick={() => window.print()} className={GHOST_BTN}>
          <Printer className="size-4" aria-hidden />
          {t("print")}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-brand-700 px-4.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="size-4" aria-hidden />
          {downloading ? t("downloading") : t("download")}
        </button>
      </div>
    </header>
  );
}

function BallotPreview({
  open,
  onOpenChange,
  title,
  orgName,
  multiChoice,
  options,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  orgName: string;
  multiChoice: boolean;
  options: BallotOption[];
}) {
  const t = useTranslations("dashboard.election.topbar.previewModal");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-3rem)] w-[calc(100%-2rem)] max-w-105 -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-neutral-50 shadow-lg outline-none">
          <div className="flex items-center justify-between border-b border-border bg-white px-5 py-4">
            <div className="flex items-center gap-2">
              <Image
                src="/logo/logo-mark.png"
                alt=""
                width={22}
                height={22}
                className="h-5.5 w-auto"
              />
              <span className="font-heading text-sm font-bold text-brand-900">
                Electius
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-neutral-100 px-2.25 py-0.75 text-xs font-semibold text-neutral-600">
                {t("badge")}
              </span>
              <Dialog.Close
                aria-label={t("close")}
                className="flex size-8 cursor-pointer items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100"
              >
                <X className="size-4" aria-hidden />
              </Dialog.Close>
            </div>
          </div>

          <div className="px-5.5 py-6">
            <p className="text-[0.78125rem] text-neutral-600">{orgName}</p>
            <Dialog.Title className="font-heading text-lg leading-snug font-semibold text-neutral-800">
              {title}
            </Dialog.Title>
            <Dialog.Description className="mt-2 mb-4.5 text-[0.84375rem] leading-relaxed text-neutral-600">
              {t(multiChoice ? "promptMulti" : "promptSingle")}
            </Dialog.Description>

            {options.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-white px-4 py-6 text-center text-sm text-neutral-600">
                {t("noOptions")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {options.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center gap-3 rounded-xl border-1.5 border-border bg-white px-4 py-3.75"
                  >
                    <span
                      className={`size-5.5 shrink-0 border-2 border-neutral-200 ${multiChoice ? "rounded-sm" : "rounded-full"}`}
                    />
                    <div className="min-w-0">
                      <div className="text-[0.90625rem] font-semibold text-neutral-800">
                        {o.text}
                      </div>
                      {o.description && (
                        <div className="text-[0.78125rem] text-neutral-600">
                          {o.description}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Inert on purpose — this is a mockup of the voter's ballot, not one. */}
            <button
              type="button"
              disabled
              className="mt-5 h-12 w-full cursor-not-allowed rounded-lg bg-brand-700 text-[0.9375rem] font-semibold text-white opacity-85"
            >
              {t("submit")}
            </button>
            <p className="mt-3.5 text-center text-[0.71875rem] leading-relaxed text-neutral-600">
              {t("trust")}
            </p>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ConfirmDialog({
  open,
  onOpenChange,
  variant,
  title,
  body,
  cancel,
  confirm,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: "close" | "remove";
  title: string;
  body: string;
  cancel: string;
  confirm: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  const Icon = variant === "remove" ? Trash2 : CirclePause;
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-105 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-white p-7 text-center shadow-lg outline-none">
          <div className="mx-auto mb-4 flex size-15 items-center justify-center rounded-full bg-error-50 text-error-700">
            <Icon className="size-7" aria-hidden />
          </div>
          <AlertDialog.Title className="font-heading text-xl font-bold text-neutral-800">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2.5 text-sm leading-relaxed text-neutral-600">
            {body}
          </AlertDialog.Description>
          <div className="mt-6 flex gap-3">
            <AlertDialog.Close className="inline-flex h-11.5 flex-1 cursor-pointer items-center justify-center rounded-md border border-border bg-white text-[0.90625rem] font-semibold text-neutral-800 transition-colors hover:bg-neutral-100">
              {cancel}
            </AlertDialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="inline-flex h-11.5 flex-1 cursor-pointer items-center justify-center rounded-md bg-error-700 text-[0.90625rem] font-semibold text-white transition-colors hover:bg-error-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {confirm}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
