import type { ComponentType, ReactNode } from "react";

// Shared voter-surface building blocks (voter-flow spec, design: Voter
// Flow.dc.html). No hooks — usable from both server state screens and the
// client flow. Styling follows design-system §7.15–7.17 + the prototype.

// "pet, 12. lipnja · 18:00" / "Fri, June 12 · 06:00 PM" — UTC like the admin
// start card, so server and browser render identical strings (no hydration
// mismatch, deterministic across timezones). UTC sam po sebi nije dovoljan:
// sat mora biti 2-digit jer kod numeric za hr-HR preglednik dopunjava nulom
// (`09:41`), a Node ne (`9:41`) — hidracijska greška ispod 10 sati UTC.
const DATE_LOCALE: Record<string, string> = { hr: "hr-HR", en: "en-US" };

export function formatVoterDateTime(iso: string | Date, locale: string): string {
  const d = new Date(iso);
  const l = DATE_LOCALE[locale] ?? locale;
  const date = new Intl.DateTimeFormat(l, {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(d);
  const time = new Intl.DateTimeFormat(l, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(d);
  return `${date} · ${time}`;
}

// §7.16 vote progress dots — completed 8px brand-700, active 12px brand-500,
// upcoming 8px neutral-200.
export function VoteProgressDots({
  current,
  label,
}: {
  current: number;
  label: string;
}) {
  return (
    <div
      className="flex items-center justify-center gap-2 pt-3.5"
      role="img"
      aria-label={label}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`rounded-full transition-all duration-150 ${
            n === current
              ? "size-3 bg-brand-500"
              : n < current
                ? "size-2 bg-brand-700"
                : "size-2 bg-neutral-200"
          }`}
        />
      ))}
    </div>
  );
}

// Centered icon-circle hero used by every state screen and flow screens 1 + 5.
export function StateHero({
  icon: Icon,
  tone,
  title,
  sub,
  topPad = true,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tone: "brand" | "success" | "error" | "warning" | "neutral";
  title: string;
  sub: string;
  topPad?: boolean;
}) {
  const circle = {
    brand: "bg-brand-50 text-brand-700",
    success: "bg-success-50 text-success-700",
    error: "bg-error-50 text-error-500",
    warning: "bg-warning-50 text-warning-700",
    neutral: "bg-neutral-100 text-neutral-600",
  }[tone];
  return (
    <div className={`text-center ${topPad ? "pt-9" : ""}`}>
      <div
        className={`mx-auto mb-4 flex size-16 items-center justify-center rounded-full ${circle}`}
      >
        <Icon className="size-7.5" aria-hidden />
      </div>
      <h1 className="font-heading text-2xl font-bold text-neutral-800">
        {title}
      </h1>
      <p className="mt-2 text-base leading-relaxed text-neutral-600">{sub}</p>
    </div>
  );
}

// §7.10 alert — success/warning variants used by used/closed/qr screens.
export function VoterAlert({
  variant,
  icon: Icon,
  title,
  children,
}: {
  variant: "success" | "warning";
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  children?: ReactNode;
}) {
  const styles =
    variant === "success"
      ? "bg-success-50 border-success-500 text-success-700"
      : "bg-warning-50 border-warning-500 text-warning-700";
  return (
    <div className={`rounded-md border-l-3 p-4 ${styles}`}>
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          {children ? <p className="mt-1 text-sm">{children}</p> : null}
        </div>
      </div>
    </div>
  );
}

// Flat "think this is a mistake?" card (invalid / expired / race screens).
export function HelpCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="text-sm font-semibold text-neutral-950">{title}</p>
      <p className="mt-1 text-sm leading-normal text-neutral-600">{body}</p>
    </div>
  );
}

// Button class recipes (design-system §7.1) — plain constants, no component.
export const BTN_PRIMARY_XL =
  "inline-flex h-14 w-full cursor-pointer items-center justify-center rounded-md bg-brand-700 px-8 text-lg font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40";
export const BTN_SECONDARY_LG =
  "inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-md border-[1.5px] border-brand-700 bg-white px-6 font-semibold text-brand-700 transition-colors hover:bg-brand-50";
export const BTN_GHOST_MD =
  "inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-md px-4 text-neutral-600 transition-colors hover:bg-neutral-100";
