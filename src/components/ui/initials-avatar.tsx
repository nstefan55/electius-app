import { cn } from "@/lib/utils";

// "Nikola Štefančić" → "NŠ" (first letter of the first two words).
const toInitials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

// Reusable initials avatar (auth-phase-4). Google `image` support is a
// deliberately deferred decision — the (app) shell only receives
// { name, organization } (PII-guard projection, 2026-07-11 audit).
export function InitialsAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9.5 shrink-0 items-center justify-center rounded-full bg-brand-500 font-heading text-[15px] font-semibold text-white",
        className,
      )}
    >
      {toInitials(name)}
    </span>
  );
}
