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

// Reusable initials avatar (auth-phase-4) — the fallback wherever User.image is
// null. The shell projection now passes `image` through by name alongside
// { name, organization } (PII guard, 2026-07-11 audit), so the sidebar and the
// profile card render the picture when there is one and these initials when
// there is not.
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
        "flex size-9.5 shrink-0 items-center justify-center rounded-full bg-brand-500 font-heading text-[0.9375rem] font-semibold text-white",
        className,
      )}
    >
      {toInitials(name)}
    </span>
  );
}
