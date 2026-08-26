"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { signInUrl, signUpUrl } from "@/lib/urls";

const LINKS = [
  { href: "#how", key: "how" },
  // { href: "#pricing", key: "pricing" },
  { href: "#contact", key: "contact" },
] as const;

export function LandingNav() {
  const t = useTranslations("marketing.nav");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white/90 backdrop-blur-md backdrop-saturate-150">
      <nav
        aria-label={t("label")}
        className="mx-auto flex h-18 max-w-295 items-center justify-between gap-6 px-6"
      >
        <Link href="/" className="flex flex-none items-center gap-2.5">
          <Image
            src="/logo/logo-mark-light.png"
            alt="Electius"
            width={627}
            height={631}
            className="h-9.5 w-auto"
            priority
          />
          <span className="font-heading text-[1.3125rem] font-bold tracking-tight text-brand-900">
            Electius
          </span>
        </Link>

        <div className="hidden items-center gap-8.5 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.key}
              href={l.href}
              className="text-[0.9375rem] font-medium text-neutral-600 hover:text-brand-700"
            >
              {t(l.key)}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3.5 md:flex">
          <a
            href={signInUrl()}
            className="px-1.5 py-2.25 text-[0.9375rem] font-semibold text-brand-900 hover:text-brand-700"
          >
            {t("signIn")}
          </a>
          <a
            href={signUpUrl()}
            className="inline-flex h-10.5 items-center rounded-md bg-brand-700 px-5 text-[0.9375rem] font-semibold text-white shadow-xs hover:bg-brand-600"
          >
            {t("getStarted")}
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="landing-mobile-menu"
          aria-label={open ? t("closeMenu") : t("openMenu")}
          className="inline-flex size-11 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 md:hidden"
        >
          {open ? (
            <X className="size-6" aria-hidden="true" />
          ) : (
            <Menu className="size-6" aria-hidden="true" />
          )}
        </button>
      </nav>

        {open ? (
          <div
            id="landing-mobile-menu"
            className="relative border-t border-neutral-200 bg-white px-6 py-4 md:hidden"
          >
            <div className="flex flex-col gap-1">
              {LINKS.map((l) => (
                <a
                  key={l.key}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center text-base font-medium text-neutral-600"
                >
                  {t(l.key)}
                </a>
              ))}
              <a
                href={signInUrl()}
                className="flex min-h-11 items-center text-base font-semibold text-brand-900"
              >
                {t("signIn")}
              </a>
              <a
                href={signUpUrl()}
                className="mt-2 inline-flex h-12 items-center justify-center rounded-md bg-brand-700 px-5 text-base font-semibold text-white"
              >
                {t("getStarted")}
              </a>
            </div>
          </div>
        ) : null}
      </header>

      {/* Zastor stoji IZVAN <header>: backdrop-blur na zaglavlju čini ga containing
          blockom za position:fixed, pa bi se zastor rastegnuo samo preko zaglavlja
          (izmjereno 390×281 umjesto pune visine). z-40 → ispod trake, iznad sadržaja. */}
      {open ? (
        <div
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className="fixed inset-0 top-18 z-40 bg-black/40 md:hidden"
        />
      ) : null}
    </>
  );
}
