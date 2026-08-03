import { getTranslations } from "next-intl/server";
import {
  BarChart3,
  CircleCheckBig,
  Clock,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import { formatVotingDateTime, turnoutPct } from "@/lib/elections-view";
import {
  candidateInitials,
  quorumOutcome,
  rankCandidates,
  voterSharePct,
  winnerOutcome,
  type DayBucket,
  type OptionTally,
  type RankedCandidate,
} from "@/lib/results-view";
import type { ArchiveSeal } from "@/lib/db/elections";
import {
  TurnoutDonut,
  VotesPerDayChart,
  type ChartLabels,
} from "@/components/elections/results-charts";
import { cn } from "@/lib/utils";

// Glavni dio stranice rezultata (dizajn: Election Results ID Overview.dc.html).
// Poslužiteljska komponenta — zbroj je statičan; jedini klijentski dio su grafovi.
//
// Anonimnost: sve su brojke agregati. Nigdje pojedinačni listić, vrijeme
// glasanja ni batchOrder — dnevni graf dobiva već zbrojene dane.

// Paleta iz dizajna; pobjednik je uvijek zelen, ostali redom.
const BAR_PALETTE = ["#1D4ED8", "#8B5CF6", "#F59E0B", "#EC4899", "#06B6D4"];
const WINNER_GREEN = "#22C55E";
const WINNER_AVATAR = "#16A34A";

const barColor = (c: RankedCandidate, i: number) =>
  c.isWinner ? WINNER_GREEN : BAR_PALETTE[i % BAR_PALETTE.length];
const avatarColor = (c: RankedCandidate, i: number) =>
  c.isWinner ? WINNER_AVATAR : BAR_PALETTE[i % BAR_PALETTE.length];

const CARD = "rounded-lg border border-neutral-200 bg-white shadow-sm";
const CARD_HEAD =
  "flex items-center justify-between gap-3 border-b border-neutral-200 px-6 py-4.5";
const CARD_TITLE = "font-heading text-lg font-semibold text-neutral-800";

export interface ElectionResultsProps {
  orgName: string;
  electionType: string;
  votingType: string;
  quorumThreshold: number | null;
  opens: string;
  closes: string;
  voters: number;
  votesCast: number;
  options: OptionTally[];
  days: DayBucket[];
  locale: string;
  sealed: ArchiveSeal | null;
}

export async function ElectionResults({
  orgName,
  electionType,
  votingType,
  quorumThreshold,
  opens,
  closes,
  voters,
  votesCast,
  options,
  days,
  locale,
  sealed,
}: ElectionResultsProps) {
  const t = await getTranslations("dashboard.election.results");
  const tType = await getTranslations("dashboard.wizard.step1");

  const ranked = rankCandidates(options, votesCast);
  const outcome = winnerOutcome(ranked);
  const turnout = turnoutPct(votesCast, voters);
  const quorum =
    quorumThreshold === null
      ? null
      : quorumOutcome(voters, votesCast, quorumThreshold);
  const nf = new Intl.NumberFormat(locale === "hr" ? "hr-HR" : "en-US");

  // Grafovi su klijentski, pa prijevode dobivaju kao propse.
  const chartLabels: ChartLabels = {
    dayChart: t("dayChart"),
    dayLegend: t("dayLegend"),
    donut: t("donut"),
    donutCast: t("donutCast"),
    donutRemain: t("donutRemain"),
    empty: t("noVotes"),
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Stat cards — kvorum se izostavlja kad nije konfiguriran */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5">
        <StatCard
          label={t("statTotalVoters")}
          value={nf.format(voters)}
          icon={<Users className="size-4" />}
          tone="brand"
        />
        <StatCard
          label={t("statVotesCast")}
          value={nf.format(votesCast)}
          icon={<CircleCheckBig className="size-4" />}
          tone="success"
        />
        <StatCard
          label={t("statTurnout")}
          value={`${turnout}%`}
          hint={`${nf.format(votesCast)} / ${nf.format(voters)}`}
          icon={<BarChart3 className="size-4" />}
          tone="brand"
        />
        {quorum && (
          <StatCard
            label={t("statQuorum")}
            value={t(quorum.met ? "quorumMet" : "quorumNotMet")}
            sub={t("quorumDetail", {
              achieved: quorum.achievedPct,
              required: quorum.requiredPct,
            })}
            icon={<ShieldCheck className="size-4" />}
            tone={quorum.met ? "success" : "error"}
            valueTone={quorum.met ? "text-success-700" : "text-error-700"}
          />
        )}
      </div>

      <WinnerCard outcome={outcome} voters={voters} locale={locale} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className={CARD}>
            <div className={CARD_HEAD}>
              <h2 className={CARD_TITLE}>{t("distribution")}</h2>
              <span className="text-[0.8125rem] text-neutral-600">
                {t("candidatesCount", { count: ranked.length })}
              </span>
            </div>
            <div className="px-6 pt-2 pb-5">
              {ranked.length === 0 ? (
                <p className="py-6 text-center text-sm text-neutral-600">
                  {t("noCandidates")}
                </p>
              ) : (
                ranked.map((c, i) => (
                  <CandidateRow
                    key={c.id}
                    candidate={c}
                    index={i}
                    votesLabel={t("votesN", { count: c.votes })}
                    winnerTag={t("winnerTag")}
                  />
                ))
              )}
            </div>
          </section>

          <VotesPerDayChart
            days={days}
            labels={chartLabels}
            locale={locale}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <TurnoutDonut
            votesCast={votesCast}
            voters={voters}
            labels={chartLabels}
            locale={locale}
          />

          <section className={CARD}>
            <div className={CARD_HEAD}>
              <h2 className={CARD_TITLE}>{t("details")}</h2>
            </div>
            <div className="px-6 pt-1.5 pb-3">
              <DetailRow label={t("dOrg")} value={orgName} />
              <DetailRow
                label={t("dType")}
                value={`${tType(`types.${electionType}.label`)} · ${tType(`methods.${votingType}.label`)}`}
              />
              <DetailRow
                label={t("dPeriod")}
                value={`${formatVotingDateTime(opens, locale)} – ${formatVotingDateTime(closes, locale)}`}
              />
              {quorum && (
                <DetailRow
                  label={t("dQuorum")}
                  value={t("quorumRow", {
                    state: t(quorum.met ? "quorumMet" : "quorumNotMet"),
                    achievedPct: quorum.achievedPct,
                    achieved: nf.format(quorum.achievedVoters),
                    requiredPct: quorum.requiredPct,
                    required: nf.format(quorum.requiredVoters),
                  })}
                />
              )}
            </div>
          </section>

          <AuditCard sealed={sealed} />
        </div>
      </div>

      <p className="px-0.5 text-xs text-neutral-600">{t("footnote")}</p>
    </div>
  );
}

const TONES = {
  brand: "bg-brand-50 text-brand-700",
  success: "bg-success-50 text-success-700",
  error: "bg-error-50 text-error-700",
} as const;

function StatCard({
  label,
  value,
  hint,
  sub,
  icon,
  tone,
  valueTone,
}: {
  label: string;
  value: string;
  hint?: string;
  sub?: string;
  icon: React.ReactNode;
  tone: keyof typeof TONES;
  valueTone?: string;
}) {
  return (
    <div className={cn(CARD, "px-5.5 py-5")}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[0.8125rem] font-medium text-neutral-600">{label}</span>
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            TONES[tone],
          )}
        >
          {icon}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span
          className={cn(
            "font-heading text-3xl leading-none font-bold",
            valueTone ?? "text-neutral-800",
          )}
        >
          {value}
        </span>
        {hint && <span className="text-[0.8125rem] text-neutral-600">{hint}</span>}
      </div>
      {sub && <div className="mt-1.5 text-[0.78125rem] text-neutral-600">{sub}</div>}
    </div>
  );
}

// Pobjednička kartica. Izjednačenje se NIKAD ne razrješava prešutno — prikazuju
// se svi vodeći i naslov to izrijekom kaže.
async function WinnerCard({
  outcome,
  voters,
  locale,
}: {
  outcome: ReturnType<typeof winnerOutcome>;
  voters: number;
  locale: string;
}) {
  const t = await getTranslations("dashboard.election.results");
  const nf = new Intl.NumberFormat(locale === "hr" ? "hr-HR" : "en-US");

  if (outcome.kind === "none") {
    return (
      <section className={cn(CARD, "flex items-center gap-4 px-7 py-6")}>
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
          <Trophy className="size-6" aria-hidden />
        </span>
        <div>
          <h2 className="font-heading text-lg font-semibold text-neutral-800">
            {t("winnerNone")}
          </h2>
          <p className="mt-0.5 text-sm text-neutral-600">{t("winnerNoneBody")}</p>
        </div>
      </section>
    );
  }

  const tie = outcome.kind === "tie";
  const lead = outcome.candidates[0];
  const share = voterSharePct(lead.votes, voters);

  return (
    <section className="flex flex-wrap items-center justify-between gap-7 rounded-xl bg-brand-900 px-7 py-6 shadow-md">
      <div className="flex min-w-0 items-center gap-5">
        {!tie && (
          <span className="flex size-19 shrink-0 items-center justify-center rounded-full bg-brand-500 font-heading text-[1.75rem] font-bold text-white shadow-[inset_0_0_0_3px_rgba(255,255,255,0.18)]">
            {candidateInitials(lead.text)}
          </span>
        )}
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.75 text-xs font-bold tracking-[0.06em] text-[#FCD34D] uppercase">
            <Trophy className="size-3.75" aria-hidden />
            {t(tie ? "winnerTie" : "winner")}
          </div>

          {tie ? (
            <ul className="mt-2 flex flex-col gap-2">
              {outcome.candidates.map((c) => (
                <li key={c.id} className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-500 font-heading text-[0.8125rem] font-bold text-white">
                    {candidateInitials(c.text)}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-heading text-lg leading-tight font-bold text-white">
                      {c.text}
                    </span>
                    {c.description && (
                      <span className="block text-[0.8125rem] text-white/70">
                        {c.description}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <div className="mt-1.25 font-heading text-[1.625rem] leading-tight font-bold text-white">
                {lead.text}
              </div>
              {lead.description && (
                <div className="mt-0.75 text-sm text-white/70">
                  {lead.description}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="text-right">
        <div className="font-heading text-[2.625rem] leading-none font-bold text-white">
          {nf.format(lead.votes)}
        </div>
        <div className="mt-1.5 text-[0.84375rem] text-white/65">
          {t("winnerShare", { pct: share })}
        </div>
      </div>
    </section>
  );
}

function CandidateRow({
  candidate,
  index,
  votesLabel,
  winnerTag,
}: {
  candidate: RankedCandidate;
  index: number;
  votesLabel: string;
  winnerTag: string;
}) {
  return (
    <div className="border-b border-neutral-100 py-4 last:border-b-0">
      <div className="mb-2.5 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.75">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full font-heading text-[0.78125rem] font-bold text-white"
            style={{ background: avatarColor(candidate, index) }}
          >
            {candidateInitials(candidate.text)}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[0.9375rem] font-semibold text-neutral-800">
              <span className="truncate">{candidate.text}</span>
              {candidate.isWinner && (
                <span className="inline-flex h-4.75 shrink-0 items-center gap-1 rounded-full bg-[#FEF9C3] px-2 text-[0.65625rem] font-bold tracking-[0.03em] text-[#A16207]">
                  <Trophy className="size-2.75" aria-hidden />
                  {winnerTag}
                </span>
              )}
            </div>
            {candidate.description && (
              <div className="truncate text-[0.78125rem] text-neutral-600">
                {candidate.description}
              </div>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right whitespace-nowrap">
          <span className="font-heading text-base font-bold text-neutral-800">
            {candidate.pct}%
          </span>
          <span className="ml-1.5 text-[0.8125rem] text-neutral-600">
            {votesLabel}
          </span>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{
            width: `${candidate.pct}%`,
            background: barColor(candidate, index),
          }}
        />
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-neutral-100 py-3.25 last:border-b-0">
      <span className="text-[0.84375rem] text-neutral-600">{label}</span>
      <span className="text-right text-[0.84375rem] font-semibold text-neutral-800">
        {value}
      </span>
    </div>
  );
}

// Kartica integriteta, dvije grane po tome postoji li pečat.
//
// Zapečaćeno: zelena kvačica i PRAVI 64-hex korijen iz Archive.merkleRoot.
// Nezapečaćeno: neutralno sivo, bez kvačice i bez izmišljenog hasha — lažna
// tvrdnja o integritetu gora je od nikakve. Ta grana je trajna, ne skela:
// pečaćenje ide samo pri arhiviranju, pa je otvoreni ili zatvoreni izbor
// legitimno nezapečaćen, kao i sve arhivirano prije ove značajke.
async function AuditCard({ sealed }: { sealed: ArchiveSeal | null }) {
  const t = await getTranslations("dashboard.election.results");
  const treport = await getTranslations("dashboard.election.report");

  if (sealed) {
    return (
      <section className={CARD}>
        <div className="flex items-center gap-3 border-b border-neutral-200 px-6 py-4.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success-50 text-success-700">
            <ShieldCheck className="size-4.75" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="font-heading text-base font-semibold text-neutral-800">
              {t("auditTitle")}
            </h2>
            <div className="mt-0.25 text-[0.78125rem] text-neutral-600">
              {t("auditSealed")}
            </div>
          </div>
        </div>
        <div className="px-6 pt-4 pb-4.5">
          <div className="mb-1.5 text-xs font-semibold text-neutral-600">
            {t("merkleRoot")}
          </div>
          <div className="rounded-md border border-[#E5EAF2] bg-[#F3F6FB] px-3 py-2.5 font-mono text-[0.78125rem] break-all text-brand-900">
            {sealed.merkleRoot}
          </div>
          <p className="mt-3 text-[0.78125rem] leading-relaxed text-neutral-600">
            {treport("auditSealedBody")}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={CARD}>
      <div className="flex items-center gap-3 border-b border-neutral-200 px-6 py-4.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
          <Clock className="size-4.75" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-base font-semibold text-neutral-800">
            {t("auditTitle")}
          </h2>
          <div className="mt-0.25 text-[0.78125rem] text-neutral-600">
            {t("auditPending")}
          </div>
        </div>
      </div>
      <div className="px-6 pt-4 pb-4.5">
        <div className="mb-1.5 text-xs font-semibold text-neutral-600">
          {t("merkleRoot")}
        </div>
        <div className="rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-3 py-2.5 font-mono text-[0.78125rem] text-neutral-600">
          {t("merkleUnavailable")}
        </div>
        <p className="mt-3 text-[0.78125rem] leading-relaxed text-neutral-600">
          {t("auditPendingBody")}
        </p>
      </div>
    </section>
  );
}
