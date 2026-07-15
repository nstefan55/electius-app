"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CircleAlert } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

// Minimal phase-1 sign-in. BetterAuth is headless (no default pages), so this
// is the smallest testing UI for the spec's flows: Google OAuth + email/password.
// The full login screen (design-system layout, OTP, forgot password) is owned
// by the auth UI spec and replaces the internals of this form.
export function LoginForm() {
  const t = useTranslations("auth.login.form");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  // Localized root — the proxy rewrites "/{locale}" → the dashboard overview.
  const home = `/${locale}`;

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setFailed(false);
    setPending(true);
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      setFailed(true);
      setPending(false);
      return;
    }
    // Full navigation (not client nav) so the proxy re-runs with the new cookie.
    window.location.assign(home);
  }

  return (
    <div className="flex w-full flex-col gap-4 text-left">
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={pending}
        onClick={() =>
          authClient.signIn.social({ provider: "google", callbackURL: home })
        }
      >
        {t("google")}
      </Button>

      <div className="flex items-center gap-3 text-xs text-neutral-400">
        <span className="h-px flex-1 bg-neutral-200" />
        {t("or")}
        <span className="h-px flex-1 bg-neutral-200" />
      </div>

      <form onSubmit={submitEmail} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-neutral-800">
          {t("email")}
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 rounded-md border border-neutral-200 bg-neutral-100 px-3 text-base font-normal text-neutral-950 shadow-xs outline-none focus:border-brand-700 focus:bg-white focus:shadow-focus"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-neutral-800">
          {t("password")}
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 rounded-md border border-neutral-200 bg-neutral-100 px-3 text-base font-normal text-neutral-950 shadow-xs outline-none focus:border-brand-700 focus:bg-white focus:shadow-focus"
          />
        </label>

        {failed && (
          <p
            role="alert"
            className="flex items-center gap-1.5 text-xs text-error-700"
          >
            <CircleAlert className="size-3.5 shrink-0" aria-hidden />
            {t("error")}
          </p>
        )}

        <Button type="submit" size="lg" disabled={pending}>
          {t("submit")}
        </Button>
      </form>
    </div>
  );
}
