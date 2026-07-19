"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import toast from "react-hot-toast";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { GoogleIcon } from "@/components/auth/google-icon";

// Sign-in form (auth-phase-4 UI over the phase-1 BetterAuth wiring): Google
// OAuth + email/password, zod-validated, errors/success via toast. Invalid
// fields get the design-system error border through aria-invalid.
type Field = "email" | "password";

const inputClass =
  "h-12 rounded-md border border-neutral-200 bg-neutral-100 px-3 text-base font-normal text-neutral-950 shadow-xs outline-none placeholder:text-neutral-400 focus:border-brand-700 focus:bg-white focus:shadow-focus aria-invalid:border-error-500";

export function LoginForm() {
  const t = useTranslations("auth.login.form");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState<Partial<Record<Field, boolean>>>({});

  // Localized root — the proxy rewrites "/{locale}" → the dashboard overview.
  const home = `/${locale}`;

  const schema = z.object({
    email: z.email({ error: t("errors.email") }),
    password: z.string().min(1, { error: t("errors.password") }),
  });

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
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
    const { error } = await authClient.signIn.email({
      email: parsed.data.email,
      password: parsed.data.password,
      rememberMe,
    });
    if (error) {
      // 403 = EMAIL_NOT_VERIFIED — the attempt itself re-sent a fresh
      // verification link (sendOnSignIn), so the toast points at the inbox.
      toast.error(error.status === 403 ? t("errors.unverified") : t("error"));
      setPending(false);
      return;
    }
    toast.success(t("success"));
    // Full navigation (not client nav) so the proxy re-runs with the new cookie.
    window.location.assign(home);
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
          authClient.signIn.social({ provider: "google", callbackURL: home })
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
      <form onSubmit={submitEmail} noValidate className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-neutral-800">
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

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <label
              htmlFor="login-password"
              className="text-sm font-medium text-neutral-800"
            >
              {t("password")}
            </label>
            {/* ponytail: dead link — forgot-password/OTP is its own open thread. */}
            <a href="#" className="text-[13px] text-brand-700 hover:underline">
              {t("forgotPassword")}
            </a>
          </div>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            placeholder={t("passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={invalid.password || undefined}
            className={inputClass}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-950">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="size-4 accent-brand-700"
          />
          {t("rememberMe")}
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
