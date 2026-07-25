"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Dialog } from "@base-ui/react/dialog";
import { QRCodeSVG } from "qrcode.react";
import {
  BarChart3,
  CircleCheckBig,
  Clock,
  Copy,
  Download,
  Info,
  List,
  Mail,
  QrCode,
  Send,
  Users,
  X,
} from "lucide-react";
import { fetchTurnout } from "@/actions/dashboard";
import { SendReminderDialog } from "@/components/elections/send-reminder-dialog";
import { electionVoteUrl } from "@/lib/urls";
import {
  formatVotingDateTime,
  quorumRequiredVoters,
  timeLeftParts,
  turnoutPct,
  type ElectionStatus,
  type ResultsMode,
} from "@/lib/elections-view";

// Main content area of /elections/[id] (election-overview-phase-2-spec, design:
// Election Overview.dc.html): stat row + the 2×2 grid (turnout · configuration ·
// actions · activity). Rendered for SCHEDULED / ACTIVE / CLOSED / ARCHIVED —
// DRAFT keeps the manual-start screen.
//
// Client component because three things move: the turnout poll, the countdown
// tick, and the QR modal. `nowMs` arrives as a prop (server render time) so the
// first countdown paint matches the server exactly — deriving Date.now() during
// hydration would mismatch on the minute boundary.
export interface ElectionOverviewProps {
  id: string;
  status: ElectionStatus;
  opens: string; // ISO
  closes: string; // ISO
  voters: number;
  voted: number;
  resultsMode: ResultsMode;
  electionType: string; // STANDARD | SURVEY | POLL
  votingType: string; // SINGLE_CHOICE | MULTI_CHOICE
  quorumThreshold: number | null;
  voterReminder24h: boolean;
  candidates: number;
  notInvited: number;
  voted24h: number;
  nowMs: number;
}

const CARD = "rounded-lg border border-border bg-white shadow-sm";
const ACTION_BTN =
  "flex h-11.5 cursor-pointer items-center gap-2.5 rounded-md border border-border bg-white px-4 text-left text-sm font-semibold text-neutral-800 transition-colors hover:border-neutral-400 hover:bg-neutral-50";

export function ElectionOverview({
  id,
  status,
  opens,
  closes,
  voters,
  voted: initialVoted,
  resultsMode,
  electionType,
  votingType,
  quorumThreshold,
  voterReminder24h,
  candidates,
  notInvited,
  voted24h,
  nowMs,
}: ElectionOverviewProps) {
  const t = useTranslations("dashboard.election.overview");
  const locale = useLocale();

  const isActive = status === "ACTIVE";
  const isLive = resultsMode === "LIVE";
  const [live, setLive] = useState({ voters, voted: initialVoted });
  const [now, setNow] = useState(nowMs);

  // Same cadence as the dashboard hero (one polling rule app-wide): faster for
  // LIVE-results elections. Only a running election can move.
  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(
      async () => {
        const next = await fetchTurnout(id);
        if (next) setLive(next);
      },
      isLive ? 15_000 : 60_000,
    );
    return () => clearInterval(timer);
  }, [id, isActive, isLive]);

  // Countdown only ticks while there is something to count down to.
  useEffect(() => {
    if (status !== "ACTIVE" && status !== "SCHEDULED") return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [status]);

  const total = live.voters;
  const voted = live.voted;
  const pct = turnoutPct(voted, total);
  const invited = Math.max(0, total - notInvited);
  const pending = Math.max(0, total - voted);
  const num = (n: number) => n.toLocaleString(locale === "hr" ? "hr-HR" : "en-US");

  return (
    <div className="pb-4">
      <div className="mb-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("stats.invited")}
          value={num(invited)}
          sub={t("stats.invitedSub")}
          icon={<Users className="size-4.25" aria-hidden />}
          tint="bg-brand-50 text-brand-700"
        />
        <StatCard
          label={t("stats.voted")}
          value={num(voted)}
          sub={t("stats.votedSub", { pct })}
          subClass="font-medium text-success-700"
          icon={<CircleCheckBig className="size-4.25" aria-hidden />}
          tint="bg-success-50 text-success-700"
        />
        <StatCard
          label={t("stats.pending")}
          value={num(pending)}
          sub={t("stats.pendingSub")}
          icon={<Clock className="size-4.25" aria-hidden />}
          tint="bg-warning-50 text-warning-700"
        />
        <TimeLeftCard status={status} opens={opens} closes={closes} now={now} />
      </div>

      {/* Two packed columns rather than a 2×2 grid: the configuration card is
          taller than the turnout card, and a real grid row would leave dead space
          above Actions (or force the navy card to stretch and grow voids inside
          it). Each column just stacks. Mobile collapses to one column, ordered
          turnout → actions → configuration → activity. */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <TurnoutCard
            status={status}
            isLive={isLive}
            pct={pct}
            voted={voted}
            voters={total}
            quorumThreshold={quorumThreshold}
          />
          <ActionsCard id={id} status={status} />
        </div>
        <div className="flex flex-col gap-5">
          <ConfigCard
            opens={opens}
            closes={closes}
            voters={total}
            status={status}
            resultsMode={resultsMode}
            electionType={electionType}
            votingType={votingType}
            quorumThreshold={quorumThreshold}
            voterReminder24h={voterReminder24h}
            candidates={candidates}
          />
          <ActivityCard
            status={status}
            opens={opens}
            closes={closes}
            voted24h={voted24h}
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  subClass = "text-neutral-600",
  icon,
  tint,
}: {
  label: string;
  value: string;
  sub: string;
  subClass?: string;
  icon: React.ReactNode;
  tint: string;
}) {
  return (
    <div className={`${CARD} px-6 py-5.5`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-neutral-600">{label}</span>
        <span
          className={`flex size-8.5 shrink-0 items-center justify-center rounded-full ${tint}`}
        >
          {icon}
        </span>
      </div>
      <div className="mt-3.5 font-heading text-[34px] leading-none font-bold text-neutral-800">
        {value}
      </div>
      <div className={`mt-2 text-[13px] ${subClass}`}>{sub}</div>
    </div>
  );
}

function TimeLeftCard({
  status,
  opens,
  closes,
  now,
}: {
  status: ElectionStatus;
  opens: string;
  closes: string;
  now: number;
}) {
  const t = useTranslations("dashboard.election.overview.stats");
  const over = status === "CLOSED" || status === "ARCHIVED";
  const target = status === "SCHEDULED" ? opens : closes;
  const { days, hours, minutes } = timeLeftParts(target, now);

  const value = over
    ? "—"
    : days > 0
      ? t("timeLeftDays", { days, hours })
      : t("timeLeftHours", { hours, minutes });
  const sub = over
    ? t("timeLeftClosedSub")
    : status === "SCHEDULED"
      ? t("timeLeftScheduledSub")
      : t("timeLeftOpenSub");

  return (
    <StatCard
      label={t("timeLeft")}
      value={value}
      sub={sub}
      icon={<Clock className="size-4.25" aria-hidden />}
      tint="bg-violet-50 text-violet-700"
    />
  );
}

function TurnoutCard({
  status,
  isLive,
  pct,
  voted,
  voters,
  quorumThreshold,
}: {
  status: ElectionStatus;
  isLive: boolean;
  pct: number;
  voted: number;
  voters: number;
  quorumThreshold: number | null;
}) {
  const t = useTranslations("dashboard.election.overview.turnout");
  const active = status === "ACTIVE";
  // The badge must never claim "live" on an election that cannot move.
  const badge = !active
    ? status === "SCHEDULED"
      ? t("badgeScheduled")
      : t("badgeFinal")
    : isLive
      ? t("badgeLive")
      : t("badgeAuto");
  const pulsing = active && isLive;
  const required =
    quorumThreshold != null
      ? quorumRequiredVoters(voters, quorumThreshold)
      : null;
  const met = quorumThreshold != null && pct >= quorumThreshold;

  return (
    <div className="rounded-lg bg-brand-900 px-7 py-6 text-white shadow-md">
      <div className="flex items-center justify-between gap-3">
        <div
          className={`inline-flex items-center gap-1.75 rounded-full px-2.5 py-1 ${pulsing ? "bg-success-500/15" : "bg-white/12"}`}
        >
          {pulsing && (
            <span className="size-1.75 animate-pulse rounded-full bg-success-500" />
          )}
          <span
            className={`text-xs font-semibold tracking-wide ${pulsing ? "text-success-500" : "text-white/75"}`}
          >
            {badge}
          </span>
        </div>
        {pulsing && (
          <span className="rounded-full border border-warning-500/40 px-2 py-0.5 text-[10px] font-bold tracking-[0.06em] text-warning-500">
            PRO
          </span>
        )}
      </div>

      <div className="mt-4">
        <div className="font-heading text-[64px] leading-none font-bold tracking-tight">
          {pct}%
        </div>
        <div className="mt-1 text-[13px] text-white/60">{t("caption")}</div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
        <div
          className="h-full rounded-full bg-success-500 transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2.5 text-[13.5px] text-white/85">
        <span className="font-bold text-white">
          {voted.toLocaleString("en-US")}
        </span>{" "}
        {t("progress", { voters })}
      </p>

      {quorumThreshold != null && required != null && (
        <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-white/12 pt-3.5">
          <div className="min-w-0">
            <div className="text-[12.5px] text-white/60">{t("quorumLabel")}</div>
            <div className="mt-0.5 text-sm font-semibold text-white">
              {t("quorumReq", { pct: quorumThreshold, voters: required })}
            </div>
          </div>
          <span
            className={`inline-flex h-7 shrink-0 items-center rounded-full px-3 text-[12.5px] font-bold ${met ? "bg-success-500/20 text-success-500" : "bg-error-500/20 text-error-500"}`}
          >
            {t(met ? "met" : "notMet")}
          </span>
        </div>
      )}
    </div>
  );
}

function ConfigCard({
  opens,
  closes,
  voters,
  status,
  resultsMode,
  electionType,
  votingType,
  quorumThreshold,
  voterReminder24h,
  candidates,
}: {
  opens: string;
  closes: string;
  voters: number;
  status: ElectionStatus;
  resultsMode: ResultsMode;
  electionType: string;
  votingType: string;
  quorumThreshold: number | null;
  voterReminder24h: boolean;
  candidates: number;
}) {
  const t = useTranslations("dashboard.election.overview.config");
  const tType = useTranslations("dashboard.wizard.step1");
  const locale = useLocale();

  const reminder = !voterReminder24h
    ? t("reminderOff")
    : status === "ACTIVE"
      ? t("reminderActive")
      : t("reminderScheduled");

  const rows: [string, string][] = [
    [
      t("type"),
      `${tType(`types.${electionType}.label`)} · ${tType(`methods.${votingType}.label`)}`,
    ],
    [
      t("window"),
      `${formatVotingDateTime(opens, locale)} – ${formatVotingDateTime(closes, locale)}`,
    ],
    [t("voters"), t("votersCount", { count: voters })],
    [t("candidates"), t("candidatesCount", { count: candidates })],
    [t("results"), t(resultsMode === "LIVE" ? "resultsLive" : "resultsSealed")],
    [t("reminder"), reminder],
  ];
  if (quorumThreshold != null) {
    rows.push([
      t("quorum"),
      t("quorumValue", {
        pct: quorumThreshold,
        voters: quorumRequiredVoters(voters, quorumThreshold),
      }),
    ]);
  }

  return (
    <section className={`${CARD} overflow-hidden`}>
      <CardHeader>{t("title")}</CardHeader>
      <dl className="px-6 py-1.5">
        {rows.map(([label, value], i) => (
          <div
            key={label}
            className={`flex items-center justify-between gap-4 py-3.25 ${i < rows.length - 1 ? "border-b border-neutral-100" : ""}`}
          >
            <dt className="text-[13.5px] text-neutral-600">{label}</dt>
            <dd className="text-right text-[13.5px] font-semibold text-neutral-800">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ActionsCard({ id, status }: { id: string; status: ElectionStatus }) {
  const t = useTranslations("dashboard.election.overview.actions");
  const [qrOpen, setQrOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);

  return (
    <section className={`${CARD} overflow-hidden`}>
      <CardHeader>{t("title")}</CardHeader>
      <div className="flex flex-col gap-3 px-6 py-4.5">
        <button
          type="button"
          onClick={() => setReminderOpen(true)}
          // Only an open election can be reminded about — the action itself
          // enforces ACTIVE, this just stops the dead click.
          disabled={status !== "ACTIVE"}
          className="flex h-12 cursor-pointer items-center gap-3 rounded-md bg-brand-700 px-4.5 text-left text-[15px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Mail className="size-4.75" aria-hidden />
          {t("sendReminder")}
        </button>
        <div className="grid gap-3 sm:grid-cols-2">
          {/* ponytail: both exports wait on the CSV-export spec (column contract +
              which voter PII a download may carry) — button, not payload, here. */}
          <button
            type="button"
            onClick={() => toast(t("exportSoon"))}
            className={ACTION_BTN}
          >
            <List className="size-4.5 shrink-0 text-neutral-600" aria-hidden />
            {t("voterList")}
          </button>
          <button
            type="button"
            onClick={() => toast(t("exportSoon"))}
            className={ACTION_BTN}
          >
            <Download
              className="size-4.5 shrink-0 text-neutral-600"
              aria-hidden
            />
            {t("exportCsv")}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setQrOpen(true)}
          className={ACTION_BTN}
        >
          <QrCode className="size-4.5 shrink-0 text-neutral-600" aria-hidden />
          {t("showQr")}
        </button>
      </div>

      <QrDialog id={id} open={qrOpen} onOpenChange={setQrOpen} />
      <SendReminderDialog
        id={id}
        open={reminderOpen}
        onOpenChange={setReminderOpen}
      />
    </section>
  );
}

// The payload is the election-level apex ballot URL — permanent and identity-free,
// so there is nothing to rotate and no "generate new code" button: a printed
// poster stays valid for the whole election.
function QrDialog({
  id,
  open,
  onOpenChange,
}: {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("dashboard.election.overview.qr");
  const url = electionVoteUrl(id);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-3rem)] w-[calc(100%-2rem)] max-w-100 -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white shadow-lg outline-none">
          <div className="flex items-start justify-between gap-3 px-6 pt-6">
            <div>
              <Dialog.Title className="font-heading text-[19px] font-semibold text-neutral-800">
                {t("title")}
              </Dialog.Title>
              <Dialog.Description className="mt-1.5 text-[13.5px] leading-relaxed text-neutral-600">
                {t("body")}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label={t("close")}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md bg-neutral-100 text-neutral-600 transition-colors hover:bg-neutral-200"
            >
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </div>

          <div className="px-6 pt-5.5 pb-6 text-center">
            <div className="inline-block rounded-2xl border border-border bg-white p-4.5 shadow-xs">
              <QRCodeSVG value={url} level="M" className="size-50" />
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-neutral-50 px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate text-left font-mono text-[12.5px] text-neutral-600">
                {url}
              </span>
              <button
                type="button"
                onClick={copy}
                className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-white px-3 text-[13px] font-semibold text-brand-700 transition-colors hover:bg-brand-50"
              >
                <Copy className="size-3.5" aria-hidden />
                {t("copy")}
              </button>
            </div>

            <div className="mt-3.5 flex items-start gap-2.25 rounded-lg border border-brand-100 bg-brand-50 px-3.5 py-3 text-left">
              <Info className="mt-px size-4 shrink-0 text-brand-700" aria-hidden />
              <span className="text-[12.5px] leading-relaxed text-brand-700">
                {t("note")}
              </span>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ActivityCard({
  status,
  opens,
  closes,
  voted24h,
}: {
  status: ElectionStatus;
  opens: string;
  closes: string;
  voted24h: number;
}) {
  const t = useTranslations("dashboard.election.overview.activity");
  const locale = useLocale();

  const items = [
    {
      icon: <Send className="size-4" aria-hidden />,
      tint: "bg-success-50 text-success-700",
      title: t(status === "SCHEDULED" ? "publishes" : "published"),
      meta: formatVotingDateTime(opens, locale),
    },
    {
      icon: <BarChart3 className="size-4" aria-hidden />,
      tint: "bg-brand-50 text-brand-700",
      title: t("votes24h", { count: voted24h }),
      meta: t("votes24hSub"),
    },
    {
      icon: <Clock className="size-4" aria-hidden />,
      tint: "bg-violet-50 text-violet-700",
      title: t("ends"),
      meta: formatVotingDateTime(closes, locale),
    },
  ];

  return (
    <section className={`${CARD} overflow-hidden`}>
      <CardHeader>{t("title")}</CardHeader>
      <div className="px-6 py-5">
        {items.map((it, i) => (
          <div key={it.title} className="flex gap-3.5">
            <div className="flex flex-col items-center">
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-full ${it.tint}`}
              >
                {it.icon}
              </span>
              {i < items.length - 1 && (
                <span className="my-1 w-0.5 flex-1 bg-neutral-200" />
              )}
            </div>
            <div className={i < items.length - 1 ? "pb-5" : ""}>
              <div className="text-sm font-semibold text-neutral-800">
                {it.title}
              </div>
              <div className="mt-0.5 text-[13px] text-neutral-600">
                {it.meta}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CardHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-border px-6 py-4.5">
      <h2 className="font-heading text-[17px] font-semibold text-neutral-800">
        {children}
      </h2>
    </div>
  );
}
