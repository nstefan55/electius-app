"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Dialog } from "@base-ui/react/dialog";
import {
  Calendar,
  Clock,
  Eye,
  FileText,
  Search,
  ShieldCheck,
  Trophy,
  X,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  formatVotingDateTime,
  matchesQuery,
  turnoutPct,
} from "@/lib/elections-view";
import { voterSharePct } from "@/lib/results-view";
import { CONTACT_EMAIL } from "@/lib/urls";
import { Pagination } from "@/components/ui/pagination";
import { ARCHIVE_PER_PAGE } from "@/lib/constants/pagination";
import { usePagination } from "@/lib/use-pagination";
import type { ArchivedElection } from "@/lib/db/elections";

// Arhiva — mreža kartica (dizajn: Elections Archived.dc.html). Detaljne stranice
// nema: kartica vodi na /elections/[id]/results, /results/report i modal revizije.
//
// Naslov stranice živi ovdje, a ne na serverskoj stranici, jer pretraga stoji
// desno u istom redu i dijeli stanje s listom.
//
// Pobjednik i izlaznost dolaze iz zajedničkih funkcija (getArchivedElections →
// winnerOutcome, turnoutPct): arhivirani izbori ne smiju prijaviti drugog
// pobjednika ni drugi postotak od vlastite stranice rezultata.
const ACTION =
  "inline-flex h-9.5 shrink-0 cursor-pointer items-center justify-center gap-1.75 rounded-md border border-border bg-white px-3.5 text-[0.84375rem] font-semibold text-neutral-600 transition-colors hover:border-brand-100 hover:bg-brand-50 hover:text-brand-700";

export function ArchiveList({ elections }: { elections: ArchivedElection[] }) {
  const t = useTranslations("dashboard.election.lists.archive");

  const [query, setQuery] = useState("");
  const [auditFor, setAuditFor] = useState<ArchivedElection | null>(null);
  const hasQuery = query.trim() !== "";
  // Upit dohvaća CIJELI skup, pa filtriranje na klijentu ne može sakriti
  // pogodak. Vrijedi i dalje uz stranicanje: stranica se reže tek NAKON
  // filtriranja. Doda li se `take` u getArchivedElections, pretraga postaje
  // pretraga prve stranice — tada i ona mora u WHERE.
  const rows = useMemo(
    () => elections.filter((e) => matchesQuery(e, query)),
    [elections, query],
  );

  // Pretraga vraća na prvu stranicu — bez toga bi suženje na dva pogotka dok si
  // na 3. stranici pokazalo prazno.
  const { page, pageCount, setPage, pageItems } = usePagination(
    rows,
    ARCHIVE_PER_PAGE,
    query.trim(),
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
              className="h-full min-w-0 flex-1 bg-transparent text-[0.90625rem] text-neutral-800 outline-none placeholder:text-neutral-400 [&::-webkit-search-cancel-button]:hidden"
            />
            {hasQuery && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("clearSearch")}
                className="flex size-6.5 shrink-0 cursor-pointer items-center justify-center rounded-md bg-neutral-100 text-neutral-600 transition-colors hover:bg-neutral-200 hover:text-neutral-800"
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
          <p className="mb-4 text-[0.8125rem] text-neutral-600">
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
              <p className="font-heading text-[1.0625rem] font-semibold text-neutral-800">
                {t("emptyTitle", { query: query.trim() })}
              </p>
              <p className="mt-1.5 text-sm text-neutral-600">{t("emptyBody")}</p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-5 h-10 cursor-pointer rounded-md bg-brand-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                {t("clearSearch")}
              </button>
            </div>
          ) : (
            <>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,420px),1fr))] gap-5">
                {pageItems.map((e) => (
                  <ArchiveCard
                    key={e.id}
                    election={e}
                    onAudit={() => setAuditFor(e)}
                  />
                ))}
              </ul>

              <Pagination
                page={page}
                pageCount={pageCount}
                onPageChange={setPage}
                className="mt-6"
              />
            </>
          )}
        </>
      )}

      <AuditDialog
        election={auditFor}
        onClose={() => setAuditFor(null)}
      />
    </>
  );
}

function ArchiveCard({
  election: e,
  onAudit,
}: {
  election: ArchivedElection;
  onAudit: () => void;
}) {
  const t = useTranslations("dashboard.election.lists.archive");
  const locale = useLocale();
  const pct = turnoutPct(e.voted, e.voters);

  return (
    <li className="flex flex-col gap-4 rounded-xl border border-border bg-white p-5.5 shadow-sm transition-shadow hover:shadow-md">
      <div className="min-w-0">
        <h2 className="font-heading text-[1.0625rem] leading-snug font-semibold text-neutral-800">
          {e.name}
        </h2>
        <p className="mt-1.5 flex items-center gap-1.75 text-[0.8125rem] text-neutral-600">
          <Calendar className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0">
            {formatVotingDateTime(e.opens, locale)} –{" "}
            {formatVotingDateTime(e.closes, locale)}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 border-y border-neutral-100 py-4">
        <div className="min-w-0">
          <Label>{t("participation")}</Label>
          <div className="mt-1.5 font-heading text-base font-semibold text-neutral-800">
            {t("votesOf", { voted: e.voted, voters: e.voters })}
          </div>
          <div className="mt-1.75 flex items-center gap-2">
            <div className="h-1.25 flex-1 overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-brand-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-semibold text-neutral-600">
              {pct}%
            </span>
          </div>
        </div>

        <div className="min-w-0">
          <Label>{t("result")}</Label>
          <Winner election={e} />
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <Link
          href={`/elections/${e.id}/results`}
          className="inline-flex h-9.5 flex-1 items-center justify-center gap-1.75 rounded-md border border-brand-700 bg-white px-3 text-[0.84375rem] font-semibold text-brand-700 transition-colors hover:bg-brand-700 hover:text-white"
        >
          <Eye className="size-3.75" aria-hidden />
          {t("view")}
        </Link>
        <Link href={`/elections/${e.id}/results/report`} className={ACTION}>
          <FileText className="size-3.75" aria-hidden />
          {t("pdf")}
        </Link>
        <button type="button" onClick={onAudit} className={ACTION}>
          <ShieldCheck className="size-3.75" aria-hidden />
          {t("audit")}
        </button>
      </div>
    </li>
  );
}

// Pobjednik ima tri oblika i sva tri se prikazuju: kartica koja čita ranked[0]
// izmislila bi pobjednika kojeg nema.
function Winner({ election: e }: { election: ArchivedElection }) {
  const tr = useTranslations("dashboard.election.results");
  const { kind, candidates } = e.winner;

  if (kind === "none") {
    return (
      <>
        <div className="mt-1.5 flex items-center gap-2">
          <Badge tone="neutral">
            <Trophy className="size-3.5" aria-hidden />
          </Badge>
          <span className="min-w-0 truncate text-[0.90625rem] font-semibold text-neutral-600">
            {tr("winnerNone")}
          </span>
        </div>
      </>
    );
  }

  const tie = kind === "tie";
  const lead = candidates[0];

  return (
    <>
      <div className="mt-1.5 flex items-center gap-2">
        <Badge tone="gold">
          <Trophy className="size-3.5" aria-hidden />
        </Badge>
        <span className="min-w-0 truncate text-[0.90625rem] font-semibold text-neutral-800">
          {tie ? tr("winnerTie") : lead.text}
        </span>
      </div>
      <p className="mt-1.25 truncate text-xs text-neutral-600">
        {tie
          ? candidates.map((c) => c.text).join(" · ")
          : tr("winnerShare", { pct: voterSharePct(lead.votes, e.voters) })}
      </p>
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[0.71875rem] font-semibold tracking-[0.03em] text-neutral-600 uppercase">
      {children}
    </div>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "gold" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <span
      className={`flex size-6.5 shrink-0 items-center justify-center rounded-full ${
        tone === "gold"
          ? "bg-[#FEF9C3] text-[#A16207]"
          : "bg-neutral-100 text-neutral-400"
      }`}
    >
      {children}
    </span>
  );
}

// Modal revizije. Tekst dolazi iz ključa koji ispisuje i PDF izvještaj — dvije
// kopije tvrdnje o integritetu raziđu se, a ova bi se razišla prema neistini.
//
// Dvije grane: zapečaćeno (pravi Merkle korijen) i nezapečaćeno. Druga NIJE
// privremena — izbori arhivirani prije pečata pečat više ne mogu dobiti.
function AuditDialog({
  election: e,
  onClose,
}: {
  election: ArchivedElection | null;
  onClose: () => void;
}) {
  const t = useTranslations("dashboard.election.lists.archive");
  const tr = useTranslations("dashboard.election.results");
  const treport = useTranslations("dashboard.election.report");
  const locale = useLocale();
  const sealed = e?.sealed ?? null;

  return (
    <Dialog.Root open={e !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-3rem)] w-[calc(100%-2rem)] max-w-130 -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white shadow-lg outline-none">
          <div className="flex items-center gap-3.25 border-b border-border px-6 py-5.5">
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                sealed
                  ? "bg-success-50 text-success-700"
                  : "bg-neutral-100 text-neutral-400"
              }`}
            >
              {sealed ? (
                <ShieldCheck className="size-5" aria-hidden />
              ) : (
                <Clock className="size-5" aria-hidden />
              )}
            </span>
            <div className="min-w-0">
              <Dialog.Title className="font-heading text-[1.125rem] font-semibold text-neutral-800">
                {tr("auditTitle")}
              </Dialog.Title>
              <Dialog.Description className="mt-0.25 truncate text-[0.8125rem] text-neutral-600">
                {e?.name ?? ""}
              </Dialog.Description>
            </div>
          </div>

          <div className="px-6 py-5.5">
            <p className="text-[0.90625rem] leading-relaxed text-neutral-800">
              {treport("auditBody")}
            </p>
            {/* Jača tvrdnja samo kad pečat postoji — nezapečaćena arhiva je
                trajno stanje, ne skela. */}
            {sealed && (
              <p className="mt-3 text-[0.90625rem] leading-relaxed text-neutral-800">
                {treport("auditSealedBody")}
              </p>
            )}
            <p className="mt-3.5 text-sm leading-relaxed text-neutral-600">
              {treport("auditContact")}{" "}
              <span className="font-bold text-success-700">
                {CONTACT_EMAIL}
              </span>
            </p>

            <div className="mt-4.5">
              <div className="mb-1.5 text-xs font-semibold text-neutral-600">
                {tr("merkleRoot")}
              </div>
              {sealed ? (
                <>
                  <div className="rounded-md border border-[#E5EAF2] bg-[#F3F6FB] px-3.5 py-3 font-mono text-xs break-all text-brand-900">
                    {sealed.merkleRoot}
                  </div>
                  <p className="mt-2 text-[0.78125rem] text-neutral-600">
                    {t("sealedAt", {
                      date: formatVotingDateTime(sealed.createdAt, locale),
                    })}
                  </p>
                </>
              ) : (
                <>
                  <div className="rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-3.5 py-3 font-mono text-[0.78125rem] text-neutral-400">
                    {tr("merkleUnavailable")}
                  </div>
                  <p className="mt-2 text-[0.78125rem] leading-relaxed text-neutral-600">
                    {tr("auditPendingBody")}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="flex justify-end border-t border-border px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="h-11 cursor-pointer rounded-md bg-brand-700 px-5.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-brand-600"
            >
              {t("close")}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
