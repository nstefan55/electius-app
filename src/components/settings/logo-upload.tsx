"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  ImageUploadSlot,
  useImageUpload,
  type ImageUploadLabels,
} from "@/components/ui/image-upload";

// Red s logotipom u kartici organizacije. Slot i mreža dolaze iz
// components/ui/image-upload (dijeli ih s avatarom računa); ovdje ostaje samo
// raspored: naslov s Pro oznakom, pomoćni tekst i Ukloni.
//
// Bez povlačenja i ispuštanja, iako file-image-spec §3 spominje dropzone:
// dizajn crta slot od 72 px, a na toj veličini je meta za ispuštanje lošija od
// klika. CSV dropzone iz dizajn-sustava §7.6 ovdje se ne koristi.

export function LogoUpload({ logoUrl }: { logoUrl: string | null }) {
  const t = useTranslations("dashboard.profile.organization.logo");

  const labels: ImageUploadLabels = {
    upload: t("upload"),
    replace: t("replace"),
    remove: t("remove"),
    uploading: t("uploading"),
    uploaded: t("uploaded"),
    removed: t("removed"),
    errors: {
      tooLarge: t("errors.tooLarge"),
      badType: t("errors.badType"),
      generic: t("errors.generic"),
    },
  };

  const { pending, upload, remove } = useImageUpload("/api/organization/logo", labels);

  return (
    <div className="flex items-center gap-4">
      <ImageUploadSlot
        imageUrl={logoUrl}
        pending={pending}
        onFile={upload}
        labels={labels}
        empty={
          <span className="text-xs font-medium text-neutral-400 group-hover:text-brand-700">
            {t("placeholder")}
          </span>
        }
        className={`size-18 rounded-lg ${logoUrl ? "" : "border-dashed"}`}
        imageClassName="object-contain"
      />

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-800">{t("label")}</span>
          <span className="inline-flex h-4.5 items-center rounded-full bg-brand-100 px-1.75 text-[0.6875rem] font-semibold text-brand-700">
            {t("pro")}
          </span>
        </div>
        <p className="mt-1 text-[0.8125rem] leading-normal text-neutral-600">{t("helper")}</p>
        {(logoUrl || pending) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {pending ? (
              <span className="text-[0.8125rem] text-neutral-600">{t("uploading")}</span>
            ) : (
              <Button variant="ghost" size="sm" onClick={remove}>
                {t("remove")}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
