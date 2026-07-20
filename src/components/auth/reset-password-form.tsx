"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import { TriangleAlert } from "lucide-react";
import toast from "react-hot-toast";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

// Reset-password form, reached from the emailed link. BetterAuth's endpoint
// redirects here with ?token=… (valid) or ?error=INVALID_TOKEN (bad/expired) —
// no/bad token renders the invalid panel with a CTA back to /forgot-password.
// resetPassword() burns the single-use token (VerificationToken row) and sets
// the new scrypt hash; success sends the user to sign in with it.
type Field = "password" | "confirmPassword";

const inputClass =
  "h-12 rounded-md border border-neutral-200 bg-neutral-100 px-3 text-base font-normal text-neutral-950 shadow-xs outline-none placeholder:text-neutral-400 focus:border-brand-700 focus:bg-white focus:shadow-focus aria-invalid:border-error-500";

export function ResetPasswordForm() {
  const t = useTranslations("auth.reset.form");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const urlError = searchParams.get("error");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState<Partial<Record<Field, boolean>>>({});

  const schema = z
    .object({
      password: z.string().min(8, { error: t("errors.tooShort") }),
      confirmPassword: z.string(),
    })
    .refine((d) => d.password === d.confirmPassword, {
      error: t("errors.mismatch"),
      path: ["confirmPassword"],
    });

  if (!token || urlError) {
    return (
      <div className="flex w-full flex-col items-center gap-4 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-error-50">
          <TriangleAlert className="size-7 text-error-700" aria-hidden />
        </span>
        <h2 className="font-heading text-xl font-semibold text-neutral-800">
          {t("invalid.title")}
        </h2>
        <p className="text-base leading-relaxed text-neutral-600">
          {t("invalid.body")}
        </p>
        <Link
          href="/forgot-password"
          className="font-medium text-brand-700 hover:underline"
        >
          {t("invalid.cta")}
        </Link>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ password, confirmPassword });
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
    const { error } = await authClient.resetPassword({
      newPassword: parsed.data.password,
      token: token as string,
    });
    if (error) {
      // INVALID_TOKEN = already used or expired between page load and submit.
      toast.error(
        error.code === "INVALID_TOKEN"
          ? t("errors.invalidToken")
          : t("errors.generic"),
      );
      setPending(false);
      return;
    }
    toast.success(t("success"));
    // Full navigation so the login page loads fresh (no session was opened).
    window.location.assign(`/${locale}/login`);
  }

  return (
    // noValidate — zod owns validation; browser bubbles would preempt the toasts.
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="reset-password"
          className="text-sm font-medium text-neutral-800"
        >
          {t("password")}
        </label>
        <input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          placeholder={t("passwordPlaceholder")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={invalid.password || undefined}
          aria-describedby="reset-password-helper"
          className={inputClass}
        />
        {/* Helper lives OUTSIDE the label (aria-describedby) so it doesn't
            pollute the field's accessible name. */}
        <span
          id="reset-password-helper"
          className="text-xs font-normal text-neutral-600"
        >
          {t("passwordHelper")}
        </span>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-neutral-800">
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
