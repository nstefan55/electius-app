"use client";

import { TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

// Error-boundary main-content card (production-readiness D9). Reused by the
// group-level error.tsx boundaries ((app), (voter)) and [locale]/error.tsx
// (auth + marketing), whose layout chrome stays rendered around it. Mirrors
// NotFoundCard: a dumb presentational Client Component taking fully-resolved
// strings, so it carries no next-intl dependency of its own — the boundary
// resolves copy via useTranslations and passes it in. "Try again" calls the
// boundary's reset(); the home link is a plain <a>, same reasoning as
// NotFoundCard (a boundary may render before the intl Link's context is safe).
export function ErrorCard({
  badge,
  title,
  description,
  retryLabel,
  onRetry,
  homeLabel,
  homeHref,
}: {
  badge: string;
  title: string;
  description: string;
  retryLabel: string;
  onRetry: () => void;
  homeLabel: string;
  homeHref: string;
}) {
  return (
    <div className="mx-auto flex max-w-140 flex-col items-center gap-0 text-center">
      <span className="inline-flex items-center gap-1.5 rounded-sm border border-warning-500/30 bg-warning-50 px-2.5 py-1.5 font-mono text-sm tracking-wide text-warning-700">
        <TriangleAlert aria-hidden="true" className="size-4" />
        {badge}
      </span>
      <h1 className="mt-5 text-[1.875rem] leading-[1.25] font-heading font-semibold text-neutral-800">
        {title}
      </h1>
      <p className="mt-3 text-lg leading-relaxed text-neutral-600">
        {description}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button size="lg" onClick={onRetry}>
          {retryLabel}
        </Button>
        <a href={homeHref} className={buttonVariants({ variant: "secondary", size: "lg" })}>
          {homeLabel}
        </a>
      </div>
    </div>
  );
}
