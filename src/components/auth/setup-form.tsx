"use client";

import { useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { authClient } from "@/lib/auth/client";
import { completeSetup } from "@/actions/setup";
import { Button } from "@/components/ui/button";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { cn } from "@/lib/utils";
import { privacyUrl, termsUrl } from "@/lib/urls";
import type { OrganizationType } from "@/generated/prisma/client";

// Account-setup screen (setup-page-spec), ported from the design prototype
// (context/design/electius-setup-page-design). Continue and Skip BOTH save —
// the design gates both on the same completeness check; Skip only bypasses the
// /onboarding hop. A skip that saved nothing would loop: requireSession()
// bounces org-less users straight back to /setup.
const ORG_TYPES = [
  "UNIVERSITY",
  "COMPANY",
  "UNION",
  "ASSOCIATION",
  "OTHER",
] as const satisfies readonly OrganizationType[];

const inputClass =
  "h-12 w-full rounded-md border border-neutral-200 bg-neutral-100 px-3 text-base font-normal text-neutral-950 shadow-xs outline-none placeholder:text-neutral-400 focus:border-brand-700 focus:bg-white focus:shadow-focus";

const labelClass = "flex flex-col gap-1.5 text-sm font-medium text-neutral-800";

interface SetupFormProps {
  email: string;
  image: string | null;
  initialFirstName: string;
  initialLastName: string;
  initialOrganizationName: string;
  initialOrganizationType: OrganizationType | "";
  termsAccepted: boolean;
}

export function SetupForm({
  email,
  image,
  initialFirstName,
  initialLastName,
  initialOrganizationName,
  initialOrganizationType,
  termsAccepted,
}: SetupFormProps) {
  const t = useTranslations("auth.setup");
  const tFooter = useTranslations("auth.footer");
  const locale = useLocale();
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [organizationName, setOrganizationName] = useState(
    initialOrganizationName,
  );
  const [organizationType, setOrganizationType] = useState<
    OrganizationType | ""
  >(initialOrganizationType);
  const [pending, setPending] = useState(false);
  // Pristanak na uvjete (terms-of-service-spec D2). Traži se samo kad ga još
  // nema: povratak na /setup je uređivanje profila, a ne novi ugovor.
  const [terms, setTerms] = useState(false);

  const complete =
    firstName.trim() !== "" &&
    lastName.trim() !== "" &&
    organizationName.trim() !== "" &&
    organizationType !== "" &&
    (termsAccepted || terms);

  async function save(target: "onboarding" | "home") {
    // `complete` narrows organizationType to OrganizationType past this guard.
    if (!complete || pending) return;
    setPending(true);
    const result = await completeSetup({
      firstName,
      lastName,
      organizationName,
      organizationType,
      terms: termsAccepted || terms,
    });
    if (!result.success) {
      toast.error(t("form.errors.generic"));
      setPending(false);
      return;
    }
    toast.success(t("form.success"));
    // Hard navigation so the proxy + requireSession() re-run with the new org.
    window.location.assign(`/${locale}/${target}`);
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <header className="flex h-20 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-6 sm:px-8">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo/logo-mark-light.png"
            alt="Electius"
            width={40}
            height={40}
            className="object-contain"
            priority
          />
          <span className="font-heading text-[1.1875rem] font-bold tracking-tight text-brand-900">
            Electius
          </span>
        </div>
        <div className="flex items-center gap-4 text-[0.8125rem]">
          <span className="hidden text-neutral-600 sm:inline">{email}</span>
          <button
            type="button"
            onClick={async () => {
              await authClient.signOut();
              window.location.assign(`/${locale}/login`);
            }}
            className="font-medium text-neutral-600 hover:text-brand-700 hover:underline"
          >
            {t("signOut")}
          </button>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-110 flex-col gap-6 rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-2xl font-semibold text-neutral-800">
              {t("title")}
            </h1>
            <p className="text-[0.90625rem] leading-normal text-neutral-600">
              {t("subtitle")}
            </p>
          </div>

          <div className="flex items-center gap-4">
            {image ? (
              // Plain <img> — Google avatar hosts aren't in next/image remotePatterns.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt=""
                className="size-18 shrink-0 rounded-full border border-neutral-200 object-cover"
              />
            ) : (
              <InitialsAvatar
                name={`${firstName} ${lastName}`.trim() || "E"}
                className="size-18 bg-brand-100 text-2xl text-brand-700"
              />
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-semibold text-neutral-800">
                {image ? t("photo.googleTitle") : t("photo.initialsTitle")}
              </span>
              <span className="text-[0.8125rem] leading-normal text-neutral-600">
                {image ? t("photo.googleNote") : t("photo.initialsNote")}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                {t("form.firstName")}
                <input
                  type="text"
                  autoComplete="given-name"
                  placeholder={t("form.firstNamePlaceholder")}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                {t("form.lastName")}
                <input
                  type="text"
                  autoComplete="family-name"
                  placeholder={t("form.lastNamePlaceholder")}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>

            {/* Helper lives OUTSIDE the label (aria-describedby) so it doesn't
                pollute the field's accessible name — same fix as the signup form. */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="setup-organization"
                className="text-sm font-medium text-neutral-800"
              >
                {t("form.organizationName")}
              </label>
              <input
                id="setup-organization"
                type="text"
                autoComplete="organization"
                placeholder={t("form.organizationNamePlaceholder")}
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                aria-describedby="setup-organization-helper"
                className={inputClass}
              />
              <span
                id="setup-organization-helper"
                className="text-xs font-normal text-neutral-600"
              >
                {t("form.organizationHelper")}
              </span>
            </div>

            <label className={labelClass}>
              {t("form.organizationType")}
              {/* ponytail: native <select> styled like the inputs — no dropdown lib. */}
              <select
                value={organizationType}
                onChange={(e) =>
                  setOrganizationType(e.target.value as OrganizationType | "")
                }
                className={cn(inputClass, !organizationType && "text-neutral-400")}
              >
                <option value="" disabled>
                  {t("form.organizationTypePlaceholder")}
                </option>
                {ORG_TYPES.map((type) => (
                  <option key={type} value={type} className="text-neutral-950">
                    {t(`form.types.${type}`)}
                  </option>
                ))}
              </select>
            </label>

            {/* Ovdje se sklapa ugovor, a ne na registraciji. Ovuda prolaze OBA
                puta prijave — Googleov callback slijeće ovamo, e-mail put dolazi
                nakon OTP-a, a requireSession() ovamo vraća svaki račun bez
                organizacije — i ovdje organizacija, dakle druga strana ugovora,
                tek nastaje. Kvačica na registraciji nije ostavljala trag i Google
                gumb ju je zaobilazio; oboje pada s ovom jednom promjenom.

                Pravila privatnosti stoje ISPOD kvačice, izvan vrata: obavijest
                iz čl. 13. GDPR-a ispunjava se time što je dostupna, a spajanje
                s ugovorom u jednu obveznu kvačicu Smjernice EDPB-a 05/2020
                smatraju nevaljanom privolom. */}
            {!termsAccepted && (
              <>
                <label className="flex items-start gap-2 text-sm leading-normal text-neutral-950">
                  <input
                    type="checkbox"
                    checked={terms}
                    onChange={(e) => setTerms(e.target.checked)}
                    className="mt-0.75 size-4 shrink-0 accent-brand-700"
                  />
                  <span>
                    {t.rich("form.terms", {
                      terms: (chunks) => (
                        <a
                          href={termsUrl()}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {chunks}
                        </a>
                      ),
                    })}
                  </span>
                </label>

                <p className="-mt-3 pl-6 text-[0.8125rem] leading-normal text-neutral-600">
                  {t.rich("form.privacyNote", {
                    privacy: (chunks) => (
                      <a
                        href={privacyUrl()}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-700 hover:underline"
                      >
                        {chunks}
                      </a>
                    ),
                  })}
                </p>
              </>
            )}

            <Button
              type="button"
              size="lg"
              className="h-12 w-full text-base"
              disabled={!complete || pending}
              onClick={() => save("onboarding")}
            >
              {t("form.submit")}
            </Button>

            <p className="text-center text-sm">
              <button
                type="button"
                disabled={!complete || pending}
                onClick={() => save("home")}
                className={cn(
                  "font-medium",
                  complete && !pending
                    ? "text-neutral-600 hover:text-brand-700 hover:underline"
                    : "cursor-not-allowed text-neutral-400",
                )}
              >
                {t("form.skip")}
              </button>
            </p>

            <p className="text-center text-[0.8125rem] text-neutral-600">
              {t("form.changeLater")}
            </p>
          </div>
        </div>
      </main>

      <footer className="flex shrink-0 flex-wrap justify-center gap-x-5 gap-y-2 px-6 pt-4 pb-6 text-[0.8125rem]">
        <a href={privacyUrl()} className="text-neutral-600 hover:underline">
          {tFooter("privacy")}
        </a>
        <a href={termsUrl()} className="text-neutral-600 hover:underline">
          {tFooter("terms")}
        </a>
        <a
          href="mailto:contact@electius.com"
          className="text-neutral-600 hover:underline"
        >
          contact@electius.com
        </a>
      </footer>
    </div>
  );
}
