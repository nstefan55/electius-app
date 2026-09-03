"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Archive } from "lucide-react";

// Potvrda pečaćenja — jedna za sva četiri mjesta (/home, /elections, /results,
// traka izbora), pa tekst ne može pobjeći. Brand ton, ne crveni: pečat ništa
// ne briše, ali se ne može poništiti — zato pita.
export function ArchiveConfirmDialog({
  target,
  pending,
  onOpenChange,
  onConfirm,
}: {
  target: { id: string; name: string } | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (id: string) => void;
}) {
  const t = useTranslations("dashboard.page.actions");
  // Zadnji naziv ostaje dok se modal zatvara, da tekst ne bljesne u prazno.
  const [last, setLast] = useState("");
  if (target && target.name !== last) setLast(target.name);

  return (
    <AlertDialog.Root open={target !== null} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-105 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-white p-7 text-center shadow-lg outline-none">
          <div className="mx-auto mb-4 flex size-15 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <Archive className="size-7" aria-hidden />
          </div>
          <AlertDialog.Title className="font-heading text-xl font-bold text-neutral-800">
            {t("archiveTitle")}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2.5 text-sm leading-relaxed text-neutral-600">
            {t("archiveBody", { name: last })}
          </AlertDialog.Description>
          <div className="mt-6 flex gap-3">
            <AlertDialog.Close className="inline-flex h-11.5 flex-1 cursor-pointer items-center justify-center rounded-md border border-border bg-white text-[0.90625rem] font-semibold text-neutral-800 transition-colors hover:bg-neutral-100">
              {t("cancel")}
            </AlertDialog.Close>
            <button
              type="button"
              onClick={() => target && onConfirm(target.id)}
              disabled={pending}
              className="inline-flex h-11.5 flex-1 cursor-pointer items-center justify-center rounded-md bg-brand-700 text-[0.90625rem] font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("confirmArchive")}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
