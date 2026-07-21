"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import toast from "react-hot-toast";
import { Check, KeyRound } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/client";
import { updateProfile } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { SettingsCard } from "@/components/settings/settings-card";

// "Your profile" card (profile-settings phase 1, merged with the
// settings-profile-card spec): name fields, read-only email + Verified badge,
// avatar / member-since / usage stats, and the inline password sub-form
// (credential accounts only — Google-only users never see it).
const inputClass =
  "h-11 w-full rounded-md border border-neutral-200 bg-neutral-100 px-3 text-base font-normal text-neutral-950 shadow-xs outline-none placeholder:text-neutral-400 focus:border-brand-700 focus:bg-white focus:shadow-focus aria-invalid:border-error-500";

const labelClass = "text-sm font-medium text-neutral-800";

interface ProfileCardProps {
  initialFirstName: string;
  initialLastName: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  memberSince: string;
  activeElections: number;
  totalElections: number;
  hasPassword: boolean;
  organizationName: string;
}

type PasswordField = "current" | "next" | "confirm";

export function ProfileCard({
  initialFirstName,
  initialLastName,
  email,
  emailVerified,
  image,
  memberSince,
  activeElections,
  totalElections,
  hasPassword,
  organizationName,
}: ProfileCardProps) {
  const t = useTranslations("dashboard.settings.profile");
  const router = useRouter();

  const [saved, setSaved] = useState({
    first: initialFirstName,
    last: initialLastName,
  });
  const [first, setFirst] = useState(initialFirstName);
  const [last, setLast] = useState(initialLastName);
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState<{ first?: boolean; last?: boolean }>(
    {},
  );

  const dirty = first.trim() !== saved.first || last.trim() !== saved.last;

  const nameSchema = z.object({
    first: z.string().trim().min(1, { error: t("form.errors.firstName") }),
    last: z.string().trim().min(1, { error: t("form.errors.lastName") }),
  });

  async function saveProfile() {
    const parsed = nameSchema.safeParse({ first, last });
    if (!parsed.success) {
      const bad: { first?: boolean; last?: boolean } = {};
      for (const issue of parsed.error.issues) {
        bad[issue.path[0] as "first" | "last"] = true;
      }
      setInvalid(bad);
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setInvalid({});
    setPending(true);
    const result = await updateProfile({
      firstName: parsed.data.first,
      lastName: parsed.data.last,
    });
    setPending(false);
    if (!result.success) {
      toast.error(t("form.errors.generic"));
      return;
    }
    setSaved({ first: parsed.data.first, last: parsed.data.last });
    toast.success(t("form.success"));
    router.refresh(); // sidebar account block re-reads the session name
  }

  // ── Password sub-form (collapsed by default) ──
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwords, setPasswords] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [passwordPending, setPasswordPending] = useState(false);
  const [passwordInvalid, setPasswordInvalid] = useState<
    Partial<Record<PasswordField, boolean>>
  >({});

  const passwordSchema = z
    .object({
      current: z.string().min(1, { error: t("password.errors.current") }),
      next: z.string().min(8, { error: t("password.errors.min") }),
      confirm: z.string(),
    })
    .refine((v) => v.next === v.confirm, {
      error: t("password.errors.match"),
      path: ["confirm"],
    });

  function closePasswordForm() {
    setPasswordOpen(false);
    setPasswords({ current: "", next: "", confirm: "" });
    setPasswordInvalid({});
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(passwords);
    if (!parsed.success) {
      const bad: Partial<Record<PasswordField, boolean>> = {};
      for (const issue of parsed.error.issues) {
        bad[issue.path[0] as PasswordField] = true;
      }
      setPasswordInvalid(bad);
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setPasswordInvalid({});
    setPasswordPending(true);
    // Password change is a security event: other sessions die, this one lives.
    const { error } = await authClient.changePassword({
      currentPassword: parsed.data.current,
      newPassword: parsed.data.next,
      revokeOtherSessions: true,
    });
    setPasswordPending(false);
    if (error) {
      if (error.code === "INVALID_PASSWORD") {
        setPasswordInvalid({ current: true });
        toast.error(t("password.errors.current"));
      } else {
        toast.error(t("password.errors.generic"));
      }
      return;
    }
    toast.success(t("password.success"));
    closePasswordForm();
  }

  const fullName = `${first.trim()} ${last.trim()}`.trim() || email;

  return (
    <SettingsCard
      title={t("title")}
      subtitle={t("subtitle", { orgName: organizationName })}
      footer={
        <Button disabled={!dirty || pending} onClick={saveProfile}>
          {t("form.save")}
        </Button>
      }
    >
      {/* Avatar · member-since · usage stats */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {image ? (
            // Plain <img> — Google avatar hosts aren't in next/image remotePatterns.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              className="size-14 shrink-0 rounded-full border border-neutral-200 object-cover"
            />
          ) : (
            <InitialsAvatar
              name={fullName}
              className="size-14 bg-brand-100 text-xl text-brand-700"
            />
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-neutral-800">
              {fullName}
            </div>
            <div className="mt-0.5 text-xs text-neutral-600">
              {t("memberSince", { date: memberSince })}
            </div>
          </div>
        </div>
        <dl className="flex gap-6">
          {(
            [
              ["active", activeElections],
              ["total", totalElections],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className="text-right">
              <dd className="font-heading text-xl font-semibold text-neutral-800">
                {value}
              </dd>
              <dt className="text-xs text-neutral-600">
                {t(`stats.${key}`, { count: value })}
              </dt>
            </div>
          ))}
        </dl>
      </div>

      {/* Name fields */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={`flex flex-col gap-1.5 ${labelClass}`}>
          {t("form.firstName")}
          <input
            type="text"
            autoComplete="given-name"
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            aria-invalid={invalid.first || undefined}
            className={inputClass}
          />
        </label>
        <label className={`flex flex-col gap-1.5 ${labelClass}`}>
          {t("form.lastName")}
          <input
            type="text"
            autoComplete="family-name"
            value={last}
            onChange={(e) => setLast(e.target.value)}
            aria-invalid={invalid.last || undefined}
            className={inputClass}
          />
        </label>
      </div>

      {/* Email (read-only) */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <label htmlFor="settings-email" className={labelClass}>
            {t("form.email")}
          </label>
          {emailVerified && (
            <span className="inline-flex h-5 items-center gap-1 rounded-full bg-success-50 px-2 text-[11px] font-semibold text-success-700">
              <Check className="size-2.75" strokeWidth={3} />
              {t("form.verified")}
            </span>
          )}
        </div>
        <input
          id="settings-email"
          type="email"
          value={email}
          readOnly
          aria-describedby="settings-email-helper"
          className="h-11 w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 text-base text-neutral-600 outline-none"
        />
        <span
          id="settings-email-helper"
          className="text-xs text-neutral-600"
        >
          {t("form.emailHelper")}
        </span>
      </div>

      {/* Password change — credential accounts only */}
      {hasPassword &&
        (passwordOpen ? (
          <form
            onSubmit={changePassword}
            noValidate
            className="flex flex-col gap-4 rounded-md border border-neutral-200 bg-neutral-50 p-4"
          >
            <label className={`flex flex-col gap-1.5 ${labelClass}`}>
              {t("password.current")}
              <input
                type="password"
                autoComplete="current-password"
                value={passwords.current}
                onChange={(e) =>
                  setPasswords((p) => ({ ...p, current: e.target.value }))
                }
                aria-invalid={passwordInvalid.current || undefined}
                className={inputClass}
              />
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className={`flex flex-col gap-1.5 ${labelClass}`}>
                {t("password.new")}
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwords.next}
                  onChange={(e) =>
                    setPasswords((p) => ({ ...p, next: e.target.value }))
                  }
                  aria-invalid={passwordInvalid.next || undefined}
                  className={inputClass}
                />
              </label>
              <label className={`flex flex-col gap-1.5 ${labelClass}`}>
                {t("password.confirm")}
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwords.confirm}
                  onChange={(e) =>
                    setPasswords((p) => ({ ...p, confirm: e.target.value }))
                  }
                  aria-invalid={passwordInvalid.confirm || undefined}
                  className={inputClass}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={passwordPending}
                onClick={closePasswordForm}
              >
                {t("password.cancel")}
              </Button>
              <Button type="submit" disabled={passwordPending}>
                {t("password.submit")}
              </Button>
            </div>
          </form>
        ) : (
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPasswordOpen(true)}
            >
              <KeyRound className="size-4" />
              {t("password.toggle")}
            </Button>
          </div>
        ))}
    </SettingsCard>
  );
}
