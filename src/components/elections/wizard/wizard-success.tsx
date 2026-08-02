"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { CircleCheckBig, ChevronRight, QrCode } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { electionVoteUrl } from "@/lib/urls";
import { formatWizardDateTime } from "./step-review";
import type { WizardData } from "./wizard-shared";

// Final "Election created" screen: summary + Create another / QR code toggle /
// Go to election (phase-3 spec + Election Wizard.dc.html success section).
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
  const [qrShown, setQrShown] = useState(false);
  const qrUrl = electionVoteUrl(createdId);

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
        <h1 className="font-heading text-[1.625rem] leading-tight font-bold text-neutral-800">
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

        {qrShown && (
          <div className="mb-7.5 flex flex-col items-center rounded-2xl border border-border bg-white p-6.5 text-center">
            <div className="size-49 rounded-xl border border-border bg-white p-3.5 shadow-xs">
              <QRCodeSVG value={qrUrl} level="M" className="size-full" />
            </div>
            <h2 className="mt-4.5 font-heading text-lg leading-tight font-semibold text-neutral-800">
              {data.title.trim()}
            </h2>
            <span className="mt-2 inline-flex h-5.5 items-center rounded-full bg-brand-50 px-2.5 text-xs font-semibold text-brand-700">
              {t1(`types.${data.electionType}.label`)}
            </span>
            <div className="mt-3 text-[0.84375rem] leading-normal text-muted-foreground">
              {t1(`methods.${data.votingType}.label`)} ·{" "}
              {t5("voterCount", { count: data.voters.length })} · {t("closes")}{" "}
              {closeText}
            </div>
            <div className="mt-3.5 max-w-full rounded-md border border-border bg-neutral-50 px-3.5 py-2.5 font-mono text-[0.78125rem] break-all text-neutral-800">
              {qrUrl}
            </div>
            <p className="mt-3.5 max-w-80 text-[0.78125rem] leading-normal text-neutral-600">
              {t("qrCaption")}
            </p>
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={onCreateAnother}
            className="h-12 rounded-md border border-border bg-white px-5.5 text-[0.9375rem] font-semibold text-neutral-800 transition-colors hover:bg-neutral-100"
          >
            {t("createAnother")}
          </button>
          <button
            type="button"
            aria-expanded={qrShown}
            onClick={() => setQrShown((s) => !s)}
            className="inline-flex h-12 items-center gap-2 rounded-md border border-[#BFDBFE] bg-white px-5 text-[0.9375rem] font-semibold text-brand-700 transition-colors hover:bg-brand-50"
          >
            <QrCode className="size-4.5" />
            {t(qrShown ? "qrHide" : "qrShow")}
          </button>
          <Link
            href={`/elections/${createdId}`}
            className="inline-flex h-12 items-center gap-2 rounded-md bg-primary px-6 text-[0.9375rem] font-semibold text-primary-foreground transition-colors hover:bg-brand-600"
          >
            {t("goToElection")}
            <ChevronRight className="size-4.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
