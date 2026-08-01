"use client";

import { useRef, useState, type ReactNode } from "react";
import { ImageUp } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { IMAGE_ACCEPT, MAX_IMAGE_BYTES } from "@/lib/upload-validation";

// Dijeljeno učitavanje slike: logotip organizacije i avatar računa.
//
// Namjerno dva izvoza, ne jedna komponenta: slot i mreža jesu zajednički, ali
// raspored oko njih nije (logotip ima pomoćni tekst i Ukloni ispod, avatar ima
// ime i način prijave pored). Komponenta koja bi pokrila oba završila bi kao
// niz zastavica za raspored.
//
// Provjere na klijentu su samo UX. Odluku donosi poslužitelj na magičnim
// bajtovima — ovdje se hvata samo ono što korisniku štedi krug do poslužitelja.

export interface ImageUploadLabels {
  upload: string;
  replace: string;
  remove: string;
  uploading: string;
  uploaded: string;
  removed: string;
  errors: { tooLarge: string; badType: string; generic: string };
}

/** Mreža + obavijesti + osvježavanje. Endpoint prima POST (multipart) i DELETE. */
export function useImageUpload(endpoint: string, labels: ImageUploadLabels) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  // Samo dva razloga imaju vlastitu poruku; sve ostalo je "pokušajte ponovno".
  function fail(reason?: string) {
    toast.error(
      reason === "tooLarge" || reason === "badType"
        ? labels.errors[reason]
        : labels.errors.generic,
    );
  }

  async function upload(file: File) {
    if (file.size > MAX_IMAGE_BYTES) return fail("tooLarge");

    setPending(true);
    const body = new FormData();
    body.append("file", file);
    try {
      const response = await fetch(endpoint, { method: "POST", body });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        return fail(data?.error ?? "generic");
      }
      toast.success(labels.uploaded);
      router.refresh();
    } catch {
      fail("generic");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setPending(true);
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      if (!response.ok) return fail("generic");
      toast.success(labels.removed);
      router.refresh();
    } catch {
      fail("generic");
    } finally {
      setPending(false);
    }
  }

  return { pending, upload, remove };
}

/** Sam slot je gumb — nema zasebnog gumba za učitavanje pored njega. */
export function ImageUploadSlot({
  imageUrl,
  pending,
  onFile,
  labels,
  empty,
  className,
  imageClassName,
}: {
  imageUrl: string | null;
  pending: boolean;
  onFile: (file: File) => void;
  labels: Pick<ImageUploadLabels, "upload" | "replace">;
  /** Što ispunjava slot dok slike nema (natpis, inicijali…). */
  empty: ReactNode;
  className?: string;
  imageClassName?: string;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        // hidden, ne sr-only: sr-only ostavlja drugi, neimenovani "Choose File"
        // u stablu pristupačnosti. Skriveni input i dalje otvara birač na
        // .click().
        hidden
        // Isti izbor datoteke dvaput zaredom inače ne okine change.
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => input.current?.click()}
        aria-label={imageUrl ? labels.replace : labels.upload}
        className={cn(
          "group relative shrink-0 cursor-pointer overflow-hidden border border-neutral-200 bg-neutral-50 outline-none hover:border-brand-500 hover:bg-brand-50 focus-visible:border-brand-700 focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        {imageUrl ? (
          <>
            {/* Obični <img>: i R2 domena i Googleov host dolaze izvana, pa bi
                next/image tražio remotePatterns za hostove koji se mijenjaju. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" className={cn("size-full", imageClassName)} />
            {/* Preko slike se sam okvir jedva vidi, pa se na prijelaz mišem i na
                fokus tipkovnicom pokaže da se klikom mijenja. */}
            <span className="absolute inset-0 flex items-center justify-center bg-neutral-950/55 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <ImageUp className="size-5 text-white" />
            </span>
          </>
        ) : (
          <span className="flex size-full items-center justify-center group-hover:text-brand-700">
            {pending ? "…" : empty}
          </span>
        )}
      </button>
    </>
  );
}
