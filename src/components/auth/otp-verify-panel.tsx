"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MailCheck } from "lucide-react";
import toast from "react-hot-toast";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

// Shared OTP entry panel (otp-implementation-auth-spec §4/§5): rendered by the
// signup form right after registration and by the login form on a 403
// EMAIL_NOT_VERIFIED. In both cases a code was JUST auto-sent (sendOnSignUp /
// sendOnSignIn), so the resend button starts on cooldown — the server rate
// limit (3/15 min) is the real guard, the countdown is UX. A successful
// verify opens the session (autoSignInAfterVerification); hard nav so the
// proxy re-runs with the new cookie.

const RESEND_COOLDOWN_S = 60;

// BetterAuth error codes → localized error keys (429 is handled by status).
const ERROR_BY_CODE: Record<string, string> = {
  INVALID_OTP: "invalid",
  OTP_EXPIRED: "expired",
  TOO_MANY_ATTEMPTS: "tooMany",
};

export function OtpVerifyPanel({
  email,
  redirectTo,
}: {
  email: string;
  redirectTo: string;
}) {
  const t = useTranslations("auth.signup.form.otp");
  const [otp, setOtp] = useState("");
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);

  useEffect(() => {
    if (cooldown === 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) {
      toast.error(t("errors.invalid"));
      return;
    }
    setPending(true);
    const { error } = await authClient.emailOtp.verifyEmail({ email, otp });
    if (error) {
      toast.error(
        error.status === 429
          ? t("errors.rateLimited")
          : t(`errors.${ERROR_BY_CODE[error.code ?? ""] ?? "generic"}`),
      );
      setPending(false);
      return;
    }
    toast.success(t("success"));
    window.location.assign(redirectTo);
  }

  async function resend() {
    // Cooldown starts optimistically — double-clicks can't fire twice.
    setCooldown(RESEND_COOLDOWN_S);
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "email-verification",
    });
    if (error) {
      toast.error(
        error.status === 429 ? t("errors.rateLimited") : t("errors.generic"),
      );
      return;
    }
    toast.success(t("resent"));
  }

  return (
    <div className="flex w-full flex-col items-center gap-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-brand-50">
        <MailCheck className="size-7 text-brand-700" aria-hidden />
      </span>
      <h2 className="font-heading text-xl font-semibold text-neutral-800">
        {t("title")}
      </h2>
      <p className="text-base leading-relaxed text-neutral-600">
        {t.rich("body", {
          email: () => (
            <span className="font-medium text-neutral-950">{email}</span>
          ),
        })}
      </p>
      <form onSubmit={verify} noValidate className="flex w-full flex-col gap-4">
        {/* One styled input, not six boxes — native one-time-code autofill
            from mail apps works, zero deps (spec §4). */}
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          aria-label={t("inputLabel")}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
          autoFocus
          className="h-14 w-full rounded-md border border-neutral-200 bg-neutral-100 text-center font-mono text-2xl tracking-[0.5em] text-neutral-950 shadow-xs outline-none focus:border-brand-700 focus:bg-white focus:shadow-focus"
        />
        <Button
          type="submit"
          size="lg"
          className="h-12 text-base"
          disabled={pending}
        >
          {t("verify")}
        </Button>
      </form>
      <button
        type="button"
        onClick={resend}
        disabled={pending || cooldown > 0}
        className="text-sm text-brand-700 hover:underline disabled:cursor-default disabled:text-neutral-400 disabled:no-underline"
      >
        {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resend")}
      </button>
      <p className="text-sm text-neutral-600">{t("hint")}</p>
    </div>
  );
}
