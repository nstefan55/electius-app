"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  CircleAlert,
  CircleCheckBig,
  SearchX,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  normalizeReceipt,
  RECEIPT_PATTERN,
  verifyProofInBrowser,
  type VerifyResult,
} from "@/lib/merkle-verify";
import {
  BTN_GHOST_MD,
  BTN_PRIMARY_XL,
  formatVoterDateTime,
  StateHero,
  VoterAlert,
  VoterCard,
} from "./voter-ui";

// /verify/[id] — birač provjerava svoj verifikacijski kôd. Stranica ne čita
// ništa iz baze: isti obrazac za svaki id, pa URL ne otkriva postoje li izbori.
// Poveznica sa zaslona potvrde nosi kôd u FRAGMENTU (#kôd) — fragment nikad ne
// ide poslužitelju, a nakon provjere ga brišemo iz adresne trake.

type Phase =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "done"; result: VerifyResult; proved: boolean | null }
  | { kind: "rateLimited" }
  | { kind: "error" };

// Izvan komponente: nema zatvaranja nad stanjem, pa ga efekt smije zvati bez
// ovisnosti koje se mijenjaju svakim renderom.
async function runCheck(electionId: string, code: string): Promise<Phase> {
  try {
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ electionId, code }),
    });
    if (res.status === 429) return { kind: "rateLimited" };
    if (!res.ok) return { kind: "error" };
    const result = (await res.json()) as VerifyResult;
    const proved =
      result.kind === "sealed"
        ? await verifyProofInBrowser(code, result.path, result.root)
        : null;
    return { kind: "done", result, proved };
  } catch {
    return { kind: "error" };
  }
}

export function VerifyForm({ electionId }: { electionId: string }) {
  const t = useTranslations("voter.verify");
  const locale = useLocale();
  const [code, setCode] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  useEffect(() => {
    let live = true;
    const fromHash = () => {
      const hashed = normalizeReceipt(window.location.hash.slice(1));
      if (!RECEIPT_PATTERN.test(hashed)) return;
      void runCheck(electionId, hashed).then((next) => {
        if (!live) return;
        setCode(hashed);
        setPhase(next);
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      });
    };
    fromHash();
    // Druga poveznica s potvrde u kartici koja je već na ovoj stranici mijenja
    // samo fragment — preglednik tada ne učitava stranicu ponovno.
    window.addEventListener("hashchange", fromHash);
    return () => {
      live = false;
      window.removeEventListener("hashchange", fromHash);
    };
  }, [electionId]);

  const submit = async () => {
    const normalized = normalizeReceipt(code);
    if (!RECEIPT_PATTERN.test(normalized)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setPhase({ kind: "pending" });
    setPhase(await runCheck(electionId, normalized));
  };

  const reset = () => {
    setCode("");
    setPhase({ kind: "idle" });
  };

  if (phase.kind === "done") {
    const { result, proved } = phase;
    const again = (
      <button type="button" onClick={reset} className={BTN_GHOST_MD}>
        {t("again")}
      </button>
    );

    if (result.kind === "notFound") {
      return view(
        t("notFoundTitle"),
        <VoterCard>
          <StateHero
            icon={SearchX}
            tone="warning"
            title={t("notFoundTitle")}
            sub={t("notFoundSub")}
          />
          {again}
        </VoterCard>,
      );
    }

    const electionLine = (
      <p className="text-center text-sm font-medium text-neutral-800">
        {t("electionLine", {
          title: result.election.title,
          org: result.election.organizationName,
        })}
      </p>
    );

    if (result.kind === "recorded") {
      return view(
        t("recordedTitle"),
        <VoterCard>
          <StateHero
            icon={CircleCheckBig}
            tone="brand"
            title={t("recordedTitle")}
            sub={t("recordedSub")}
          />
          {electionLine}
          {again}
        </VoterCard>,
      );
    }

    if (result.kind === "sealed") {
      const title = proved ? t("verifiedTitle") : t("failedTitle");
      const date = formatVoterDateTime(result.sealedAt, locale);
      return view(
        title,
        <VoterCard>
          <StateHero
            icon={proved ? ShieldCheck : ShieldAlert}
            tone={proved ? "success" : "error"}
            title={title}
            sub={proved ? t("verifiedSub", { date }) : t("failedSub")}
          />
          {electionLine}
          {/* Korijen je ono što birač uspoređuje s izvještajem — bez njega
              provjera bi opet ovisila o povjerenju u nas. */}
          <div className="rounded-md bg-neutral-50 p-4">
            <p className="text-xs text-neutral-600">{t("rootLabel")}</p>
            <p className="mt-1 break-all font-mono text-sm text-neutral-800">
              {result.root}
            </p>
            <p className="mt-2 text-xs text-neutral-600">
              {t("rootCompare")}
            </p>
          </div>
          {again}
        </VoterCard>,
      );
    }

    // legacy · pruned — zabilježeno i zapečaćeno, ali puta nema.
    return view(
      t("sealedTitle"),
      <VoterCard>
        <StateHero
          icon={ShieldCheck}
          tone="brand"
          title={t("sealedTitle")}
          sub={t("noProofSub")}
        />
        {electionLine}
        {again}
      </VoterCard>,
    );
  }

  const pending = phase.kind === "pending";

  return view(
    "",
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <div>
        <h1 className="font-heading text-3xl font-bold text-neutral-800">
          {t("title")}
        </h1>
        <p className="mt-2.5 text-base leading-relaxed text-neutral-600">
          {t("sub")}
        </p>
      </div>

      {phase.kind === "rateLimited" ? (
        <VoterAlert variant="warning" icon={TriangleAlert} title={t("rateTitle")}>
          {t("rateBody")}
        </VoterAlert>
      ) : null}
      {phase.kind === "error" ? (
        <VoterAlert variant="warning" icon={TriangleAlert} title={t("failed")} />
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="receipt-code"
          className="text-sm font-medium text-neutral-800"
        >
          {t("codeLabel")}
        </label>
        <textarea
          id="receipt-code"
          rows={3}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? "receipt-code-error" : undefined}
          className={`resize-none break-all rounded-md border bg-neutral-100 px-3 py-2.5 font-mono text-sm text-neutral-950 shadow-xs transition-colors focus:border-brand-700 focus:bg-white focus:shadow-focus ${
            invalid ? "border-error-500 bg-white" : "border-neutral-200"
          }`}
        />
        {invalid ? (
          <p
            id="receipt-code-error"
            className="flex items-start gap-1 text-xs text-error-700"
          >
            <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            {t("codeError")}
          </p>
        ) : null}
      </div>

      <button type="submit" disabled={pending} className={BTN_PRIMARY_XL}>
        {pending ? (
          <span
            className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white"
            aria-hidden
          />
        ) : (
          t("cta")
        )}
      </button>
      <p className="text-center text-xs leading-normal text-neutral-600">
        {t("privacy")}
      </p>
    </form>,
  );
}

// Obrazac i kartica ishoda dijele ISTU live regiju: ona ostaje montirana i
// mijenja samo tekst. Regija koja se montira zajedno s tekstom često se ne
// najavljuje, a ishod stiže bez navigacije.
function view(announce: string, node: ReactNode) {
  return (
    <div className="flex flex-col">
      <p className="sr-only" role="status">
        {announce}
      </p>
      {node}
    </div>
  );
}
