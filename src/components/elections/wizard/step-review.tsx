"use client";

import { useLocale, useTranslations } from "next-intl";
import { SquarePen } from "lucide-react";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { StepCard, type WizardData } from "./wizard-shared";

// Locale-aware "24. srp 2026. 17:00" / "Jul 24, 2026, 5:00 PM" for the
// datetime-local values collected in step 4 (they are local wall-clock times,
// so no timeZone pin here — unlike elections-view's UTC-persisted dates).
export function formatWizardDateTime(value: string, locale: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "hr" ? "hr-HR" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function ReviewCard({
  title,
  suffix,
  editLabel,
  onEdit,
  children,
}: {
  title: string;
  suffix?: string;
  editLabel: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <StepCard className="mb-4 p-6">
      <div className="mb-3.5 flex items-center justify-between">
        <h2 className="font-heading text-base font-semibold text-neutral-800">
          {title}
          {suffix && (
            <span className="font-medium text-neutral-600"> · {suffix}</span>
          )}
        </h2>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-[0.8125rem] font-semibold text-brand-700 transition-colors hover:bg-brand-50"
        >
          <SquarePen className="size-3.5" />
          {editLabel}
        </button>
      </div>
      {children}
    </StepCard>
  );
}

// neutral-600, ne -400: ovo su stvarne oznake polja koja admin cita prije
// objave izbora, a -400 na bijelom je 2,54:1 (AA trazi 4,5:1).
const ROW_LABEL = "text-neutral-600";
const ROW_GRID = "grid grid-cols-[130px_1fr] gap-x-4 gap-y-3 text-sm";

// Step 5 — read-back of everything with per-section Edit jumps.
export function StepReview({
  data,
  goStep,
}: {
  data: WizardData;
  goStep: (n: number) => void;
}) {
  const t = useTranslations("dashboard.wizard.step5");
  const t1 = useTranslations("dashboard.wizard.step1");
  const t4 = useTranslations("dashboard.wizard.step4");
  const locale = useLocale();

  const enabled = [
    data.liveResults && t4("toggles.liveResults.label"),
    data.publicResults && t4("toggles.publicResults.label"),
    data.quorum && t4("quorumChip", { pct: data.quorumPct }),
    data.adminTurnoutReminder && t4("toggles.adminTurnoutReminder.label"),
    data.voterReminder24h && t4("toggles.voterReminder24h.label"),
  ].filter((x): x is string => Boolean(x));

  const startText =
    data.startMode === "manual"
      ? t("startManual")
      : data.startAt
        ? formatWizardDateTime(data.startAt, locale)
        : t("startUnset");
  const closeText = data.closeAt
    ? formatWizardDateTime(data.closeAt, locale)
    : t("closeUnset");

  const sample = data.voters
    .slice(0, 3)
    .map((v) => v.name)
    .join(", ");

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold text-neutral-800">
        {t("title")}
      </h1>
      <p className="mt-2 mb-7 text-[0.9375rem] leading-normal text-muted-foreground">
        {t("sub")}
      </p>

      <ReviewCard
        title={t("basicInfo")}
        editLabel={t("edit")}
        onEdit={() => goStep(1)}
      >
        <div className={ROW_GRID}>
          <span className={ROW_LABEL}>{t("labels.title")}</span>
          <span className="font-semibold text-neutral-800">
            {data.title.trim() || "—"}
          </span>
          <span className={ROW_LABEL}>{t("labels.description")}</span>
          <span className="text-muted-foreground">
            {data.description.trim() || t("noDescription")}
          </span>
          <span className={ROW_LABEL}>{t("labels.type")}</span>
          <span className="text-muted-foreground">
            {t1(`types.${data.electionType}.label`)} —{" "}
            {t1(`types.${data.electionType}.desc`)}
          </span>
          <span className={ROW_LABEL}>{t("labels.method")}</span>
          <span className="text-muted-foreground">
            {t1(`methods.${data.votingType}.label`)}
          </span>
        </div>
      </ReviewCard>

      <ReviewCard
        title={t("candidates")}
        suffix={t("candidateCount", { count: data.candidates.length })}
        editLabel={t("edit")}
        onEdit={() => goStep(2)}
      >
        <div className="flex flex-wrap gap-2">
          {data.candidates.map((c, i) => (
            <span
              key={`${c.name}-${i}`}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-white py-1.5 pr-3 pl-1.5"
            >
              <InitialsAvatar
                name={c.name}
                className="size-6 bg-brand-50 text-[0.6875rem] text-brand-700"
              />
              <span className="text-sm font-medium text-neutral-800">
                {c.name}
              </span>
            </span>
          ))}
        </div>
        {data.allowAbstain && (
          <div className="mt-3 text-[0.8125rem] text-muted-foreground">
            {t("abstainEnabled")}
          </div>
        )}
      </ReviewCard>

      <ReviewCard
        title={t("voters")}
        suffix={t("voterCount", { count: data.voters.length })}
        editLabel={t("edit")}
        onEdit={() => goStep(3)}
      >
        <div className="text-sm text-muted-foreground">
          {data.voters.length === 0
            ? t("noVoters")
            : t("voterSummary", {
                count: data.voters.length,
                sample,
                more: Math.max(0, data.voters.length - 3),
              })}
        </div>
      </ReviewCard>

      <ReviewCard
        title={t("settings")}
        editLabel={t("edit")}
        onEdit={() => goStep(4)}
      >
        <div className={ROW_GRID}>
          <span className={ROW_LABEL}>{t("labels.start")}</span>
          <span className="text-muted-foreground">{startText}</span>
          <span className={ROW_LABEL}>{t("labels.closes")}</span>
          <span className="text-muted-foreground">{closeText}</span>
          <span className={ROW_LABEL}>{t("labels.enabled")}</span>
          <span className="flex flex-wrap gap-1.5">
            {enabled.length === 0 ? (
              <span className="text-[0.8125rem] text-neutral-600">
                {t("defaultsOnly")}
              </span>
            ) : (
              enabled.map((label) => (
                <span
                  key={label}
                  className="inline-flex h-6 items-center rounded-full bg-brand-50 px-2.5 text-xs font-semibold text-brand-700"
                >
                  {label}
                </span>
              ))
            )}
          </span>
        </div>
      </ReviewCard>
    </div>
  );
}
