"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { parseCandidatesCsv } from "@/lib/wizard-csv";
import {
  CsvDropZone,
  FIELD_LABEL,
  INPUT_CLASS,
  ModeTabs,
  ProBadge,
  StepCard,
  StepHeading,
  Toggle,
  type StepProps,
} from "./wizard-shared";

// Step 2 — candidates: manual add or CSV import, abstain toggle (PRO),
// removable list with the "at least two" empty state.
export function StepCandidates({ data, patch }: StepProps) {
  const t = useTranslations("dashboard.wizard.step2");
  const [mode, setMode] = useState<"manual" | "csv">("manual");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [csvError, setCsvError] = useState<string | null>(null);

  function add() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("nameRequired"));
      return;
    }
    patch({
      candidates: [
        ...data.candidates,
        { name: trimmed, role: role.trim() || undefined },
      ],
    });
    setName("");
    setRole("");
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  }

  function importCsv(text: string) {
    const { rows, skipped } = parseCandidatesCsv(text);
    if (!rows.length) {
      setCsvError(t("csvEmpty"));
      return;
    }
    setCsvError(skipped ? t("csvSkipped", { count: skipped }) : null);
    patch({ candidates: [...data.candidates, ...rows] });
    toast.success(t("csvImported", { count: rows.length }));
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
              <span className={FIELD_LABEL}>{t("candidateName")}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={onKey}
                placeholder={t("namePlaceholder")}
                maxLength={255}
                className={`${INPUT_CLASS} h-11`}
              />
            </label>
            <label>
              <span className={FIELD_LABEL}>
                {t("candidateRole")}{" "}
                <span className="font-normal text-neutral-400">
                  · {t("optional")}
                </span>
              </span>
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                onKeyDown={onKey}
                placeholder={t("rolePlaceholder")}
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
                <span className="font-mono">name, role</span>
              </>
            }
            errors={{ notCsv: t("csvNotCsv"), tooLarge: t("csvTooLarge") }}
            onText={importCsv}
          />
        )}

        {csvError && (
          <div className="mt-4 rounded-md border border-[#FECACA] bg-error-50 px-3.5 py-3 text-[13.5px] leading-relaxed text-[#991B1B]">
            {csvError}
          </div>
        )}

        {/* Allow abstain (PRO) */}
        <div className="mt-5.5 flex items-center justify-between gap-4 rounded-[10px] border border-border bg-neutral-50/60 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-neutral-800">
                {t("allowAbstain")}
              </span>
              <ProBadge />
            </div>
            <div className="mt-0.75 text-[13px] text-muted-foreground">
              {t("allowAbstainDesc")}
            </div>
          </div>
          <Toggle
            checked={data.allowAbstain}
            onChange={() => patch({ allowAbstain: !data.allowAbstain })}
            label={t("allowAbstain")}
          />
        </div>

        {/* Candidate list */}
        <div className="mt-6">
          <div className="mb-2.5 font-heading text-sm font-semibold text-neutral-800">
            {t("count", { count: data.candidates.length })}
          </div>
          {data.candidates.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-border p-7 text-center text-sm text-neutral-400">
              {t("empty")}
            </div>
          ) : (
            <ul className="space-y-2">
              {data.candidates.map((c, i) => (
                <li
                  key={`${c.name}-${i}`}
                  className="flex items-center gap-3 rounded-[10px] border border-neutral-100 bg-white px-3.5 py-3"
                >
                  <InitialsAvatar
                    name={c.name}
                    className="size-9 bg-brand-50 text-sm text-brand-700"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold text-neutral-800">
                      {c.name}
                    </div>
                    <div className="text-[13px] text-muted-foreground">
                      {c.role || "—"}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={t("remove")}
                    onClick={() =>
                      patch({
                        candidates: data.candidates.filter((_, j) => j !== i),
                      })
                    }
                    className="flex size-8.5 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-error-50 hover:text-error-700"
                  >
                    <Trash2 className="size-4.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </StepCard>
    </div>
  );
}
