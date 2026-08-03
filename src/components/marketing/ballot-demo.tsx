"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Lock, X } from "lucide-react";

export const BALLOT_DEMO_ID = "ballot-demo";

type Candidate = { name: string; platform: string };

// ponytail: nativni <dialog> + getElementById umjesto konteksta — tri okidača u tri
// odsjeka, jedan modal, bez dijeljenog React stanja. Fokus, Esc i backdrop dolaze
// od preglednika.
export function BallotDemo() {
  const t = useTranslations("marketing.demo");
  const ref = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [receipt, setReceipt] = useState("");
  const [copied, setCopied] = useState(false);

  const candidates = t.raw("candidates") as Candidate[];
  const submitted = receipt !== "";

  const reset = () => {
    setSelected(null);
    setReceipt("");
    setCopied(false);
  };

  const submit = () => {
    if (selected === null) return;
    // Prezentacijski niz, ne dokaz o glasu — demo ništa ne bilježi.
    const bytes = crypto.getRandomValues(new Uint8Array(28));
    setReceipt(
      "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""),
    );
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(receipt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard je uskraćen — gumb jednostavno ne javlja uspjeh.
    }
  };

  return (
    <dialog
      ref={ref}
      id={BALLOT_DEMO_ID}
      aria-labelledby="ballot-demo-title"
      onClose={reset}
      // Backdrop je dio samog <dialog>, pa klik izvan panela pogađa element.
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      // `m-auto` je ono što centrira: Tailwindov preflight postavlja `margin: 0`
      // na sve elemente i time gasi `margin: auto` iz UA stilova, pa se <dialog>
      // inače zalijepi u gornji lijevi kut. `max-h` + `overflow-y-auto` drže modal
      // unutar ekrana na niskim prozorima.
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-110 overflow-y-auto rounded-xl bg-white p-0 shadow-lg backdrop:bg-[rgba(10,15,25,0.55)] open:animate-[elModalIn_0.22s_ease] backdrop:open:animate-[elBackdropIn_0.2s_ease]"
    >
      <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4.5">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo/logo-mark-light.png"
            alt=""
            width={627}
            height={631}
            className="h-6.5 w-auto"
          />
          <span
            id="ballot-demo-title"
            className="font-heading text-[0.9375rem] font-semibold text-brand-900"
          >
            {t("titleTop")}
          </span>
        </div>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          aria-label={t("close")}
          className="inline-flex size-9 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      {submitted ? (
        <div className="px-6 pt-8 pb-7 text-center">
          <div className="mx-auto mb-4.5 flex size-16 items-center justify-center rounded-full bg-success-50">
            <Check className="size-8 text-success-700" aria-hidden="true" />
          </div>
          <h3 className="mb-2 font-heading text-2xl font-bold text-brand-900">
            {t("doneTitle")}
          </h3>
          <p className="mb-5.5 text-[0.9375rem] leading-relaxed text-neutral-600">
            {t("doneSub")}
          </p>
          <div className="rounded-md bg-neutral-100 px-4 py-3.5 text-left">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[0.6875rem] font-semibold tracking-[0.04em] text-neutral-600 uppercase">
                {t("receiptLabel")}
              </span>
              <button
                type="button"
                onClick={copy}
                className="text-xs font-semibold text-brand-700 hover:text-brand-600"
              >
                {copied ? t("copied") : t("copy")}
              </button>
            </div>
            <div className="font-mono text-[0.78125rem] leading-relaxed break-all text-neutral-800">
              {receipt}
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-neutral-600">
            {t("demoNote")}
          </p>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="mt-5 h-12 w-full rounded-md border-[1.5px] border-brand-700 bg-white font-heading text-base font-semibold text-brand-700 hover:bg-brand-50"
          >
            {t("doneBtn")}
          </button>
        </div>
      ) : (
        <div className="p-6">
          <div className="mb-5 flex justify-center gap-2" aria-hidden="true">
            <span className="h-2 w-3 rounded-full bg-brand-500" />
            <span className="size-2 rounded-full bg-neutral-200" />
          </div>
          <h3 className="mb-1 text-center font-heading text-[1.375rem] font-bold text-brand-900">
            {t("cast")}
          </h3>
          <p className="mb-5.5 text-center text-sm text-neutral-600">
            {t("sub")}
          </p>

          {/* Nativni radio gumbi: uloga, aria-checked i kretanje strelicama dolaze
              od preglednika, a ne iz našeg koda (design-system §10). */}
          <fieldset className="flex flex-col gap-3">
            <legend className="sr-only">{t("cast")}</legend>
            {candidates.map((c, i) => {
              const on = selected === i;
              return (
                <label
                  key={c.name}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-4.5 py-4 transition-colors has-[:focus-visible]:shadow-focus ${
                    on
                      ? "border-2 border-brand-700 bg-brand-50 shadow-md"
                      : "border-[1.5px] border-neutral-200 bg-white shadow-sm"
                  }`}
                >
                  <input
                    type="radio"
                    name="ballot-demo-choice"
                    className="sr-only"
                    checked={on}
                    onChange={() => setSelected(i)}
                  />
                  <span className="text-left">
                    <span className="block font-heading text-base font-semibold text-neutral-800">
                      {c.name}
                    </span>
                    <span className="mt-0.5 block text-[0.8125rem] text-neutral-600">
                      {c.platform}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`inline-flex size-6 flex-none items-center justify-center rounded-full transition-opacity ${
                      on ? "bg-brand-700 opacity-100" : "bg-neutral-200 opacity-0"
                    }`}
                  >
                    <Check className="size-3.5 text-white" strokeWidth={3} />
                  </span>
                </label>
              );
            })}
          </fieldset>

          <button
            type="button"
            onClick={submit}
            disabled={selected === null}
            className="mt-5 h-14 w-full rounded-md font-heading text-[1.0625rem] font-semibold transition-colors enabled:bg-brand-700 enabled:text-white enabled:shadow-md enabled:hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-600"
          >
            {selected === null ? t("selectFirst") : t("submit")}
          </button>
          <p className="mt-3.5 flex items-center justify-center gap-1.5 text-center text-xs text-neutral-600">
            <Lock className="size-3.5 flex-none" aria-hidden="true" />
            {t("privacy")}
          </p>
        </div>
      )}
    </dialog>
  );
}
