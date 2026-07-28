"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  FIELD_LABEL,
  INPUT_CLASS,
  ProBadge,
  SelectCard,
  StepCard,
  StepHeading,
  Toggle,
  type StepProps,
  type WizardData,
} from "./wizard-shared";

// Toggle rows (design OPTION_DEFS); PRO per the phase-2 spec — auto-close is
// free-for-all, sealed results is free.
const OPTIONS = [
  { key: "sealedResults", pro: false },
  { key: "quorum", pro: true },
  // autoCloseOnDeadline maknut: glasanje se UVIJEK zatvara na rok (čistač u
  // /api/cron/activate-elections). Prekidač je obećavao suprotno, a token je
  // ionako umirao na endsAt — izbori bi ostali "otvoreni" bez ijedne žive
  // poveznice.
  { key: "adminTurnoutReminder", pro: true },
  { key: "voterReminder24h", pro: true },
] as const;

type OptionKey = (typeof OPTIONS)[number]["key"];

// Split date + optional time instead of one datetime-local: a datetime-local
// reports value="" until EVERY segment (incl. time) is typed, so date-only
// entry silently never reached state (spec: "scheduled date & time, or date
// only"). A bare date completes instantly; empty time falls back to a default.
function DateTimeField({
  label,
  timeLabel,
  value,
  defaultTime,
  onChange,
}: {
  label: string;
  timeLabel: string;
  value: string; // "YYYY-MM-DDTHH:mm" or ""
  defaultTime: string; // used when the time is left empty
  onChange: (v: string) => void;
}) {
  const [initialDate = "", initialTime = ""] = value.split("T");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);

  const update = (d: string, t: string) => {
    setDate(d);
    setTime(t);
    onChange(d ? `${d}T${t || defaultTime}` : "");
  };

  return (
    <div>
      <span className={FIELD_LABEL}>{label}</span>
      <div className="grid grid-cols-[1fr_112px] gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => update(e.target.value, time)}
          aria-label={label}
          className={`${INPUT_CLASS} h-11 text-sm`}
        />
        <input
          type="time"
          value={time}
          onChange={(e) => update(date, e.target.value)}
          aria-label={timeLabel}
          className={`${INPUT_CLASS} h-11 px-2.5 text-sm`}
        />
      </div>
    </div>
  );
}

// Step 4 — start mode (manual / scheduled) + safeguard toggles.
export function StepSettings({ data, patch }: StepProps) {
  const t = useTranslations("dashboard.wizard.step4");

  const toggle = (key: OptionKey) =>
    patch({ [key]: !data[key] } as Partial<WizardData>);

  return (
    <div>
      <StepHeading title={t("title")} sub={t("sub")} />

      {/* Timing card */}
      <StepCard className="mb-5">
        <h2 className="mb-3.5 font-heading text-base font-semibold text-neutral-800">
          {t("startMode")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectCard
            title={t("manual.label")}
            desc={t("manual.desc")}
            selected={data.startMode === "manual"}
            onClick={() => patch({ startMode: "manual" })}
          />
          <SelectCard
            title={t("scheduled.label")}
            desc={t("scheduled.desc")}
            selected={data.startMode === "scheduled"}
            onClick={() => patch({ startMode: "scheduled" })}
          />
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {data.startMode === "scheduled" && (
            <DateTimeField
              label={t("opens")}
              timeLabel={t("time")}
              value={data.startAt}
              defaultTime="00:00"
              onChange={(v) => patch({ startAt: v })}
            />
          )}
          <DateTimeField
            label={t("closes")}
            timeLabel={t("time")}
            value={data.closeAt}
            defaultTime="23:59"
            onChange={(v) => patch({ closeAt: v })}
          />
        </div>
      </StepCard>

      {/* Options card */}
      <StepCard className="px-7 pt-3 pb-5">
        <h2 className="mt-4 mb-1 font-heading text-base font-semibold text-neutral-800">
          {t("options")}
        </h2>
        {OPTIONS.map(({ key, pro }) => (
          <div
            key={key}
            className="border-b border-neutral-100 py-4 last:border-b-0"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-neutral-800">
                    {t(`toggles.${key}.label`)}
                  </span>
                  {pro && <ProBadge />}
                </div>
                <div className="mt-0.75 text-[13px] leading-relaxed text-muted-foreground">
                  {t(`toggles.${key}.desc`)}
                </div>
              </div>
              <Toggle
                checked={data[key]}
                onChange={() => toggle(key)}
                label={t(`toggles.${key}.label`)}
              />
            </div>
            {key === "quorum" && data.quorum && (
              <div className="mt-3.5 flex items-center gap-2.5 rounded-[10px] border border-border bg-neutral-50 p-3.5">
                <span className="text-[13px] font-semibold text-neutral-800">
                  {t("quorumInput")}
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={data.quorumPct}
                    onChange={(e) => {
                      const n = Math.min(
                        100,
                        Math.max(1, Number(e.target.value) || 1),
                      );
                      patch({ quorumPct: n });
                    }}
                    aria-label={t("quorumInput")}
                    className={`${INPUT_CLASS} h-9.5 w-19 px-2.5 text-right`}
                  />
                  <span className="text-[15px] font-semibold text-muted-foreground">
                    %
                  </span>
                </span>
              </div>
            )}
          </div>
        ))}
      </StepCard>
    </div>
  );
}
