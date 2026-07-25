"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Check,
  Copy,
  Mail,
  TriangleAlert,
} from "lucide-react";
import {
  BTN_GHOST_MD,
  BTN_PRIMARY_XL,
  BTN_SECONDARY_LG,
  formatVoterDateTime,
  HelpCard,
  StateHero,
  VoteProgressDots,
} from "./voter-ui";

// The 5-screen voter flow (voter-flow spec §2, prototype sections 01/02/06).
// One client component, one route — `step` state only, the URL never changes.
// Refresh restarts at screen 1, which is correct for an unsubmitted ballot.

export interface VoteFlowProps {
  token: string; // raw URL segment — lives client-side only, POSTed once
  election: {
    id: string;
    title: string;
    description: string | null;
    votingType: "SINGLE_CHOICE" | "MULTI_CHOICE";
    organizationName: string;
    endsAt: string; // ISO
    hasCloseDate: boolean;
  };
  options: { id: string; text: string; description: string | null }[];
}

type Phase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "fail" } // network / 5xx / 429 — retry is safe (token not consumed)
  | { kind: "race" } // 409 — token spent elsewhere, retrying will not help
  | { kind: "confirmed"; voteHash: string };

export function VoteFlow({ token, election, options }: VoteFlowProps) {
  const t = useTranslations("voter.flow");
  const locale = useLocale();
  const [step, setStep] = useState(1);
  const [picks, setPicks] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [copied, setCopied] = useState(false);

  const multi = election.votingType === "MULTI_CHOICE";
  const closes = election.hasCloseDate
    ? formatVoterDateTime(election.endsAt, locale)
    : null;

  const toggle = (id: string) =>
    setPicks((prev) =>
      multi
        ? prev.includes(id)
          ? prev.filter((p) => p !== id)
          : [...prev, id]
        : [id],
    );

  const submit = async () => {
    setPhase({ kind: "submitting" });
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, optionIds: picks }),
      });
      if (res.ok) {
        const { voteHash } = (await res.json()) as { voteHash: string };
        setPhase({ kind: "confirmed", voteHash });
        setStep(5);
        return;
      }
      if (res.status === 409) {
        setPhase({ kind: "race" });
        return;
      }
      if (res.status === 410) {
        // Token/election state changed mid-flow — reload; the server renders
        // the matching designed state screen (used/expired/closed).
        window.location.reload();
        return;
      }
      setPhase({ kind: "fail" });
    } catch {
      setPhase({ kind: "fail" });
    }
  };

  const downloadReceipt = (voteHash: string) => {
    const lines = [
      t("receipt.heading"),
      "",
      t("receipt.election", { title: election.title }),
      t("receipt.org", { org: election.organizationName }),
      t("receipt.time", { time: new Date().toLocaleString(locale) }),
      t("receipt.hash", { hash: voteHash }),
      "",
      t("receipt.note"),
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob([lines], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "electius-confirmation.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyHash = async (voteHash: string) => {
    await navigator.clipboard.writeText(voteHash).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // 6.2 — link consumed on another device between review and submit.
  if (phase.kind === "race") {
    return (
      <div className="flex flex-col gap-5">
        <StateHero
          icon={TriangleAlert}
          tone="warning"
          title={t("race.title")}
          sub={t("race.sub")}
          topPad
        />
        <HelpCard title={t("help.title")} body={t("help.body")} />
      </div>
    );
  }

  // 6.1 — submit failed, token NOT consumed; selection kept, retry is safe.
  if (phase.kind === "fail") {
    return (
      <div className="flex flex-col gap-5">
        <VoteProgressDots current={4} label={t("stepLabel", { step: 4 })} />
        <StateHero
          icon={TriangleAlert}
          tone="error"
          title={t("fail.title")}
          sub={t("fail.sub")}
        />
        <button type="button" onClick={submit} className={BTN_PRIMARY_XL}>
          {t("fail.retry")}
        </button>
        <button
          type="button"
          onClick={() => setPhase({ kind: "idle" })}
          className={BTN_GHOST_MD}
        >
          {t("fail.back")}
        </button>
      </div>
    );
  }

  // 1.5 — confirmed, with the verification code (§7.17).
  if (phase.kind === "confirmed") {
    return (
      <div className="flex flex-col gap-5">
        <VoteProgressDots current={5} label={t("stepLabel", { step: 5 })} />
        <StateHero
          icon={Check}
          tone="success"
          title={t("confirmed.title")}
          sub={t("confirmed.sub")}
          topPad={false}
        />
        <div className="rounded-md bg-neutral-100 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-neutral-600">{t("confirmed.hashLabel")}</p>
              <p className="mt-1 break-all font-mono text-sm text-neutral-800">
                {phase.voteHash}
              </p>
            </div>
            <button
              type="button"
              onClick={() => copyHash(phase.voteHash)}
              aria-label={t("confirmed.copyHash")}
              className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors ${copied ? "bg-success-50 text-success-700" : "text-neutral-600 hover:bg-neutral-200"}`}
            >
              {copied ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <Copy className="size-4" aria-hidden />
              )}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => downloadReceipt(phase.voteHash)}
          className={BTN_SECONDARY_LG}
        >
          {t("confirmed.download")}
        </button>
        <p className="text-center text-xs text-neutral-400">
          {t("confirmed.close")}
        </p>
      </div>
    );
  }

  const submitting = phase.kind === "submitting";
  const pickedOptions = options.filter((o) => picks.includes(o.id));

  return (
    <div className="flex flex-col gap-5">
      <VoteProgressDots current={step} label={t("stepLabel", { step })} />

      {step === 1 && (
        <>
          <StateHero
            icon={Mail}
            tone="brand"
            title={t("invite.title")}
            sub={t("invite.sub", {
              org: election.organizationName,
              title: election.title,
            })}
            topPad
          />
          <button
            type="button"
            onClick={() => setStep(2)}
            className={BTN_PRIMARY_XL}
          >
            {t("invite.cta")}
          </button>
          <p className="text-center text-xs text-neutral-400">
            {t("invite.anon")}
          </p>
        </>
      )}

      {step === 2 && (
        <>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-700">
            <span className="size-1.5 rounded-full bg-brand-500" aria-hidden />
            {t(multi ? "details.badgeMulti" : "details.badgeSingle")}
          </span>
          <h1 className="font-heading text-2xl font-bold text-neutral-800">
            {election.title}
          </h1>
          {election.description ? (
            <p className="text-base leading-relaxed text-neutral-600">
              {election.description}
            </p>
          ) : null}
          <div className="flex flex-col gap-2.5 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-neutral-600">{t("details.candLabel")}</span>
              <span className="font-semibold text-neutral-950">
                {options.length}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-neutral-600">{t("details.closesLabel")}</span>
              <span className="font-semibold text-neutral-950">
                {closes ?? t("details.closesOpenEnded")}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-neutral-600">{t("details.methodLabel")}</span>
              <span className="font-semibold text-neutral-950">
                {t(multi ? "details.methodMulti" : "details.methodSingle")}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStep(3)}
            className={BTN_PRIMARY_XL}
          >
            {t("details.cta")}
          </button>
        </>
      )}

      {step === 3 && (
        <>
          <h1 className="font-heading text-xl font-bold text-neutral-800">
            {t("cast.title")}
          </h1>
          <div className="-mt-3 flex items-baseline justify-between gap-3">
            <p className="text-sm text-neutral-600">
              {t(multi ? "cast.subMulti" : "cast.subSingle")}
            </p>
            {multi && picks.length > 0 ? (
              <span className="whitespace-nowrap text-xs font-semibold text-brand-700">
                {t("cast.counter", { count: picks.length })}
              </span>
            ) : null}
          </div>
          <div
            role={multi ? "group" : "radiogroup"}
            aria-label={t("cast.title")}
            className="flex flex-col gap-3"
          >
            {options.map((o) => {
              const selected = picks.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  role={multi ? "checkbox" : "radio"}
                  aria-checked={selected}
                  onClick={() => toggle(o.id)}
                  className={`relative min-h-16 w-full cursor-pointer rounded-2xl border-2 p-5 text-left shadow-sm transition-colors duration-150 ${
                    selected
                      ? "border-brand-700 bg-brand-50"
                      : "border-neutral-200 bg-white hover:border-brand-500 hover:bg-brand-50"
                  }`}
                >
                  {selected ? (
                    <>
                      <span
                        className="absolute inset-y-0 left-0 w-1 rounded-l-[14px] bg-brand-700"
                        aria-hidden
                      />
                      <span
                        className="absolute right-3 top-3 flex size-6 items-center justify-center rounded-full bg-brand-700 text-white"
                        aria-hidden
                      >
                        <Check className="size-3.5" />
                      </span>
                    </>
                  ) : null}
                  <span className="block pr-8 font-heading text-base font-semibold text-neutral-800">
                    {o.text}
                  </span>
                  {o.description ? (
                    <span className="mt-0.5 block text-sm text-neutral-600">
                      {o.description}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setStep(4)}
            disabled={picks.length === 0}
            className={BTN_PRIMARY_XL}
          >
            {t("cast.cta")}
          </button>
        </>
      )}

      {step === 4 && (
        <>
          <h1 className="font-heading text-xl font-bold text-neutral-800">
            {t("review.title")}
          </h1>
          <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-xs text-neutral-600">
              {multi && picks.length > 1
                ? t("review.votingForMulti", { count: picks.length })
                : t("review.votingFor")}
            </p>
            {pickedOptions.map((o) => (
              <div key={o.id} className="py-2">
                <p className="font-heading text-lg font-semibold text-neutral-800">
                  {o.text}
                </p>
                {o.description ? (
                  <p className="text-sm text-neutral-600">{o.description}</p>
                ) : null}
              </div>
            ))}
          </div>
          <p className="text-sm leading-relaxed text-neutral-600">
            {t("review.final")}
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className={BTN_PRIMARY_XL}
          >
            {submitting ? (
              <span
                className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white"
                aria-hidden
              />
            ) : (
              t("review.cta")
            )}
          </button>
          <button
            type="button"
            onClick={() => setStep(3)}
            disabled={submitting}
            className={BTN_GHOST_MD}
          >
            {t("review.back")}
          </button>
        </>
      )}
    </div>
  );
}
