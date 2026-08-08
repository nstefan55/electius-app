"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  FIELD_LABEL,
  INPUT_CLASS,
  SelectCard,
  StepCard,
  StepHeading,
  Toggle,
  type StepProps,
  type WizardData,
} from "./wizard-shared";
import { ProBadge, SoonBadge } from "@/components/ui/plan-badge";
import {
  canUseAutoReminders,
  canUseLiveResults,
  type Entitlement,
} from "@/lib/entitlements";
import { upgradeHref, type UpgradeFeature } from "@/lib/upgrade-context";
import { Link } from "@/i18n/navigation";

// Prekidači (design OPTION_DEFS). Kvorum je besplatan od 2026-08-03 — zakonski
// uvjet valjanosti skupštine, ne dodatna pogodnost.
const OPTIONS = [
  { key: "liveResults", pro: true, soon: false },
  // Jedini pisač stupca resultsVisible (public-results-page-spec D1c). Javna
  // stranica je besplatna na svakom planu. Stoji uz liveResults jer su to dvije
  // okomite osi istog pitanja: resultsMode = kad ADMINISTRATOR vidi zbroj,
  // resultsVisible = je li JAVNA stranica upaljena.
  { key: "publicResults", pro: false, soon: false },
  { key: "quorum", pro: false, soon: false },
  // autoCloseOnDeadline maknut: glasanje se UVIJEK zatvara na rok (čistač u
  // /api/cron/activate-elections). Prekidač je obećavao suprotno, a token je
  // ionako umirao na endsAt — izbori bi ostali "otvoreni" bez ijedne žive
  // poveznice.
  // Inertan namjerno (pro-features §3): stupac postoji i čarobnjak ga je pisao,
  // ali NIŠTA nikad nije slalo nijednu poruku, a vrijednost se poslije stvaranja
  // nigdje ni ne prikazuje. Prekidač koji administrator uključi i koji zatim ne
  // učini ništa je obećanje prekršeno u trenutku najvećeg povjerenja. Značajka
  // nije ni projektirana — kadenca, primatelj, sadržaj i odjava su sve otvorena
  // pitanja (§3.2) — pa ostaje vidljiva kao najava, a ne kao kontrola.
  // Ukloniti `soon` kad se pošiljatelj doista izgradi; ostatak ožičenja radi.
  { key: "adminTurnoutReminder", pro: true, soon: true },
  { key: "voterReminder24h", pro: true, soon: false },
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
export function StepSettings({
  data,
  patch,
  entitlement,
}: StepProps & { entitlement: Entitlement }) {
  const t = useTranslations("dashboard.wizard.step4");
  const tu = useTranslations("dashboard.upgrade");

  const toggle = (key: OptionKey) =>
    patch({ [key]: !data[key] } as Partial<WizardData>);

  // Vraća ZAKLJUČANU značajku ili null — ne boolean, jer se iz iste vrijednosti
  // gradi i href, pa se parametar i zaštita ne mogu razići.
  //
  // `locked` nije `soon`: `soon` znači "nije izgrađeno", `locked` znači
  // "izgrađeno, ali još nije vaše". Različite oznake, različit tekst, i samo
  // jedno od toga se smije prodavati.
  const lockedFeature = (key: OptionKey): UpgradeFeature | null =>
    key === "liveResults" && !canUseLiveResults(entitlement)
      ? "liveResults"
      : key === "voterReminder24h" && !canUseAutoReminders(entitlement)
        ? "voterReminder24h"
        : null;

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
        {OPTIONS.map(({ key, pro, soon }) => {
          // `soon` ima prednost nad zaključavanjem: značajka koja ne postoji ne
          // smije se nuditi na prodaju.
          const feature = soon ? null : lockedFeature(key);
          const inert = soon || feature !== null;
          return (
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
                  {soon && <SoonBadge />}
                </div>
                <div className="mt-0.75 text-[0.8125rem] leading-relaxed text-muted-foreground">
                  {t(`toggles.${key}.desc`)}
                  {/* Poveznica je JEDINI fokusabilni element zaključanog retka —
                      i zato je objašnjenje uopće dohvatljivo tipkovnicom. Nikad
                      samo na hover: inertan prekidač se ne može fokusirati, a
                      dodir hover nema. */}
                  {feature && (
                    <>
                      {" "}
                      <Link
                        href={upgradeHref(feature)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-brand-700 underline underline-offset-2"
                      >
                        {tu("learnMore")}
                      </Link>
                    </>
                  )}
                </div>
              </div>
              {inert ? (
                // Nacrtani prekidač, ne kontrola (isti obrazac kao kartica
                // prilagodbi na /settings). Skriven od čitača ekrana jer je
                // slika, a NE aria-disabled na retku: opis mora ostati čitljiv,
                // inače čitač javi "nedostupno" i objašnjenje se nikad ne
                // pročita. Sakriva se prikaz, nikad obrazloženje.
                <span
                  aria-hidden
                  className="relative inline-block h-6.5 w-11 shrink-0 rounded-full bg-neutral-200"
                >
                  <span className="absolute top-0.75 left-0.75 size-5 rounded-full bg-white shadow-xs" />
                </span>
              ) : (
                <Toggle
                  checked={data[key]}
                  onChange={() => toggle(key)}
                  label={t(`toggles.${key}.label`)}
                />
              )}
            </div>
            {key === "quorum" && data.quorum && (
              <div className="mt-3.5 flex items-center gap-2.5 rounded-[10px] border border-border bg-neutral-50 p-3.5">
                <span className="text-[0.8125rem] font-semibold text-neutral-800">
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
                  <span className="text-[0.9375rem] font-semibold text-muted-foreground">
                    %
                  </span>
                </span>
              </div>
            )}
          </div>
          );
        })}
      </StepCard>
    </div>
  );
}
