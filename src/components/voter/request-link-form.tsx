"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CircleAlert, MailCheck, TriangleAlert } from "lucide-react";
import { z } from "zod";
import {
  BTN_GHOST_MD,
  BTN_PRIMARY_XL,
  StateHero,
  VoterAlert,
  VoterCard,
} from "./voter-ui";

// QR / no-token entry (voter-flow spec §4, prototype section 05): election
// header + email form → POST /api/vote/request-link → enumeration-safe "check
// your email" screen. A 429 renders the designed rate-limit alert; everything
// else well-formed gets the identical sent screen.

export function RequestLinkForm({
  electionId,
  electionTitle,
}: {
  electionId: string;
  electionTitle: string;
}) {
  const t = useTranslations("voter.flow");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async () => {
    const parsed = z.email().max(255).safeParse(email.trim());
    if (!parsed.success) {
      setError(t("qr.emailError"));
      return;
    }
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/vote/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ electionId, email: parsed.data }),
      });
      if (res.status === 429) {
        setRateLimited(true);
      } else if (res.ok) {
        setSentTo(parsed.data);
      } else {
        setError(t("qr.failed"));
      }
    } catch {
      setError(t("qr.failed"));
    } finally {
      setPending(false);
    }
  };

  // 5.3 — identical whether or not the email is on the voter list.
  if (sentTo) {
    return (
      <VoterCard>
        <StateHero
          icon={MailCheck}
          tone="brand"
          title={t("qr.sentTitle")}
          sub={t("qr.sentSub", { email: sentTo })}
          topPad
        />
        <button
          type="button"
          onClick={() => setSentTo(null)}
          className={BTN_GHOST_MD}
        >
          {t("qr.sentBack")}
        </button>
      </VoterCard>
    );
  }

  // 5.1 / 5.2 — entry form, with the rate-limit alert layered on a 429.
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
          {t("qr.overline")}
        </p>
        <h1 className="mt-2 font-heading text-3xl font-bold text-neutral-800">
          {electionTitle}
        </h1>
        <p className="mt-2.5 text-base leading-relaxed text-neutral-600">
          {t("qr.sub")}
        </p>
      </div>

      {rateLimited ? (
        <VoterAlert
          variant="warning"
          icon={TriangleAlert}
          title={t("qr.rateTitle")}
        >
          {t("qr.rateBody")}
        </VoterAlert>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="voter-email"
          className="text-sm font-medium text-neutral-800"
        >
          {t("qr.emailLabel")}
        </label>
        <input
          id="voter-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("qr.emailPlaceholder")}
          aria-invalid={error ? true : undefined}
          aria-describedby="voter-email-note"
          className={`h-12 rounded-md border bg-neutral-100 px-3 text-base text-neutral-950 shadow-xs transition-colors placeholder:text-neutral-400 focus:border-brand-700 focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-brand-700/30 ${
            error ? "border-error-500 bg-white" : "border-neutral-200"
          }`}
        />
        <p
          id="voter-email-note"
          className={`flex items-center gap-1 text-xs ${error ? "text-error-700" : "text-neutral-600"}`}
        >
          {error ? (
            <>
              <CircleAlert className="size-3.5 shrink-0" aria-hidden />
              {error}
            </>
          ) : (
            t("qr.emailHelper")
          )}
        </p>
      </div>

      <button type="submit" disabled={pending} className={BTN_PRIMARY_XL}>
        {pending ? (
          <span
            className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white"
            aria-hidden
          />
        ) : (
          t("qr.cta")
        )}
      </button>
      <p className="text-center text-xs text-neutral-600">{t("qr.privacy")}</p>
    </form>
  );
}
