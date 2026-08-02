// Pure view helpers for dashboard election data — shared by server and client
// components, so charts and the live hero can import the types + sort rule too.
// No DB, no `server-only`. Shape mirrors the old mock-data MockElection.

export type ElectionStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "ACTIVE"
  | "CLOSED"
  | "ARCHIVED";

export type ResultsMode = "AFTER_CLOSE" | "LIVE";

export interface DashboardElection {
  id: string;
  name: string;
  type: string;
  status: ElectionStatus;
  resultsMode: ResultsMode;
  voters: number;
  voted: number;
  opens: string;
  closes: string;
}

// Recent-elections sort priority. Archived lives in the Archive tab, excluded here.
const STATUS_ORDER: Record<ElectionStatus, number> = {
  ACTIVE: 0,
  SCHEDULED: 1,
  CLOSED: 2,
  DRAFT: 3,
  ARCHIVED: 4,
};

// Badge tint + status-dot + turnout-bar classes per status (design-system §7.9 /
// §2 status colors). Shared by the recent-elections list and the aggregate-root
// StatusBadge so one status renders identically everywhere.
export const STATUS_STYLES: Record<
  ElectionStatus,
  { badge: string; dot: string; bar: string }
> = {
  ACTIVE: { badge: "bg-success-50 text-success-700", dot: "bg-status-active", bar: "bg-status-active" },
  SCHEDULED: { badge: "bg-warning-50 text-warning-700", dot: "bg-status-scheduled", bar: "bg-status-scheduled" },
  CLOSED: { badge: "bg-error-50 text-error-700", dot: "bg-status-closed", bar: "bg-status-closed" },
  DRAFT: { badge: "bg-brand-50 text-brand-700", dot: "bg-status-draft", bar: "bg-status-draft" },
  ARCHIVED: { badge: "bg-neutral-100 text-neutral-600", dot: "bg-status-archived", bar: "bg-status-archived" },
};

// Non-archived elections, sorted Active > Scheduled > Closed > Draft.
export const sortRecent = (els: DashboardElection[]) =>
  els
    .filter((e) => e.status !== "ARCHIVED")
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

// Filter-toolbar predicates (design: Elections.dc.html). Pure so the client
// list and unit tests share one rule set.
export type StatusFilter = "all" | ElectionStatus;
export type TurnoutFilter = "all" | "high" | "medium" | "low" | "none";
export type WindowFilter = string; // "all" | "unscheduled" | a close-date year like "2026"

export const matchesTurnout = (
  e: Pick<DashboardElection, "voters" | "voted">,
  f: TurnoutFilter,
) => {
  if (f === "all") return true;
  if (f === "none") return e.voters === 0 || e.voted === 0;
  if (e.voters === 0) return false;
  const p = Math.round((e.voted / e.voters) * 100);
  if (f === "high") return p >= 75;
  if (f === "medium") return p >= 40 && p < 75;
  return p > 0 && p < 40; // low
};

// Schema requires startsAt/endsAt, so DRAFT rows carry placeholder dates —
// "unscheduled" keys on status, same rule as the list's "Not scheduled" cell.
export const matchesWindow = (
  e: Pick<DashboardElection, "status" | "closes">,
  f: WindowFilter,
) => {
  if (f === "all") return true;
  if (f === "unscheduled") return e.status === "DRAFT";
  if (e.status === "DRAFT") return false;
  return String(new Date(e.closes).getUTCFullYear()) === f;
};

// Distinct close-date years for the window select, newest first.
export const windowYears = (els: DashboardElection[]) =>
  [
    ...new Set(
      els
        .filter((e) => e.status !== "DRAFT")
        .map((e) => new Date(e.closes).getUTCFullYear()),
    ),
  ]
    .sort((a, b) => b - a)
    .map(String);

// ───────── Naslovna pretraga (elections-archived-phase-1) ─────────
// Bez dijakritika i bez velikih slova — hr korisnici tipkaju "referendum" i
// očekuju "Referendum". đ nije d + dijakritik pa ga NFD ne rastavlja (isti
// slučaj kao u csv.ts slugify).
export const foldForSearch = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();

// Prazan upit propušta sve — poziv na strani liste ne treba grananje.
export const matchesQuery = (
  e: Pick<DashboardElection, "name">,
  query: string,
) => {
  const q = foldForSearch(query);
  return q === "" || foldForSearch(e.name).includes(q);
};

// ───────── Overview body maths (election-overview-phase-2) ─────────
// Turnout denominator is the FULL voter list, not "invitations sent" — same rule
// as the dashboard, and the only reading that matches "quorum = % of eligible
// voters". A partially-published election therefore reports a lower turnout than
// invited/voted alone would suggest, which is the honest number.
export const turnoutPct = (voted: number, voters: number) =>
  voters > 0 ? Math.round((voted / voters) * 100) : 0;

// Voters needed to clear the quorum bar. Ceil — 49.2 voters is not enough.
export const quorumRequiredVoters = (voters: number, pct: number) =>
  Math.ceil((voters * pct) / 100);

// Jedina derivacija brojki o biračima — dijele je pregled izbora i popis birača,
// da ista dva zaslona nikad ne prijave različite brojeve.
// `voted` su prebrojani listići (Vote), ne status birača; `notInvited` je broj
// birača sa statusom PENDING (uvezeni, e-pošta im nikad nije uspješno poslana).
export const voterCounts = ({
  total,
  notInvited,
  voted,
}: {
  total: number;
  notInvited: number;
  voted: number;
}) => ({
  total,
  invited: Math.max(0, total - notInvited),
  voted,
  pending: Math.max(0, total - voted),
});

// ───────── Popis rezultata (election-results-overview-phase-2) ─────────
// Način prikaza rezultata; izvodi se iz statusa i konfiguracije, nikad se ne
// pohranjuje. `null` znači da izbori uopće ne pripadaju na /results.
//
// `sealed` skriva zbroj i od administratora, ne samo od birača — inače obećanje
// "rezultati skriveni do kraja glasanja" nije istinito. Izlaznost time nije
// pogođena; zapečaćen je zbroj po kandidatu, ne broj glasova.
export type ResultsAccess = "live" | "sealed" | "closed";

export const resultsAccess = (
  e: Pick<DashboardElection, "status" | "resultsMode">,
): ResultsAccess | null => {
  if (e.status === "CLOSED") return "closed";
  // DRAFT/SCHEDULED nemaju listića; ARCHIVED pripada /archive.
  if (e.status !== "ACTIVE") return null;
  return e.resultsMode === "LIVE" ? "live" : "sealed";
};

// Pristup na detaljnoj stranici (/elections/[id]/results). Isto pravilo, uz
// jednu razliku: arhivirani izbori se OVDJE prikazuju. Popis ih izostavlja jer
// im redak pripada /archive, ali ta stranica upućuje upravo ovamo, pa zbroj
// mora postojati. `null` → notFound(): nacrt i zakazani nemaju listića.
export const resultsDetailAccess = (
  e: Pick<DashboardElection, "status" | "resultsMode">,
): ResultsAccess | null =>
  e.status === "ARCHIVED" ? "closed" : resultsAccess(e);

export interface ResultsRow extends DashboardElection {
  access: ResultsAccess;
}

// Redoslijed redaka: aktivni izbori prije zatvorenih, unutar skupine ostaje
// redoslijed iz upita (createdAt desc). Odluka o UX-u, ne o podacima — vidi
// bilješku u current-feature.md ako treba drugačije.
const ACCESS_ORDER: Record<ResultsAccess, number> = {
  live: 0,
  sealed: 1,
  closed: 2,
};

// Redci za /results.
// ponytail: filtrira u JS-u nad svim izborima organizacije umjesto da stavi
// status u WHERE — isto pravilo (resultsAccess) tako odlučuje i uključivanje i
// prikaz, pa se upit i UI ne mogu razići. Prebaci u WHERE ako popisi narastu.
export const resultsRows = (els: DashboardElection[]): ResultsRow[] =>
  els
    .flatMap((e) => {
      const access = resultsAccess(e);
      return access ? [{ ...e, access }] : [];
    })
    .sort((a, b) => ACCESS_ORDER[a.access] - ACCESS_ORDER[b.access]);

// Rastav trajanja na dane/sate/minute. Vraća dijelove, ne oznaku, da sufiksi
// jedinica ostanu u katalozima. Odsječeno na nuli: negativno trajanje čita se
// 0h 0m umjesto da broji unatrag.
// Dijele ga odbrojavanje do kraja glasanja i proteklo vrijeme na privremenom
// izvještaju — jedna implementacija, bez dvaput prepisane aritmetike.
export const durationParts = (ms: number) => {
  let rest = Math.max(0, ms);
  const days = Math.floor(rest / 86_400_000);
  rest -= days * 86_400_000;
  const hours = Math.floor(rest / 3_600_000);
  rest -= hours * 3_600_000;
  return { days, hours, minutes: Math.floor(rest / 60_000) };
};

// Countdown split for the "Time left" stat card.
export const timeLeftParts = (targetIso: string, nowMs: number) =>
  durationParts(new Date(targetIso).getTime() - nowMs);

// Proteklo vrijeme od otvaranja glasanja — mjeri tempo sudjelovanja na
// privremenom izvještaju (D10; odbrojavanje do kraja već stoji na pregledu).
export const elapsedParts = (startIso: string, nowMs: number) =>
  durationParts(nowMs - new Date(startIso).getTime());

// Voting-window date, locale-aware: en "Jun 18" · hr "18. lip". Takes the ISO
// string from DashboardElection.opens/closes. timeZone UTC keeps output
// deterministic across server/browser timezones (prod serverless runs UTC).
const DATE_LOCALE: Record<string, string> = { hr: "hr-HR", en: "en-US" };

export const formatVotingDate = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(iso));

// Full window instant: "9. srp 2026. · 18:00" / "Jul 9, 2026 · 6:00 PM".
// Used where a bare day+month would be ambiguous — the start screen's review
// row and the close-early confirmation. Same UTC determinism as above.
export const formatVotingDateTime = (iso: string, locale: string) => {
  const l = DATE_LOCALE[locale] ?? locale;
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat(l, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
  const time = new Intl.DateTimeFormat(l, {
    // 2-digit, ne numeric: za hr-HR preglednik dopunjava nulom (`09:41`), a
    // Node ne (`9:41`) — ista vrijednost, dva ispisa, hidracijska greška na
    // svakim izborima čiji je UTC sat manji od 10. UTC to ne rješava; samo
    // 2-digit je jednoznačan u oba motora. Isto kao u step-review.tsx.
    // Nuspojava: en prikazuje `09:41 AM` umjesto `9:41 AM` (en nije imao grešku,
    // ali jedno pravilo za oba jezika nadjačava idiomatski ispis).
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(d);
  return `${date} · ${time}`;
};
