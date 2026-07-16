"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CircleAlert } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

// Minimal phase-3 sign-up mirroring the phase-1 login form. Posts to
// /api/auth/register (BetterAuth signUpEmail underneath — scrypt hash,
// autoSignIn cookie), then hard-navigates into the funnel: /setup →
// /onboarding → dashboard. TODO(auth-ui-spec): full design-system screen (OTP).
type SignupError = "mismatch" | "exists" | "tooShort" | "generic";

const ERROR_BY_CODE: Record<string, SignupError> = {
  password_mismatch: "mismatch",
  USER_ALREADY_EXISTS: "exists",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "exists", // the code v1.6.23 emits
  PASSWORD_TOO_SHORT: "tooShort",
};

const inputClass =
  "h-10 rounded-md border border-neutral-200 bg-neutral-100 px-3 text-base font-normal text-neutral-950 shadow-xs outline-none focus:border-brand-700 focus:bg-white focus:shadow-focus";

export function SignupForm() {
  const t = useTranslations("auth.signup.form");
  const locale = useLocale();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<SignupError | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("mismatch");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, password, confirmPassword }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(ERROR_BY_CODE[data?.error ?? ""] ?? "generic");
        setPending(false);
        return;
      }
      // Full navigation (not client nav) so the proxy re-runs with the new
      // session cookie; /setup is the post-signup funnel entry.
      window.location.assign(`/${locale}/setup`);
    } catch {
      setError("generic");
      setPending(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-4 text-left">
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={pending}
        onClick={() =>
          authClient.signIn.social({
            provider: "google",
            callbackURL: `/${locale}/setup`,
          })
        }
      >
        {t("google")}
      </Button>

      <div className="flex items-center gap-3 text-xs text-neutral-400">
        <span className="h-px flex-1 bg-neutral-200" />
        {t("or")}
        <span className="h-px flex-1 bg-neutral-200" />
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-neutral-800">
          {t("name")}
          <input
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-neutral-800">
          {t("email")}
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-neutral-800">
          {t("password")}
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-neutral-800">
          {t("confirmPassword")}
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass}
          />
        </label>

        {error && (
          <p
            role="alert"
            className="flex items-center gap-1.5 text-xs text-error-700"
          >
            <CircleAlert className="size-3.5 shrink-0" aria-hidden />
            {t(`errors.${error}`)}
          </p>
        )}

        <Button type="submit" size="lg" disabled={pending}>
          {t("submit")}
        </Button>
      </form>
    </div>
  );
}
