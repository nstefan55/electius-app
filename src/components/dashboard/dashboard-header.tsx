import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import Link from "next/link";

export function DashboardHeader({ organization }: { organization: string }) {
  const t = useTranslations("dashboard.page");

  return (
    <div className="flex flex-wrap items-start justify-between gap-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-neutral-800">
          {t("title")}
        </h1>
        <p className="mt-1.5 text-[0.9375rem] text-muted-foreground">
          {organization}
        </p>
      </div>

      <Link href="/elections/new" className="ml-auto">
        <button
          type="button"
          className="inline-flex h-12 items-center gap-2 rounded-md bg-primary px-5.5 text-base font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-brand-600 focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
        >
          <Plus className="size-5" />
          {t("newElection")}
        </button>
      </Link>
    </div>
  );
}
