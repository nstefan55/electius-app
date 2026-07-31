"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import toast from "react-hot-toast";
import { useRouter } from "@/i18n/navigation";
import { updateOrganization } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/settings/settings-card";

// "Organization" card on /profile: logo DISPLAY only (upload is phase 2 — no
// affordance rendered), name + contact email. Language moved to its own card.
const inputClass =
  "h-11 w-full rounded-md border border-neutral-200 bg-neutral-100 px-3 text-base font-normal text-neutral-950 shadow-xs outline-none placeholder:text-neutral-400 focus:border-brand-700 focus:bg-white focus:shadow-focus aria-invalid:border-error-500";

const labelClass = "text-sm font-medium text-neutral-800";

type Field = "name" | "contactEmail";

export function OrganizationCard({
  initialName,
  initialContactEmail,
  logoUrl,
}: {
  initialName: string;
  initialContactEmail: string;
  logoUrl: string | null;
}) {
  const t = useTranslations("dashboard.profile.organization");
  const router = useRouter();

  const [saved, setSaved] = useState({
    name: initialName,
    contactEmail: initialContactEmail,
  });
  const [name, setName] = useState(initialName);
  const [contactEmail, setContactEmail] = useState(initialContactEmail);
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState<Partial<Record<Field, boolean>>>({});

  const dirty =
    name.trim() !== saved.name || contactEmail.trim() !== saved.contactEmail;

  const schema = z.object({
    name: z.string().trim().min(1, { error: t("errors.name") }),
    contactEmail: z.email({ error: t("errors.contactEmail") }),
  });

  async function save() {
    const parsed = schema.safeParse({
      name,
      contactEmail: contactEmail.trim(),
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
    const result = await updateOrganization(parsed.data);
    setPending(false);
    if (!result.success) {
      if (result.error === "emailTaken") setInvalid({ contactEmail: true });
      toast.error(
        result.error === "emailTaken"
          ? t("errors.emailTaken")
          : t("errors.generic"),
      );
      return;
    }
    setSaved(parsed.data);
    toast.success(t("success"));
    router.refresh(); // sidebar + topbar org name re-read the session
  }

  return (
    <SettingsCard
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <Button disabled={!dirty || pending} onClick={save}>
          {t("save")}
        </Button>
      }
    >
      {/* Logo — display only; upload lands in phase 2 */}
      <div className="flex items-center gap-4">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            className="size-18 shrink-0 rounded-lg border border-neutral-200 object-contain"
          />
        ) : (
          <span
            aria-hidden
            className="flex size-18 shrink-0 items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-neutral-50 text-xs font-medium text-neutral-400"
          >
            {t("logo.placeholder")}
          </span>
        )}
        <div className="min-w-0">
          <div className={labelClass}>{t("logo.label")}</div>
          <p className="mt-1 text-[13px] leading-normal text-neutral-600">
            {t("logo.helper")}{" "}
            <span className="inline-flex h-4.5 translate-y-0.5 items-center rounded-full bg-brand-100 px-1.75 text-[11px] font-semibold text-brand-700">
              {t("logo.pro")}
            </span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={`flex flex-col gap-1.5 ${labelClass}`}>
          {t("name")}
          <input
            type="text"
            autoComplete="organization"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={invalid.name || undefined}
            className={inputClass}
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="settings-contact-email" className={labelClass}>
            {t("contactEmail")}
          </label>
          <input
            id="settings-contact-email"
            type="email"
            autoComplete="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            aria-invalid={invalid.contactEmail || undefined}
            aria-describedby="settings-contact-email-helper"
            className={inputClass}
          />
          <span
            id="settings-contact-email-helper"
            className="text-xs text-neutral-600"
          >
            {t("contactHelper")}
          </span>
        </div>
      </div>
    </SettingsCard>
  );
}
