import { cn } from "@/lib/utils";

// Shared Suspense-fallback spinner (loading-and-404-page-spec §1) — one visual
// treatment reused by every route group's loading.tsx.
export function Spinner({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn(
        "size-15 animate-spin rounded-full border-[3px] border-neutral-200 border-t-brand-700",
        className,
      )}
    />
  );
}
