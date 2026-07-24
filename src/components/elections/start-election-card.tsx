"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { ChevronRight, CircleCheckBig, Play, TriangleAlert } from "lucide-react";
import { startElection } from "@/actions/elections";
import { Link, useRouter } from "@/i18n/navigation";

// Manual-start screen for a DRAFT election (election-manual-start-spec, design:
// Election Start.dc.html). Two client states: the review card, and — after the
// server action succeeds — a success card. The success card deliberately does
// NOT auto-refresh: a refresh re-renders the route as ACTIVE and would unmount
// this component before the admin sees the confirmation; "View election" does it.
interface StartElectionCardProps {
  id: string;
  title: string;
  electionType: string; // STANDARD | POLL | SURVEY — keys into dashboard.wizard.step1.types
  candidates: number;
  voters: number;
  opens: string; // ISO, from DashboardElection
  closes: string;
}

const DATE_LOCALE: Record<string, string> = { hr: "hr-HR", en: "en-US" };

// "9. srp 2026. · 18:00" / "Jul 9, 2026 · 6:00 PM" — UTC like formatVotingDate,
// so output is deterministic across server/browser timezones.
function formatCloseDate(iso: string, locale: string) {
  const d = new Date(iso);
  const l = DATE_LOCALE[locale] ?? locale;
  const date = new Intl.DateTimeFormat(l, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
  const time = new Intl.DateTimeFormat(l, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(d);
  return `${date} · ${time}`;
}

function ReviewRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-4${last ? "" : " border-b border-neutral-200"}`}
    >
      <span className="text-sm text-neutral-600">{label}</span>
      <span className="text-right text-sm font-semibold text-neutral-800">
        {value}
      </span>
    </div>
  );
}

export function StartElectionCard({
  id,
  title,
  electionType,
  candidates,
  voters,
  opens,
  closes,
}: StartElectionCardProps) {
  const t = useTranslations("dashboard.election.start");
  const tTypes = useTranslations("dashboard.wizard.step1.types");
  const locale = useLocale();
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [pending, startTransition] = useTransition();

  // Unscheduled manual drafts carry endsAt === startsAt (wizard placeholder rule)
  const closeLabel =
    closes === opens ? t("notScheduled") : formatCloseDate(closes, locale);

  const handleStart = () =>
    startTransition(async () => {
      const res = await startElection(id);
      if (res.success) {
        setStarted(true);
      } else {
        toast.error(
          t(res.error === "invalidStatus" ? "errors.invalidStatus" : "errors.failed"),
        );
      }
    });

  if (started) {
    return (
      <div className="mx-auto w-full max-w-150">
        <div className="rounded-2xl border border-neutral-200 bg-white p-10 text-center shadow-sm max-sm:p-6">
          <div className="mx-auto mb-5 flex size-18 items-center justify-center rounded-full bg-success-50 text-success-700">
            <CircleCheckBig className="size-9" aria-hidden />
          </div>
          <h2 className="font-heading text-2xl font-bold text-neutral-800">
            {t("success.title")}
          </h2>
          <p className="mt-2 text-base text-neutral-600">
            {t("success.body", { count: voters })}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              href="/elections"
              className="inline-flex h-12 items-center rounded-md border border-neutral-200 bg-white px-5 text-[15px] font-semibold text-neutral-800 transition-colors hover:bg-neutral-100"
            >
              {t("success.back")}
            </Link>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-md bg-brand-700 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-brand-600"
            >
              {t("success.view")}
              <ChevronRight className="size-4.5" aria-hidden />
            </button>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-neutral-600">{t("trust")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-150">
      <div className="rounded-2xl border border-neutral-200 bg-white p-10 shadow-sm max-sm:p-6">
        <div className="text-center">
          <div className="mx-auto mb-5 flex size-18 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <CircleCheckBig className="size-8.5" aria-hidden />
          </div>
          <h2 className="font-heading text-2xl font-bold text-neutral-800">
            {t("title")}
          </h2>
          <p className="mt-2 text-[15px] text-neutral-600">{t("body")}</p>
        </div>

        <div className="mt-7 rounded-xl border border-neutral-200 bg-neutral-50 px-5 py-1.5">
          <ReviewRow
            label={t("election")}
            value={`${title} — ${tTypes(`${electionType}.label`)}`}
          />
          <ReviewRow
            label={t("candidates")}
            value={t("candidatesCount", { count: candidates })}
          />
          <ReviewRow
            label={t("voters")}
            value={t("votersCount", { count: voters })}
          />
          <ReviewRow label={t("closeDate")} value={closeLabel} />
          <ReviewRow label={t("reminder")} value={t("reminderAuto")} last />
        </div>

        <div className="mt-5 flex items-start gap-3.5 rounded-xl border border-warning-500/40 bg-warning-50 px-5 py-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning-500/20 text-warning-700">
            <TriangleAlert className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-warning-700">{t("warnTitle")}</p>
            <p className="mt-1 text-[13px] leading-normal text-warning-700">
              {t("warnBody", { count: voters })}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Link
            href="/elections"
            className="inline-flex h-12 items-center rounded-md border border-neutral-200 bg-white px-5 text-[15px] font-semibold text-neutral-800 transition-colors hover:bg-neutral-100"
          >
            {t("cancel")}
          </Link>
          <button
            type="button"
            onClick={handleStart}
            disabled={pending}
            className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-md bg-brand-700 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="size-4.5 fill-current" aria-hidden />
            {t("startCta")}
          </button>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-neutral-600">{t("trust")}</p>
    </div>
  );
}
