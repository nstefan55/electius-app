"use client";

import { useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { TriangleAlert, X } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { PRO_PLAN_NAME } from "@/lib/billing";
import { BillingToggle, PlanCards } from "@/components/marketing/plan-cards";
import { SettingsCard } from "@/components/settings/settings-card";
import { Spinner } from "@/components/ui/spinner";
// Besplatno stanje živi izdvojeno jer ga dijeli /upgrade. Odavde stižu i PRICE i
// fail — smjer uvoza je jednosmjeran (kartica → ponuda), pa nema ciklusa.
import { PRICE, ProUpsell } from "@/components/billing/pro-upsell";
import { fail } from "@/components/billing/use-upgrade-checkout";

// "Plan i naplata" na /settings (profile-settings-phase-7-spec).
//
// Sučelje je iz faze 7 i ne mijenja se; stripe-integration-phase-2 §5 popunjava
// samo četiri tijela funkcija. Klijent šalje ime plana i boolean, NIKAD cijenu —
// price id se razrješava na poslužitelju iz proPlan(), pa krivotvoreni zahtjev
// ne može izmisliti pretplatu od 0 €. isPro ne mijenja nijedan od ovih poziva:
// pravo piše isključivo provjereni webhook.

const NS = "dashboard.settings.billing";

type Cycle = "monthly" | "yearly";

export type BillingState =
  // Prije pokretanja: nema pravnog subjekta, svi su Pro. Jedino stanje koje se
  // stvarno prikazuje u produkciji (pre-incorporation-billing-spec).
  | { kind: "prelaunch" }
  | { kind: "free" }
  | {
      kind: "pro";
      // null dok faza 2 ne doda subscriptions.retrieve. Namjerno nullable, a ne
      // izmišljeni datum: lažni datum obnove Pro korisniku je upravo ona vrsta
      // neistine koju ovaj proizvod dvaput nije htio isporučiti.
      subscription: {
        status: "active" | "trialing" | "canceling";
        renewsAt: Date;
        cycle: Cycle;
        // Stripe id (sub_…), ne id našeg retka — plugin traži pretplatu upravo
        // po toj koloni. Obavezan pri prelasku na godišnje: bez njega Checkout
        // otvara DRUGU pretplatu i naplaćuje dvaput.
        stripeSubscriptionId: string | null;
      } | null;
    };

// Kamo se Stripe vraća. Traka "obrada u tijeku" iz faze 7 visi o ?checkout=success,
// pa uspjeh mora nositi taj parametar; sam povratak ne mijenja nikakvo pravo.
function useReturnUrls() {
  const locale = useLocale();
  const base = `/${locale}/settings`;
  return { locale, base, success: `${base}?checkout=success` };
}

export function BillingCard({
  state,
  organizationId,
}: {
  state: BillingState;
  organizationId: string;
}) {
  const t = useTranslations(NS);
  // Povratak s Checkouta. Uspjeh NIKAD ne mijenja pravo — isPro piše samo
  // provjereni webhook — pa se ovdje prikazuje čekanje, ne Pro.
  const processing = useSearchParams().get("checkout") === "success";

  const chip =
    state.kind === "pro"
      ? { label: t("chipPro"), className: "bg-brand-100 text-brand-700" }
      : state.kind === "free"
        ? { label: t("chipFree"), className: "bg-neutral-100 text-neutral-600" }
        : { label: t("chipBeta"), className: "bg-neutral-100 text-neutral-600" };

  return (
    <SettingsCard
      title={t("title")}
      subtitle={t("subtitle")}
      headerAside={
        <span
          className={`inline-flex h-6 shrink-0 items-center rounded-full px-3 text-xs font-semibold ${chip.className}`}
        >
          {chip.label}
        </span>
      }
      bodyClassName="flex flex-col gap-5 p-6"
    >
      {processing && (
        <div className="flex items-start gap-3 rounded-md border-l-[3px] border-brand-500 bg-brand-50 p-4">
          <Spinner
            label={t("processing.title")}
            className="mt-0.5 size-4 shrink-0 border-2 border-brand-700/30 border-t-brand-700"
          />
          <div>
            <p className="text-sm font-semibold text-neutral-800">
              {t("processing.title")}
            </p>
            <p className="mt-0.5 text-[0.8125rem] text-neutral-600">
              {t("processing.body")}
            </p>
          </div>
        </div>
      )}

      {state.kind === "prelaunch" && <PrelaunchState />}
      {state.kind === "free" && (
        <ProUpsell organizationId={organizationId} cancelPath="/settings" />
      )}
      {state.kind === "pro" && (
        <ProState state={state} organizationId={organizationId} />
      )}
    </SettingsCard>
  );
}

// ───────── Prije pokretanja ─────────
// Bez mreže ograničenja i bez gumba za nadogradnju: ograničenja se ne provode,
// a mrtav gumb za kupnju i dalje nudi ponudu koju ne možemo ispuniti.
function PrelaunchState() {
  const t = useTranslations(NS);
  const [plansOpen, setPlansOpen] = useState(false);

  return (
    <div>
      <p className="text-sm text-neutral-800">{t("prelaunch.body")}</p>
      <p className="mt-2 text-[0.8125rem] text-neutral-600">
        {t.rich("prelaunch.planned", {
          // Otvara modal, pa je gumb — ne poveznica koja nikamo ne vodi.
          a: (chunks) => (
            <button
              type="button"
              onClick={() => setPlansOpen(true)}
              className="cursor-pointer font-medium text-brand-700 hover:underline"
            >
              {chunks}
            </button>
          ),
        })}
      </p>

      <PlansDialog open={plansOpen} onOpenChange={setPlansOpen} />
    </div>
  );
}

// Planirani planovi — iste kartice koje stoje na javnoj stranici cijena
// (PlanCards), bez gumba za kupnju: administrator je prijavljen, a naplata
// još nije moguća. Jedan izvor cijena za obje površine.
function PlansDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations(NS);
  const pricing = useTranslations("marketing.pricing");
  const [yearly, setYearly] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-3rem)] w-[calc(100%-2rem)] max-w-240 -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-white p-6 shadow-lg outline-none sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-heading text-2xl font-semibold text-neutral-800">
                {pricing("title")}
              </Dialog.Title>
              <Dialog.Description className="mt-1.5 text-[0.9375rem] text-neutral-600">
                {pricing("subtitle")}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label={t("prelaunch.close")}
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>

          <p className="mt-4 text-[0.8125rem] text-neutral-600">{pricing("betaNotice")}</p>

          <div className="mt-6 mb-8 flex justify-center">
            <BillingToggle yearly={yearly} onChange={setYearly} />
          </div>

          <PlanCards yearly={yearly} showCta={false} />

          <p className="mx-auto mt-5 max-w-220 text-center text-[0.8125rem] text-neutral-600">
            {pricing("footnote")}
          </p>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ───────── Pro plan ─────────
function ProState({
  state,
  organizationId,
}: {
  state: Extract<BillingState, { kind: "pro" }>;
  organizationId: string;
}) {
  const t = useTranslations(NS);
  const format = useFormatter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const urls = useReturnUrls();
  const sub = state.subscription;

  // Prelazak na godišnje. subscriptionId je OBAVEZAN kad pretplata već postoji:
  // bez njega plugin otvara drugu pretplatu i naplaćuje dvaput. Gumb se ionako
  // prikazuje samo kad postoji redak, pa i id postoji.
  async function switchYearly() {
    setPending(true);
    const { error } = await authClient.subscription.upgrade({
      plan: PRO_PLAN_NAME,
      annual: true,
      referenceId: organizationId,
      subscriptionId: sub?.stripeSubscriptionId ?? undefined,
      successUrl: urls.success,
      cancelUrl: urls.base,
      returnUrl: urls.base,
      locale: urls.locale,
    });
    if (error) {
      fail(error, t("errors.checkout"));
      setPending(false);
    }
  }

  // Način plaćanja, računi i otkazivanje žive u Stripe portalu — ništa od toga
  // se ne gradi ovdje.
  async function manageBilling() {
    setPending(true);
    const { error } = await authClient.subscription.billingPortal({
      referenceId: organizationId,
      returnUrl: urls.base,
      locale: urls.locale,
    });
    if (error) {
      fail(error, t("errors.portal"));
      setPending(false);
    }
  }

  const canceling = sub?.status === "canceling";
  const monthly = sub?.cycle === "monthly";

  // UTC: datum mora biti isti na poslužitelju i u pregledniku (hidracija).
  const renewsAt = sub
    ? format.dateTime(sub.renewsAt, {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;

  const statusLine = !renewsAt
    ? t("pro.activeNoDate")
    : canceling
      ? t("pro.canceling", { date: renewsAt })
      : sub?.status === "trialing"
        ? t("pro.trialing", { date: renewsAt })
        : t("pro.renews", { date: renewsAt });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          {sub && (
            <div className="flex items-baseline gap-1.5">
              <span className="font-heading text-3xl font-bold text-neutral-800">
                {format.number(monthly ? PRICE.monthly : PRICE.yearly, {
                  style: "currency",
                  currency: "EUR",
                  maximumFractionDigits: 0,
                })}
              </span>
              <span className="text-sm text-neutral-600">
                {monthly ? t("pro.perMonth") : t("pro.perYear")}
              </span>
            </div>
          )}
          <p
            className={`text-[0.8125rem] ${sub ? "mt-1.5" : ""} ${canceling ? "text-warning-700" : "text-neutral-600"}`}
          >
            {statusLine}
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {monthly && !canceling && (
            <button
              type="button"
              onClick={switchYearly}
              disabled={pending}
              className="h-10 cursor-pointer rounded-md border-[1.5px] border-brand-700 px-4 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("pro.switchYearly")}
            </button>
          )}
          <button
            type="button"
            onClick={manageBilling}
            disabled={pending}
            className="h-10 cursor-pointer rounded-md border border-neutral-200 px-4 text-sm font-semibold text-neutral-800 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? t("redirecting") : t("pro.manage")}
          </button>
        </div>
      </div>

      <p className="text-[0.8125rem] leading-relaxed text-neutral-600">
        {t("pro.includes")}
      </p>

      <div className="flex flex-wrap items-start justify-between gap-5 border-t border-neutral-200 pt-4">
        <p className="max-w-130 text-xs leading-relaxed text-neutral-600">
          {t("pro.retentionNote")}
        </p>
        {canceling ? (
          renewsAt && (
            <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-warning-50 px-3 text-xs font-semibold text-warning-700">
              {t("pro.cancelsChip", { date: renewsAt })}
            </span>
          )
        ) : (
          <button
            type="button"
            onClick={() => setCancelOpen(true)}
            className="h-9 shrink-0 cursor-pointer rounded-md px-3.5 text-[0.8125rem] font-semibold text-error-700 transition-colors hover:bg-error-50"
          >
            {t("pro.cancel")}
          </button>
        )}
      </div>

      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        date={renewsAt}
        organizationId={organizationId}
        subscriptionId={sub?.stripeSubscriptionId ?? null}
      />
    </>
  );
}

function CancelDialog({
  open,
  onOpenChange,
  date,
  organizationId,
  subscriptionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string | null;
  organizationId: string;
  subscriptionId: string | null;
}) {
  const t = useTranslations(NS);
  const [pending, setPending] = useState(false);
  const urls = useReturnUrls();

  // Potvrdi-pa-preusmjeri, ne potvrdi-pa-toast: plugin vodi na Stripeov portal,
  // gdje se otkazivanje dovršava. Modal ostaje jer govori ono što portal ne —
  // da Pro traje do kraja plaćenog razdoblja.
  //
  // ⚠ "nikad subscriptions.del" više ne jamči naš kod. Je li otkazivanje trenutno
  // ili na kraju razdoblja odlučuje konfiguracija portala u Stripe dashboardu, koju
  // aplikacija ne može pročitati (spec §8.2).
  async function cancelSubscription() {
    setPending(true);
    const { error } = await authClient.subscription.cancel({
      referenceId: organizationId,
      subscriptionId: subscriptionId ?? undefined,
      returnUrl: urls.base,
    });
    if (error) {
      fail(error, t("errors.cancel"));
      setPending(false);
      onOpenChange(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-3rem)] w-[calc(100%-2rem)] max-w-115 -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-white p-6 shadow-lg outline-none">
          <div className="flex items-start gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning-50 text-warning-700">
              <TriangleAlert className="size-5" />
            </span>
            <div className="min-w-0">
              <Dialog.Title className="font-heading text-xl font-semibold text-neutral-800">
                {t("cancelModal.title")}
              </Dialog.Title>
              {/* Nijedna nadogradnja naniže ne briše arhivu. Ako se ovaj tekst
                  mijenja, ne smije dobiti tvrdnju o brisanju. */}
              <Dialog.Description className="mt-2 text-sm leading-relaxed text-neutral-600">
                {t.rich(date ? "cancelModal.body" : "cancelModal.bodyNoDate", {
                  date: date ?? "",
                  b: (chunks) => (
                    <span className="font-semibold text-neutral-800">{chunks}</span>
                  ),
                })}
              </Dialog.Description>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={pending}
              className="h-11 cursor-pointer rounded-md px-5 text-[0.9375rem] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("cancelModal.keep")}
            </button>
            <button
              type="button"
              onClick={cancelSubscription}
              disabled={pending}
              className="h-11 cursor-pointer rounded-md bg-error-700 px-5.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-error-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? t("redirecting") : t("cancelModal.confirm")}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
