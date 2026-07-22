"use client";

import { Info } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

// 404 main-content card (404-page-redesign-spec) — reused by the (app) and
// (voter) group-level not-found.tsx (chrome preserved by their layout) and
// the true-root global-not-found.tsx (no chrome, no [locale] context at all
// — see next.config.ts). Client Component because "Go back" needs
// window.history.back(); props are fully-resolved strings, not a `reason`
// enum, so this stays a dumb presentational piece with no next-intl
// dependency (global-not-found.tsx has no NextIntlClientProvider to read from).
export function NotFoundCard({
  badge,
  title,
  description,
  homeLabel,
  homeHref,
  backLabel,
  voterNote,
}: {
  badge: string;
  title: string;
  description: string;
  homeLabel: string;
  homeHref: string;
  backLabel: string;
  voterNote?: { title: string; description: string };
}) {
  return (
    <div className="mx-auto flex max-w-140 flex-col items-center gap-0 text-center">
      <span className="rounded-sm border border-brand-100 bg-brand-50 px-2.5 py-1.5 font-mono text-sm tracking-wide text-brand-700">
        {badge}
      </span>
      <div
        aria-hidden="true"
        className="mt-5 font-heading text-7xl font-bold tracking-tight text-brand-900 sm:text-8xl lg:text-9xl"
      >
        404
      </div>
      <h1 className="mt-2 text-[1.875rem] leading-[1.25] font-heading font-semibold text-neutral-800">
        {title}
      </h1>
      <p className="mt-3 text-lg leading-relaxed text-neutral-600">
        {description}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {/* Plain <a>, not next-intl's Link: global-not-found.tsx renders
            outside NextIntlClientProvider, where Link's useLocale() throws. */}
        <a href={homeHref} className={buttonVariants({ size: "lg" })}>
          {homeLabel}
        </a>
        {/* Real Base UI Button: a real <button>, so no nativeButton warning. */}
        <Button
          variant="secondary"
          size="lg"
          onClick={() => window.history.back()}
        >
          {backLabel}
        </Button>
      </div>
      {voterNote && (
        <div className="mt-12 flex w-full items-start gap-3.5 rounded-lg border border-border bg-card p-5 text-left shadow-xs">
          <Info className="mt-0.5 size-5 shrink-0 text-brand-700" />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-neutral-800">
              {voterNote.title}
            </span>
            <span className="text-sm leading-normal text-neutral-600">
              {voterNote.description}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
