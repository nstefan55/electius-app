"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { parseVotersCsv, voterRowSchema } from "@/lib/wizard-csv";
import { canUpgrade, nearCap, voterCap, type Entitlement } from "@/lib/entitlements";
import { upgradeHref } from "@/lib/upgrade-context";
import { Link } from "@/i18n/navigation";
import {
  CsvDropZone,
  FIELD_LABEL,
  INPUT_CLASS,
  ModeTabs,
  StepCard,
  StepHeading,
  type StepProps,
} from "./wizard-shared";

// Novi tab, uvijek. Stanje čarobnjaka je samo u klijentu i nigdje se ne
// sprema, pa odlazak sa stranice uništava napola složene izbore i upravo
// uvezeni CSV. Spremanje skice to ne spašava — skica se ne može ponovno
// otvoriti u čarobnjaku (način uređivanja nije izgrađen).
function UpgradeLink({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={upgradeHref("voterCap")}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </Link>
  );
}

// Step 3 — voter list: manual add (name + email, both required) or CSV
// import. Emails are deduped case-insensitively — one voter, one vote.
export function StepVoters({
  data,
  patch,
  entitlement,
}: StepProps & { entitlement: Entitlement }) {
  const t = useTranslations("dashboard.wizard.step3");
  const tu = useTranslations("dashboard.upgrade");
  const cap = voterCap(entitlement);
  // Ponuda visi o planu, ne o granici: Pro organizacija na 480 od 500 birača
  // vidi istu najavu, ali poveznica "Pogledaj planove" ondje prodaje ono što
  // već ima.
  const upsell = canUpgrade(entitlement);
  const [mode, setMode] = useState<"manual" | "csv">("manual");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [csvError, setCsvError] = useState<string | null>(null);

  const has = (em: string) =>
    data.voters.some((v) => v.email.toLowerCase() === em.toLowerCase());

  function add() {
    const parsed = voterRowSchema.safeParse({
      name: name.trim(),
      email: email.trim(),
    });
    if (!name.trim()) {
      toast.error(t("nameRequired"));
      return;
    }
    if (!parsed.success) {
      toast.error(t("emailInvalid"));
      return;
    }
    if (has(parsed.data.email)) {
      toast.error(t("emailDuplicate"));
      return;
    }
    patch({ voters: [...data.voters, parsed.data] });
    setName("");
    setEmail("");
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  }

  function importCsv(text: string) {
    const { rows, skipped } = parseVotersCsv(text);
    const fresh = rows.filter((r) => !has(r.email));
    if (!fresh.length) {
      setCsvError(t("csvEmpty"));
      return;
    }
    setCsvError(skipped ? t("csvSkipped", { count: skipped }) : null);
    patch({ voters: [...data.voters, ...fresh] });
    toast.success(t("csvImported", { count: fresh.length }));
  }

  return (
    <div>
      <StepHeading title={t("title")} sub={t("sub")} />
      <StepCard>
        <ModeTabs
          mode={mode}
          onChange={(m) => {
            setMode(m);
            setCsvError(null);
          }}
          manualLabel={t("addManually")}
          csvLabel={t("uploadCsv")}
        />

        {mode === "manual" ? (
          <div className="grid items-end gap-2.5 sm:grid-cols-[1fr_1fr_auto]">
            <label>
              <span className={FIELD_LABEL}>{t("fullName")}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={onKey}
                placeholder={t("namePlaceholder")}
                maxLength={200}
                className={`${INPUT_CLASS} h-11`}
              />
            </label>
            <label>
              <span className={FIELD_LABEL}>{t("email")}</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={onKey}
                placeholder={t("emailPlaceholder")}
                maxLength={255}
                className={`${INPUT_CLASS} h-11`}
              />
            </label>
            <button
              type="button"
              onClick={add}
              className="h-11 rounded-md bg-primary px-4.5 text-sm font-semibold whitespace-nowrap text-primary-foreground transition-colors hover:bg-brand-600"
            >
              {t("add")}
            </button>
          </div>
        ) : (
          <CsvDropZone
            title={t("dropTitle")}
            hint={
              <>
                {t("dropHintPrefix")}{" "}
                <span className="font-mono">full_name, email</span>
              </>
            }
            errors={{ notCsv: t("csvNotCsv"), tooLarge: t("csvTooLarge") }}
            onText={importCsv}
          />
        )}

        {csvError && (
          <div className="mt-4 rounded-md border border-[#FECACA] bg-error-50 px-3.5 py-3 text-[0.84375rem] leading-relaxed text-[#991B1B]">
            {csvError}
          </div>
        )}

        {/* Granica plana. Preko granice je odbijanje (createElection ga
            provodi), na ≥80% samo tiha najava — otkriti granicu tek pri
            spremanju, s 300 pripremljenih redaka, je najskuplji trenutak. */}
        {data.voters.length > cap ? (
          <div className="mt-4 rounded-md border-l-[3px] border-error-500 bg-error-50 px-4 py-3.5 text-[0.84375rem] leading-relaxed text-error-700">
            <p className="font-semibold">{t("capTitle")}</p>
            <p className="mt-0.5">
              {t("capBody", { cap, current: data.voters.length })}
            </p>
            {upsell && (
              <UpgradeLink className="mt-1.5 inline-block font-semibold underline underline-offset-2">
                {t("capLink")}
              </UpgradeLink>
            )}
          </div>
        ) : (
          nearCap(data.voters.length, cap) && (
            <p className="mt-4 text-[0.84375rem] text-neutral-600">
              {t("capUsage", { used: data.voters.length, cap })}
              {upsell && (
                <>
                  {" "}
                  <UpgradeLink className="font-semibold text-brand-700 underline underline-offset-2">
                    {tu("learnMore")}
                  </UpgradeLink>
                </>
              )}
            </p>
          )
        )}

        {/* Voter list */}
        <div className="mt-6">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="font-heading text-sm font-semibold text-neutral-800">
              {t("count", { count: data.voters.length })}
            </span>
            {data.voters.length > 0 && (
              <button
                type="button"
                onClick={() => patch({ voters: [] })}
                className="text-[0.8125rem] font-semibold text-neutral-400 transition-colors hover:text-brand-700"
              >
                {t("removeAll")}
              </button>
            )}
          </div>
          <div className="overflow-hidden rounded-[10px] border border-neutral-100">
            {data.voters.length === 0 ? (
              <div className="p-7 text-center text-sm text-neutral-400">
                {t("empty")}
              </div>
            ) : (
              <ul>
                {data.voters.map((v, i) => (
                  <li
                    key={v.email}
                    className="flex items-center gap-3 border-b border-neutral-100 bg-white px-3.5 py-2.75 last:border-b-0"
                  >
                    <InitialsAvatar
                      name={v.name}
                      className="size-8 bg-[#F1F5F9] text-xs text-[#475569]"
                    />
                    <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                      <span className="text-sm font-semibold text-neutral-800">
                        {v.name}
                      </span>
                      <span className="font-mono text-[0.8125rem] text-muted-foreground">
                        {v.email}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label={t("remove")}
                      onClick={() =>
                        patch({
                          voters: data.voters.filter((_, j) => j !== i),
                        })
                      }
                      className="flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-error-50 hover:text-error-700"
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </StepCard>
    </div>
  );
}
