"use client";

import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import {
  INPUT_CLASS,
  SelectCard,
  StepCard,
  StepHeading,
  type StepProps,
} from "./wizard-shared";

const TYPES = ["STANDARD", "SURVEY", "POLL"] as const;

// Step 1 — title, description, election type × voting method with the
// coupling rule: survey → multi only, quick poll → single only.
export function StepBasicInfo({ data, patch }: StepProps) {
  const t = useTranslations("dashboard.wizard.step1");

  const singleDisabled = data.electionType === "SURVEY";
  const multiDisabled = data.electionType === "POLL";

  function pickType(type: (typeof TYPES)[number]) {
    const votingType =
      type === "SURVEY"
        ? "MULTI_CHOICE"
        : type === "POLL"
          ? "SINGLE_CHOICE"
          : data.votingType;
    patch({ electionType: type, votingType });
  }

  const methodNote =
    data.electionType === "SURVEY"
      ? t("noteSurvey")
      : data.electionType === "POLL"
        ? t("notePoll")
        : t("noteStandard");

  return (
    <div>
      <StepHeading title={t("title")} sub={t("sub")} />
      <StepCard>
        <label className="block">
          <span className="mb-1.75 block text-sm font-semibold text-neutral-800">
            {t("electionTitle")} <span className="text-error-700">*</span>
          </span>
          <input
            value={data.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder={t("titlePlaceholder")}
            maxLength={255}
            className={`${INPUT_CLASS} h-11.5 text-base`}
          />
        </label>

        <label className="mt-5.5 block">
          <span className="mb-1.75 block text-sm font-semibold text-neutral-800">
            {t("description")}{" "}
            <span className="font-normal text-neutral-400">
              · {t("optional")}
            </span>
          </span>
          <textarea
            value={data.description}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder={t("descriptionPlaceholder")}
            maxLength={2000}
            className={`${INPUT_CLASS} min-h-24 resize-y py-3 leading-normal`}
          />
        </label>

        <div className="mt-5.5 mb-2.5 text-sm font-semibold text-neutral-800">
          {t("electionType")}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {TYPES.map((type) => (
            <SelectCard
              key={type}
              title={t(`types.${type}.label`)}
              desc={t(`types.${type}.desc`)}
              selected={data.electionType === type}
              badge={
                type === "STANDARD" ? (
                  <span className="inline-flex h-4.25 items-center rounded-full bg-neutral-100 px-1.5 text-[9.5px] font-bold tracking-wide text-neutral-600">
                    {t("defaultBadge")}
                  </span>
                ) : undefined
              }
              onClick={() => pickType(type)}
            />
          ))}
        </div>

        <div className="mt-5.5 mb-2.5 text-sm font-semibold text-neutral-800">
          {t("votingMethod")}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectCard
            title={t("methods.SINGLE_CHOICE.label")}
            desc={t("methods.SINGLE_CHOICE.desc")}
            selected={data.votingType === "SINGLE_CHOICE" && !singleDisabled}
            disabled={singleDisabled}
            onClick={() => {
              if (singleDisabled) {
                toast.error(t("singleUnavailable"));
                return;
              }
              patch({ votingType: "SINGLE_CHOICE" });
            }}
          />
          <SelectCard
            title={t("methods.MULTI_CHOICE.label")}
            desc={t("methods.MULTI_CHOICE.desc")}
            selected={data.votingType === "MULTI_CHOICE" && !multiDisabled}
            disabled={multiDisabled}
            onClick={() => {
              if (multiDisabled) {
                toast.error(t("multiUnavailable"));
                return;
              }
              patch({ votingType: "MULTI_CHOICE" });
            }}
          />
        </div>
        <p className="mt-3 text-[12.5px] text-neutral-400">{methodNote}</p>
      </StepCard>
    </div>
  );
}
