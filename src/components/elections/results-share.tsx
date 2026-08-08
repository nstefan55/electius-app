"use client";

import { QRCodeSVG } from "qrcode.react";
import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { publicResultsUrl } from "@/lib/urls";

// Dijeljenje javne stranice rezultata (public-results-page-spec, QR odluka
// 2026-08-08). Klijentska komponenta jer i QR i međuspremnik trebaju preglednik.
//
// Poziva se SAMO kad je stranica doista upaljena — uvjet je isti izraz koji
// javna ruta koristi za prikaz zbroja (resultsVisible && pristup === "closed").
// Bez toga bi QR vodio na zaslon "Rezultati nisu objavljeni", a to je točno ona
// vrsta obećanja koje se prekrši u trenutku skeniranja.
//
// URL ide kroz publicResultsUrl — apeks se nikad ne piše rukom.
export function ResultsShare({ electionId }: { electionId: string }) {
  const t = useTranslations("dashboard.election.results.share");
  const url = publicResultsUrl(electionId);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="font-heading text-base font-semibold text-neutral-800">
        {t("title")}
      </h2>
      <p className="mt-1.5 text-[0.84375rem] leading-relaxed text-neutral-600">
        {t("body")}
      </p>

      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="shrink-0 rounded-2xl border border-border bg-white p-3.5 shadow-xs">
          <QRCodeSVG value={url} level="M" className="size-36" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 rounded-md border border-border bg-neutral-50 px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-left font-mono text-[0.78125rem] text-neutral-600">
              {url}
            </span>
            <button
              type="button"
              onClick={copy}
              className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-white px-3 text-[0.8125rem] font-semibold text-brand-700 transition-colors hover:bg-brand-50"
            >
              <Copy className="size-3.5" aria-hidden />
              {t("copy")}
            </button>
          </div>
          <p className="mt-2.5 text-[0.78125rem] leading-relaxed text-neutral-600">
            {t("note")}
          </p>
        </div>
      </div>
    </section>
  );
}
