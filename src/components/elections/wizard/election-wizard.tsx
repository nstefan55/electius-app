"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Eye, Save, X, ChevronLeft, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { createElection, type WizardPayload } from "@/actions/create-election";
import { StepBasicInfo } from "./step-basic-info";
import { StepCandidates } from "./step-candidates";
import { StepVoters } from "./step-voters";
import { StepSettings } from "./step-settings";
import { StepReview } from "./step-review";
import { WizardSuccess } from "./wizard-success";
import { INITIAL_WIZARD_DATA, type WizardData } from "./wizard-shared";

const STEP_KEYS = ["basic", "candidates", "voters", "settings", "review"] as const;

function toPayload(data: WizardData): WizardPayload {
  return {
    title: data.title.trim(),
    description: data.description.trim() || undefined,
    electionType: data.electionType,
    votingType: data.votingType,
    allowAbstain: data.allowAbstain,
    candidates: data.candidates,
    voters: data.voters,
    startMode: data.startMode,
    startAt: data.startMode === "scheduled" ? data.startAt : "",
    closeAt: data.closeAt,
    sealedResults: data.sealedResults,
    quorumThreshold: data.quorum ? data.quorumPct : null,
    adminTurnoutReminder: data.adminTurnoutReminder,
    voterReminder24h: data.voterReminder24h,
  };
}

// 5-step creation wizard — fills the 90% modal panel mounted by
// /elections/new (design: Election Wizard.dc.html; presentation: user
// decision 2026-07-23, centered modal over the dashboard).
export function ElectionWizard() {
  const t = useTranslations("dashboard.wizard");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(INITIAL_WIZARD_DATA);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const patch = (p: Partial<WizardData>) => setData((d) => ({ ...d, ...p }));

  const stepLabel = t("stepLabel", {
    n: step,
    name: t(`steps.${STEP_KEYS[step - 1]}`),
  });

  // Same gates the design enforces on Continue, plus the schedule sanity
  // check before entering review. The server action re-validates everything.
  function validate(upTo: number): boolean {
    if (upTo >= 1 && !data.title.trim()) {
      toast.error(t("errors.titleRequired"));
      setStep(1);
      return false;
    }
    if (upTo >= 2 && data.candidates.length < 2) {
      toast.error(t("errors.candidatesRequired"));
      setStep(2);
      return false;
    }
    if (upTo >= 4 && data.startMode === "scheduled") {
      const start = new Date(data.startAt);
      const close = new Date(data.closeAt);
      if (
        !data.startAt ||
        !data.closeAt ||
        isNaN(start.getTime()) ||
        isNaN(close.getTime()) ||
        close <= start
      ) {
        toast.error(t("errors.scheduleInvalid"));
        setStep(4);
        return false;
      }
    }
    return true;
  }

  function next() {
    if (!validate(Math.min(step, 4))) return;
    setStep((s) => Math.min(5, s + 1));
  }

  function submit() {
    if (!validate(4)) return;
    startTransition(async () => {
      const res = await createElection(toPayload(data));
      if (res.success) {
        setCreatedId(res.data.id);
        router.refresh(); // the /elections list behind the modal has a new row
      } else {
        toast.error(
          res.error === "schedule"
            ? t("errors.scheduleInvalid")
            : res.error === "candidates"
              ? t("errors.candidatesRequired")
              : t("errors.createFailed"),
        );
      }
    });
  }

  function saveDraft() {
    if (!data.title.trim()) {
      toast.error(t("errors.titleRequired"));
      setStep(1);
      return;
    }
    startTransition(async () => {
      const res = await createElection(toPayload(data), true);
      if (res.success) {
        toast.success(t("draftSaved"));
        // No refresh() here — it would race and cancel the push; /elections is
        // dynamic and re-fetches fresh on navigation anyway.
        router.push("/elections");
      } else {
        toast.error(t("errors.createFailed"));
      }
    });
  }

  function createAnother() {
    setData(INITIAL_WIZARD_DATA);
    setStep(1);
    setCreatedId(null);
  }

  if (createdId) {
    return (
      <div className="flex h-full flex-col overflow-y-auto">
        <WizardSuccess
          data={data}
          createdId={createdId}
          onCreateAnother={createAnother}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex h-17 shrink-0 items-center justify-between border-b border-border bg-white px-5 sm:px-7">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/elections"
            aria-label={t("close")}
            className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-white text-muted-foreground transition-colors hover:bg-neutral-100 hover:text-neutral-800"
          >
            <X className="size-5" />
          </Link>
          <div className="min-w-0">
            <div className="truncate font-heading text-lg leading-tight font-semibold text-neutral-800">
              {t("title")}
            </div>
            <div className="mt-px text-[0.8125rem] text-muted-foreground">
              {stepLabel}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4.5">
          <span className="hidden items-center gap-1.5 text-[0.8125rem] text-neutral-600 md:flex">
            <Eye className="size-3.75" />
            {t("trustLine")}
          </span>
          <button
            type="button"
            onClick={saveDraft}
            disabled={isPending}
            className="inline-flex h-10 items-center gap-1.75 px-1.5 text-[0.9375rem] font-semibold text-muted-foreground transition-colors hover:text-brand-700 disabled:opacity-50"
          >
            <Save className="size-4.25" />
            {t("saveDraft")}
          </button>
        </div>
      </header>

      {/* Stepper */}
      <div className="shrink-0 border-b border-border bg-white px-5 py-4.5 sm:px-7">
        <div className="mx-auto flex max-w-4xl items-center">
          {STEP_KEYS.map((key, i) => {
            const n = i + 1;
            const isDone = n < step;
            const isCurrent = n === step;
            return (
              <div key={key} className={cn("flex items-center", n < 5 && "flex-1")}>
                <button
                  type="button"
                  onClick={() => setStep(n)}
                  className="group flex shrink-0 cursor-pointer items-center gap-2.5"
                >
                  <span
                    className={cn(
                      "flex size-7.5 shrink-0 items-center justify-center rounded-full border-[1.5px] font-heading text-sm font-semibold transition-colors",
                      isDone || isCurrent
                        ? "border-brand-700 bg-brand-700 text-white"
                        : "border-border bg-white text-neutral-400",
                    )}
                  >
                    {isDone ? <Check className="size-3.75" strokeWidth={2.6} /> : n}
                  </span>
                  <span
                    className={cn(
                      "font-heading text-sm whitespace-nowrap transition-colors group-hover:text-neutral-800",
                      isCurrent
                        ? "font-semibold text-neutral-800"
                        : isDone
                          ? "font-medium text-brand-700"
                          : "hidden font-medium text-neutral-400 lg:inline",
                    )}
                  >
                    {t(`steps.${key}`)}
                  </span>
                </button>
                {n < 5 && (
                  <span
                    className={cn(
                      "mx-3.5 h-0.5 min-w-5 flex-1 rounded-full",
                      isDone ? "bg-brand-700" : "bg-neutral-200",
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Scroll body */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-5 pt-9 pb-16 sm:px-7">
          {step === 1 && <StepBasicInfo data={data} patch={patch} />}
          {step === 2 && <StepCandidates data={data} patch={patch} />}
          {step === 3 && <StepVoters data={data} patch={patch} />}
          {step === 4 && <StepSettings data={data} patch={patch} />}
          {step === 5 && <StepReview data={data} goStep={setStep} />}
        </div>
      </div>

      {/* Footer nav */}
      <footer className="shrink-0 border-t border-border bg-white px-5 py-4 sm:px-7">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="inline-flex h-11.5 items-center gap-2 rounded-md border border-border bg-white px-5 text-[0.9375rem] font-semibold text-neutral-800 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:bg-white"
          >
            <ChevronLeft className="size-4.5" />
            {t("back")}
          </button>
          <span className="hidden text-[0.8125rem] text-neutral-600 sm:inline">
            {stepLabel}
          </span>
          {step === 5 ? (
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="inline-flex h-11.5 items-center gap-2 rounded-md bg-primary px-6 text-[0.9375rem] font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-brand-600 disabled:opacity-60"
            >
              <Check className="size-4.5" strokeWidth={2.4} />
              {isPending ? t("creating") : t("create")}
            </button>
          ) : (
            <button
              type="button"
              onClick={next}
              className="inline-flex h-11.5 items-center gap-2 rounded-md bg-primary px-6 text-[0.9375rem] font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-brand-600"
            >
              {t("continue")}
              <ChevronRight className="size-4.5" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
