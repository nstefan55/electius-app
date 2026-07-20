"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import { MailCheck } from "lucide-react";
import toast from "react-hot-toast";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

// Forgot-password form: requests a BetterAuth reset link (Resend-delivered),
// then swaps to an inbox panel. Enumeration-safe — the API returns 200 whether
// or not the account exists, and the panel copy says "if an account exists".
const inputClass =
  "h-12 rounded-md border border-neutral-200 bg-neutral-100 px-3 text-base font-normal text-neutral-950 shadow-xs outline-none placeholder:text-neutral-400 focus:border-brand-700 focus:bg-white focus:shadow-focus aria-invalid:border-error-500";

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgot.form");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState(false);
  // Non-null once the request succeeded — swaps the form for the inbox panel.
  const [sentTo, setSentTo] = useState<string | null>(null);

  const schema = z.object({ email: z.email({ error: t("errors.email") }) });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email });
    if (!parsed.success) {
      setInvalid(true);
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setInvalid(false);
    setPending(true);
    const { error } = await authClient.requestPasswordReset({
      email: parsed.data.email,
      // The emailed link verifies server-side, then redirects here with
      // ?token=… (or ?error=INVALID_TOKEN) — the reset page handles both.
      redirectTo: `/${locale}/reset-password`,
    });
    if (error) {
      toast.error(t("errors.generic"));
      setPending(false);
      return;
    }
    setSentTo(parsed.data.email);
  }

  if (sentTo) {
    return (
      <div className="flex w-full flex-col items-center gap-4 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-brand-50">
          <MailCheck className="size-7 text-brand-700" aria-hidden />
        </span>
        <h2 className="font-heading text-xl font-semibold text-neutral-800">
          {t("sent.title")}
        </h2>
        <p className="text-base leading-relaxed text-neutral-600">
          {t.rich("sent.body", {
            email: () => (
              <span className="font-medium text-neutral-950">{sentTo}</span>
            ),
          })}
        </p>
        <p className="text-sm text-neutral-600">{t("sent.hint")}</p>
      </div>
    );
  }

  return (
    // noValidate — zod owns validation; browser bubbles would preempt the toasts.
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-neutral-800">
        {t("email")}
        <input
          type="email"
          autoComplete="email"
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={invalid || undefined}
          className={inputClass}
        />
      </label>
      <Button
        type="submit"
        size="lg"
        className="h-12 text-base"
        disabled={pending}
      >
        {t("submit")}
      </Button>
    </form>
  );
}
