"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import toast from "react-hot-toast";
import { Calendar, Check, KeyRound, TriangleAlert } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/client";
import { updateProfile } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import {
  ImageUploadSlot,
  useImageUpload,
  type ImageUploadLabels,
} from "@/components/ui/image-upload";
import { SettingsCard } from "@/components/settings/settings-card";
import { OtpVerifyPanel } from "@/components/auth/otp-verify-panel";

// "Account information" card on /profile: identity row, unverified-email
// banner, name fields, read-only email + Verified badge, member-since, and the
// inline password sub-form (credential accounts only — Google-only users
// never see it).
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
  viaGoogle: boolean;
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
  viaGoogle,
  hasPassword,
  organizationName,
}: ProfileCardProps) {
  const t = useTranslations("dashboard.profile.account");
  const tOtp = useTranslations("auth.signup.form.otp");
  const locale = useLocale();
  const router = useRouter();

  // Avatar dijeli slot i mrežu s logotipom organizacije; razlikuju se samo
  // oblik, zamjena za prazno stanje i ruta.
  const avatarLabels: ImageUploadLabels = {
    upload: t("avatar.upload"),
    replace: t("avatar.replace"),
    remove: t("avatar.remove"),
    uploading: t("avatar.uploading"),
    uploaded: t("avatar.uploaded"),
    removed: t("avatar.removed"),
    errors: {
      tooLarge: t("avatar.errors.tooLarge"),
      badType: t("avatar.errors.badType"),
      generic: t("avatar.errors.generic"),
    },
  };
  const {
    pending: avatarPending,
    upload: uploadAvatar,
    remove: removeAvatar,
  } = useImageUpload("/api/profile/avatar", avatarLabels);

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

  // ── Unverified email: send a code, then expand the shared OTP panel ──
  const [otpOpen, setOtpOpen] = useState(false);
  const [sending, setSending] = useState(false);

  async function resendVerification() {
    setSending(true);
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "email-verification",
    });
    setSending(false);
    if (error) {
      toast.error(
        error.status === 429 ? tOtp("errors.rateLimited") : tOtp("errors.generic"),
      );
      return;
    }
    toast.success(tOtp("resent"));
    setOtpOpen(true);
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
      {/* Identity row — the avatar is the upload target (same slot the
          organization logo uses, round instead of square). */}
      <div className="flex items-center gap-4">
        <ImageUploadSlot
          imageUrl={image}
          pending={avatarPending}
          onFile={uploadAvatar}
          labels={avatarLabels}
          empty={
            <InitialsAvatar
              name={fullName}
              className="size-full bg-brand-100 text-2xl text-brand-700"
            />
          }
          className="size-16 rounded-full"
          imageClassName="object-cover"
        />
        <div className="min-w-0">
          <div className="truncate font-heading text-lg font-semibold text-neutral-800">
            {fullName}
          </div>
          <div className="mt-0.5 text-[0.8125rem] text-neutral-600">
            {t(viaGoogle ? "providerGoogle" : "providerEmail")}
          </div>
          {(image || avatarPending) && (
            <div className="mt-1.5">
              {avatarPending ? (
                <span className="text-[0.8125rem] text-neutral-600">
                  {avatarLabels.uploading}
                </span>
              ) : (
                <Button variant="ghost" size="sm" onClick={removeAvatar}>
                  {avatarLabels.remove}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Unverified email — the OTP panel expands underneath once a code is sent */}
      {!emailVerified && (
        <div className="flex flex-col gap-4 rounded-md border border-[#FDE68A] bg-warning-50 p-4">
          <div className="flex flex-wrap items-start gap-3">
            <TriangleAlert
              className="mt-0.5 size-4.5 shrink-0 text-warning-700"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-warning-700">
                {t("unverified.title")}
              </div>
              <p className="mt-0.5 text-[0.8125rem] text-warning-700">
                {t("unverified.body")}
              </p>
            </div>
            <button
              type="button"
              onClick={resendVerification}
              disabled={sending}
              className="h-8.5 shrink-0 rounded-md border border-[#FDE68A] px-3.5 text-[0.8125rem] font-semibold text-warning-700 transition-colors hover:bg-[#FEF3C7] disabled:opacity-60"
            >
              {t("unverified.resend")}
            </button>
          </div>
          {otpOpen && (
            <div className="rounded-md border border-neutral-200 bg-white p-6">
              {/* ponytail: the shared panel hard-navigates on success — reloading
                  /profile is the router.refresh() the spec asks for, and keeps
                  one code-entry UI. */}
              <OtpVerifyPanel
                email={email}
                redirectTo={`/${locale}/profile`}
              />
            </div>
          )}
        </div>
      )}

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
          <label htmlFor="profile-email" className={labelClass}>
            {t("form.email")}
          </label>
          {emailVerified && (
            <span className="inline-flex h-5 items-center gap-1 rounded-full bg-success-50 px-2 text-[0.6875rem] font-semibold text-success-700">
              <Check className="size-2.75" strokeWidth={3} />
              {t("form.verified")}
            </span>
          )}
        </div>
        <input
          id="profile-email"
          type="email"
          value={email}
          readOnly
          aria-describedby="profile-email-helper"
          className="h-11 w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 text-base text-neutral-600 outline-none"
        />
        <span id="profile-email-helper" className="text-xs text-neutral-600">
          {t("form.emailHelper")}
        </span>
      </div>

      {/* Member since */}
      <div className="flex items-center gap-2 text-[0.8125rem] text-neutral-600">
        <Calendar className="size-3.75 shrink-0" aria-hidden />
        {t.rich("memberSince", {
          date: memberSince,
          b: (chunks) => (
            <span className="font-semibold text-neutral-800">{chunks}</span>
          ),
        })}
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
