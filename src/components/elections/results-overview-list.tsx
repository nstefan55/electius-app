"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Dialog } from "@base-ui/react/dialog";
import {
  ChevronRight,
  CircleCheck,
  Download,
  Eye,
  FileText,
  List,
  Lock,
  Rows2,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  formatVotingDateTime,
  type ResultsAccess,
  type ResultsRow,
} from "@/lib/elections-view";
import { cn } from "@/lib/utils";

// Popis rezultata po izborima (dizajn: Results Overview.dc.html).
//
// Namjerno NE koristi STATUS_STYLES: značka ovdje opisuje dostupnost rezultata,
// a ne status izbora, pa je zatvoreno sivo (neutralno, gotovo), ne crveno.
const ACCESS_STYLES: Record<
  ResultsAccess,
  { badge: string; dot: string; line: string; pulse: boolean }
> = {
  live: {
    badge: "bg-success-50 text-success-700",
    dot: "bg-success-500",
    line: "text-success-500",
    pulse: true,
  },
  sealed: {
    badge: "bg-warning-50 text-warning-700",
    dot: "bg-warning-500",
    line: "text-warning-700",
    pulse: false,
  },
  closed: {
    badge: "bg-neutral-100 text-neutral-600",
    dot: "bg-neutral-400",
    line: "text-neutral-400",
    pulse: false,
  },
};

const ACCESS_ICON = { live: Eye, sealed: Lock, closed: CircleCheck } as const;

type Layout = "cards" | "rows";

export function ResultsOverviewList({ rows }: { rows: ResultsRow[] }) {
  const t = useTranslations("dashboard.resultsPage");
  // Preferencija prikaza, ne filtar — lokalno stanje, ne URL parametar.
  const [layout, setLayout] = useState<Layout>("cards");
  const [sealed, setSealed] = useState<ResultsRow | null>(null);

  // Širinu i padding daje DashboardShell (max-w-content) — bez vlastitog okvira.
  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="font-heading text-[28px] leading-tight font-bold tracking-[-0.01em] text-neutral-800">
            {t("title")}
          </h1>
          <p className="mt-2 text-[15px] text-neutral-600">
            {t("summary", { count: rows.length })}
          </p>
        </div>

        {rows.length > 0 && (
          <div className="flex items-center gap-2.5">
            <span className="text-[12.5px] font-semibold text-neutral-600">
              {t("layout")}
            </span>
            <div className="flex items-center gap-0.5 rounded-[9px] border border-neutral-200 bg-white p-[3px]">
              <LayoutButton
                active={layout === "cards"}
                onClick={() => setLayout("cards")}
                icon={<Rows2 className="size-[15px]" />}
                label={t("cards")}
              />
              <LayoutButton
                active={layout === "rows"}
                onClick={() => setLayout("rows")}
                icon={<List className="size-[15px]" />}
                label={t("rows")}
              />
            </div>
          </div>
        )}
      </header>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-200 bg-white p-6 text-sm text-neutral-600">
          {t("empty")}
        </p>
      ) : layout === "cards" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-[18px]">
          {rows.map((row) => (
            <ResultsCard key={row.id} row={row} onSealed={setSealed} />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
          {rows.map((row) => (
            <ResultsRowItem key={row.id} row={row} onSealed={setSealed} />
          ))}
        </div>
      )}

      <p className="mt-5 px-0.5 text-xs text-neutral-600">{t("footnote")}</p>

      <SealedDialog row={sealed} onClose={() => setSealed(null)} />
    </div>
  );
}

function LayoutButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-[7px] rounded-md px-[13px] text-[13px] font-semibold transition-colors",
        active
          ? "bg-brand-700 text-white"
          : "text-neutral-600 hover:bg-neutral-100",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// Zajednička značka + redak statusa za obje varijante prikaza.
function useRowParts(row: ResultsRow) {
  const t = useTranslations("dashboard.resultsPage");
  const locale = useLocale();
  const style = ACCESS_STYLES[row.access];
  const Icon = ACCESS_ICON[row.access];

  const line =
    row.access === "closed"
      ? t("lineClosed", { date: formatVotingDateTime(row.closes, locale) })
      : t(row.access === "live" ? "lineLive" : "lineSealed");

  return { t, style, Icon, line };
}

function StatusChip({
  row,
  compact,
}: {
  row: ResultsRow;
  compact?: boolean;
}) {
  const { t, style } = useRowParts(row);
  return (
    <span
      className={cn(
        "inline-flex flex-shrink-0 items-center gap-1.5 rounded-full font-semibold whitespace-nowrap",
        style.badge,
        compact ? "h-[22px] px-2.5 text-[11.5px]" : "h-6 px-[11px] text-xs",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          style.dot,
          style.pulse && "animate-pulse",
        )}
      />
      {t(`status.${row.access}`)}
    </span>
  );
}

// Prečaci u izvoze pojedinih izbora. Zapečaćeni redak ostaje onemogućen — isto
// pravilo kao obje odredišne rute, koje za njega vraćaju 404.
//
// PDF vodi na pregled izvještaja (lokalizirani Link), CSV izravno na preuzimanje
// (obični <a> — /api je izvan [locale] segmenta i Content-Disposition preuzima
// datoteku sam). Onemogućen redak nema poveznicu, pa ostaje <button disabled>.
function ExportButtons({ row }: { row: ResultsRow }) {
  const t = useTranslations("dashboard.resultsPage");
  const locale = useLocale();
  const disabled = row.access === "sealed";

  // whitespace-nowrap: oznaka se nikad ne smije prelomiti — u uskoj kartici
  // "PDF izvještaj" bi inače pao u dva reda.
  const base =
    "relative z-10 inline-flex h-9 items-center gap-2 rounded-md border border-neutral-200 bg-white px-4 text-[13px] font-semibold whitespace-nowrap transition-colors";
  const DISABLED = "cursor-not-allowed text-neutral-400 opacity-50";
  const ENABLED =
    "text-neutral-800 hover:border-[#C7D7EF] hover:bg-brand-50 hover:text-brand-700";
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="relative z-10 flex items-center gap-2">
      {disabled ? (
        <button type="button" disabled className={cn(base, DISABLED)}>
          <FileText className="size-[15px]" />
          {t("pdf")}
        </button>
      ) : (
        <Link
          href={`/elections/${row.id}/results/report`}
          onClick={stop}
          className={cn(base, ENABLED)}
        >
          <FileText className="size-[15px]" />
          {t("pdf")}
        </Link>
      )}
      {disabled ? (
        <button type="button" disabled className={cn(base, DISABLED)}>
          <Download className="size-[15px]" />
          {t("csv")}
        </button>
      ) : (
        <a
          href={`/api/elections/${row.id}/results/export?locale=${locale}`}
          onClick={stop}
          className={cn(base, ENABLED)}
        >
          <Download className="size-[15px]" />
          {t("csv")}
        </a>
      )}
    </div>
  );
}

// Cijela kartica/redak je klikabilna preko rastegnutog ::after na jednom pravom
// interaktivnom elementu — validan HTML, a gumbi za izvoz ostaju iznad njega
// (z-10). Zapečaćeni izbori dobiju <button> (otvara modal) umjesto poveznice.
function OpenTarget({
  row,
  onSealed,
  className,
  children,
}: {
  row: ResultsRow;
  onSealed: (row: ResultsRow) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const stretch = "after:absolute after:inset-0 after:content-['']";
  if (row.access === "sealed") {
    return (
      <button
        type="button"
        onClick={() => onSealed(row)}
        className={cn(stretch, "text-left", className)}
      >
        {children}
      </button>
    );
  }
  return (
    <Link
      href={`/elections/${row.id}/results`}
      className={cn(stretch, className)}
    >
      {children}
    </Link>
  );
}

function ResultsCard({
  row,
  onSealed,
}: {
  row: ResultsRow;
  onSealed: (row: ResultsRow) => void;
}) {
  const { t, style, Icon, line } = useRowParts(row);

  return (
    <div className="group relative flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-[22px] shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-[#C7D7EF] hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11.5px] font-bold tracking-[0.06em] text-neutral-600 uppercase">
            {t("resultsOf")}
          </div>
          <OpenTarget
            row={row}
            onSealed={onSealed}
            className="mt-1 block font-heading text-[17px] leading-snug font-semibold text-neutral-800 outline-none focus-visible:underline"
          >
            {row.name}
          </OpenTarget>
        </div>
        <StatusChip row={row} />
      </div>

      <div className="flex items-center gap-2 text-[13.5px] text-neutral-600">
        <Icon className={cn("size-[15px] flex-shrink-0", style.line)} />
        {line}
      </div>

      <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-3 border-t border-neutral-100 pt-4">
        <ExportButtons row={row} />
        <span className="ml-auto inline-flex items-center gap-1 text-[13px] font-semibold whitespace-nowrap text-neutral-600 transition-colors group-hover:text-brand-700">
          {t("viewResults")}
          <ChevronRight className="size-4" />
        </span>
      </div>
    </div>
  );
}

function ResultsRowItem({
  row,
  onSealed,
}: {
  row: ResultsRow;
  onSealed: (row: ResultsRow) => void;
}) {
  const { style, Icon, line } = useRowParts(row);

  return (
    // ponytail: ispod sm redak se slaže okomito — akcije ne stanu uz naslov
    <div className="group relative flex flex-col gap-3 border-b border-neutral-100 px-6 py-[18px] transition-colors last:border-b-0 hover:bg-brand-50 sm:flex-row sm:items-center sm:gap-5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <OpenTarget
            row={row}
            onSealed={onSealed}
            className="truncate font-heading text-base font-semibold text-neutral-800 outline-none focus-visible:underline"
          >
            {row.name}
          </OpenTarget>
          <StatusChip row={row} compact />
        </div>
        <div className="mt-[5px] flex items-center gap-[7px] text-[13px] text-neutral-600">
          <Icon className={cn("size-[15px] flex-shrink-0", style.line)} />
          {line}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        <ExportButtons row={row} />
        <span className="mx-0.5 h-6 w-px bg-neutral-200" />
        <ChevronRight className="size-5 text-neutral-400 transition-colors group-hover:text-brand-700" />
      </div>
    </div>
  );
}

function SealedDialog({
  row,
  onClose,
}: {
  row: ResultsRow | null;
  onClose: () => void;
}) {
  const t = useTranslations("dashboard.resultsPage");
  // Zadnji naslov ostaje dok se modal zatvara, da tekst ne bljesne u prazno.
  const [last, setLast] = useState("");
  if (row && row.name !== last) setLast(row.name);

  return (
    <Dialog.Root open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-110 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-lg outline-none">
          <div className="flex items-start gap-3.5">
            <span className="flex size-10 flex-shrink-0 items-center justify-center rounded-full bg-warning-50 text-warning-700">
              <Lock className="size-5" />
            </span>
            <div className="min-w-0">
              <Dialog.Title className="font-heading text-xl font-semibold text-neutral-800">
                {t("sealedTitle")}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm leading-relaxed text-neutral-600">
                {t("sealedBody", { title: last })}
              </Dialog.Description>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <Dialog.Close className="h-11 rounded-md bg-brand-700 px-[22px] text-[15px] font-semibold text-white transition-colors hover:bg-brand-600">
              {t("close")}
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
