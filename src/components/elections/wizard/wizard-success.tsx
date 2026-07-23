"use client";

import { useLocale, useTranslations } from "next-intl";
import { CircleCheckBig, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { formatWizardDateTime } from "./step-review";
import type { WizardData } from "./wizard-shared";

// Final "Election created" screen (spec: summary + Create another / Go to
// election). QR sharing belongs to the phase-2.5 follow-up spec.
export function WizardSuccess({
  data,
  createdId,
  onCreateAnother,
}: {
  data: WizardData;
  createdId: string;
  onCreateAnother: () => void;
}) {
  const t = useTranslations("dashboard.wizard.success");
  const t1 = useTranslations("dashboard.wizard.step1");
  const t5 = useTranslations("dashboard.wizard.step5");
  const locale = useLocale();

  const closeText = data.closeAt
    ? formatWizardDateTime(data.closeAt, locale)
    : t5("closeUnset");

  const rows: [string, React.ReactNode][] = [
    [t("method"), t1(`methods.${data.votingType}.label`)],
    [t("candidates"), t5("candidateCount", { count: data.candidates.length })],
    [t("voters"), t5("voterCount", { count: data.voters.length })],
    [t("closes"), closeText],
    [
      t("electionId"),
      <span key="id" className="font-mono">
        {createdId}
      </span>,
    ],
  ];

  return (
    <div className="mx-auto w-full max-w-xl px-7 py-14">
      <div className="rounded-2xl border border-border bg-card px-10 py-11 text-center shadow-md">
        <div className="mx-auto mb-5.5 flex size-18 items-center justify-center rounded-full bg-success-50 text-[#16A34A]">
          <CircleCheckBig className="size-9" />
        </div>
        <h1 className="font-heading text-[26px] leading-tight font-bold text-neutral-800">
          {t("title")}
        </h1>
        <p className="mt-2.5 text-base leading-normal text-muted-foreground">
          {t.rich("body", {
            name: () => (
              <span className="font-semibold text-neutral-800">
                {data.title.trim()}
              </span>
            ),
          })}
        </p>

        <div className="my-7 rounded-lg border border-border bg-neutral-50 px-5.5 py-5 text-left">
          <div className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-2.75 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <span className="text-neutral-400">{label}</span>
                <span className="font-medium break-all text-neutral-800">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={onCreateAnother}
            className="h-12 rounded-md border border-border bg-white px-5.5 text-[15px] font-semibold text-neutral-800 transition-colors hover:bg-neutral-100"
          >
            {t("createAnother")}
          </button>
          <Link
            href={`/elections/${createdId}`}
            className="inline-flex h-12 items-center gap-2 rounded-md bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-brand-600"
          >
            {t("goToElection")}
            <ChevronRight className="size-4.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
