"use client";

import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { pageWindow } from "@/lib/pagination";
import { cn } from "@/lib/utils";

// Zajednička kontrola stranicanja — čisto prikazna. Ne zna odakle brojevi
// dolaze: poslužiteljski upit vraća `pageCount`, klijentska lista ga računa iz
// filtriranog niza. Zato podjela poslužitelj/klijent nikad ne procuri u UI.

const CELL =
  "inline-flex h-10 min-w-10 items-center justify-center rounded-md border border-border bg-white px-3 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-100 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white";

export function Pagination({
  page,
  pageCount,
  onPageChange,
  className,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const t = useTranslations("common.pagination");

  // Jedna stranica nije izbor — kontrola se ne prikazuje.
  if (pageCount <= 1) return null;

  return (
    <nav
      aria-label={t("label")}
      className={cn(
        "flex flex-wrap items-center justify-between gap-3",
        className,
      )}
    >
      <span className="text-[0.8125rem] text-muted-foreground">
        {t("page", { page, pages: pageCount })}
      </span>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className={cn(CELL, "gap-1.5")}
        >
          <ChevronLeft className="size-4" />
          <span className="max-sm:sr-only">{t("prev")}</span>
        </button>

        {pageWindow(page, pageCount).map((slot, i) =>
          slot === "gap" ? (
            <span
              key={`gap-${i}`}
              aria-hidden
              className="inline-flex h-10 w-6 items-center justify-center text-sm text-neutral-400"
            >
              …
            </span>
          ) : (
            <button
              key={slot}
              type="button"
              aria-label={t("goToPage", { page: slot })}
              aria-current={slot === page ? "page" : undefined}
              onClick={() => onPageChange(slot)}
              className={cn(
                CELL,
                slot === page &&
                  "border-brand-700 bg-brand-700 text-white hover:bg-brand-600",
              )}
            >
              {slot}
            </button>
          ),
        )}

        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          className={cn(CELL, "gap-1.5")}
        >
          <span className="max-sm:sr-only">{t("next")}</span>
          <ChevronRight className="size-4" />
        </button>
      </div>
    </nav>
  );
}

// Adapter za poslužiteljski renderirane liste: one ne mogu proslijediti
// funkciju preko granice, pa stanje stranice drži URL. Gornja komponenta ostaje
// s jednim ugovorom umjesto da dobije drugi način rada.
export function UrlPagination({
  page,
  pageCount,
  basePath,
  className,
}: {
  page: number;
  pageCount: number;
  basePath: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <Pagination
      page={page}
      pageCount={pageCount}
      className={className}
      onPageChange={(next) =>
        router.push(next > 1 ? `${basePath}?page=${next}` : basePath)
      }
    />
  );
}
