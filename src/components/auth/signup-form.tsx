"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import { MailCheck } from "lucide-react";
import toast from "react-hot-toast";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { GoogleIcon } from "@/components/auth/google-icon";

// Sign-up form (auth-phase-4 UI over the phase-3 registration wiring): posts to
// /api/auth/register (BetterAuth signUpEmail — scrypt hash), zod-validated,
// errors via toast. With requireEmailVerification a successful signup opens no
// session — the form swaps to a "check your inbox" panel; clicking the emailed
// link verifies, auto-signs-in and lands on /{locale}/setup.
type Field = "name" | "email" | "password" | "confirmPassword" | "terms";

type SignupError = "mismatch" | "exists" | "tooShort" | "generic";

const ERROR_BY_CODE: Record<string, SignupError> = {
  password_mismatch: "mismatch",
  USER_ALREADY_EXISTS: "exists",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "exists", // the code v1.6.23 emits
  PASSWORD_TOO_SHORT: "tooShort",
};

const inputClass =
  "h-12 rounded-md border border-neutral-200 bg-neutral-100 px-3 text-base font-normal text-neutral-950 shadow-xs outline-none placeholder:text-neutral-400 focus:border-brand-700 focus:bg-white focus:shadow-focus aria-invalid:border-error-500";

const labelClass = "flex flex-col gap-1.5 text-sm font-medium text-neutral-800";

export function SignupForm() {
  const t = useTranslations("auth.signup.form");
  const locale = useLocale();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState<Partial<Record<Field, boolean>>>({});
  // Non-null once registration succeeded — swaps the form for the inbox panel.
  const [sentTo, setSentTo] = useState<string | null>(null);

  const schema = z
    .object({
      name: z.string().trim().min(1, { error: t("errors.name") }),
      email: z.email({ error: t("errors.email") }),
      password: z.string().min(8, { error: t("errors.tooShort") }),
      confirmPassword: z.string(),
      terms: z.literal(true, { error: t("errors.terms") }),
    })
    .refine((d) => d.password === d.confirmPassword, {
      error: t("errors.mismatch"),
      path: ["confirmPassword"],
    });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({
      name,
      email,
      password,
      confirmPassword,
      terms,
    });
    if (!parsed.success) {
      const bad: Partial<Record<Field, boolean>> = {};
      for (const issue of parsed.error.issues) {
        bad[issue.path[0] as Field] = true;
      }
      setInvalid(bad);
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setInvalid({});
    setPending(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, password, confirmPassword, locale }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        data?: { verificationRequired?: boolean };
      } | null;
      if (!res.ok) {
        toast.error(t(`errors.${ERROR_BY_CODE[data?.error ?? ""] ?? "generic"}`));
        setPending(false);
        return;
      }
      if (data?.data?.verificationRequired === false) {
        // Verification disabled (EMAIL_VERIFICATION_ENABLED=false) — the 201
        // carried the autoSignIn cookie; hard nav so the proxy re-runs with it.
        window.location.assign(`/${locale}/setup`);
        return;
      }
      // No session cookie until the emailed link is clicked — stay here and
      // point at the inbox instead of navigating into the (gated) funnel.
      setSentTo(parsed.data.email);
    } catch {
      toast.error(t("errors.generic"));
      setPending(false);
    }
  }

  if (sentTo) {
    return (
      <div className="flex w-full flex-col items-center gap-4 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-brand-50">
          <MailCheck className="size-7 text-brand-700" aria-hidden />
        </span>
        <h2 className="font-heading text-xl font-semibold text-neutral-800">
          {t("verify.title")}
        </h2>
        <p className="text-base leading-relaxed text-neutral-600">
          {t.rich("verify.body", {
            email: () => (
              <span className="font-medium text-neutral-950">{sentTo}</span>
            ),
          })}
        </p>
        <p className="text-sm text-neutral-600">{t("verify.hint")}</p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5 text-left">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-12 gap-2.5 text-base"
        disabled={pending}
        onClick={() =>
          authClient.signIn.social({
            provider: "google",
            callbackURL: `/${locale}/setup`,
          })
        }
      >
        <GoogleIcon />
        {t("google")}
      </Button>

      <div className="flex items-center gap-3 text-[13px] whitespace-nowrap text-neutral-400">
        <span className="h-px flex-1 bg-neutral-200" />
        {t("or")}
        <span className="h-px flex-1 bg-neutral-200" />
      </div>

      {/* noValidate — zod owns validation; browser bubbles would preempt the toasts. */}
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <label className={labelClass}>
          {t("name")}
          <input
            type="text"
            autoComplete="name"
            placeholder={t("namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={invalid.name || undefined}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          {t("email")}
          <input
            type="email"
            autoComplete="email"
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={invalid.email || undefined}
            className={inputClass}
          />
        </label>
        {/* Helper lives OUTSIDE the label (aria-describedby) so it doesn't
            pollute the field's accessible name. */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="signup-password"
            className="text-sm font-medium text-neutral-800"
          >
            {t("password")}
          </label>
          <input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            placeholder={t("passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={invalid.password || undefined}
            aria-describedby="signup-password-helper"
            className={inputClass}
          />
          <span
            id="signup-password-helper"
            className="text-xs font-normal text-neutral-600"
          >
            {t("passwordHelper")}
          </span>
        </div>
        <label className={labelClass}>
          {t("confirmPassword")}
          <input
            type="password"
            autoComplete="new-password"
            placeholder={t("confirmPasswordPlaceholder")}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            aria-invalid={invalid.confirmPassword || undefined}
            className={inputClass}
          />
        </label>

        <label className="flex items-start gap-2 text-sm leading-normal text-neutral-950">
          <input
            type="checkbox"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            className="mt-0.75 size-4 shrink-0 accent-brand-700"
          />
          <span>
            {/* ponytail: terms/privacy pages don't exist yet — links land with the legal pages. */}
            {t.rich("terms", {
              terms: (chunks) => (
                <a href="#" className="text-brand-700 hover:underline">
                  {chunks}
                </a>
              ),
              privacy: (chunks) => (
                <a href="#" className="text-brand-700 hover:underline">
                  {chunks}
                </a>
              ),
            })}
          </span>
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
    </div>
  );
}
