"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { Dialog } from "@base-ui/react/dialog";
import {
  Archive,
  BarChart3,
  BellOff,
  Check,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { BillingToggle, PlanCards } from "@/components/marketing/plan-cards";
import { SettingsCard } from "@/components/settings/settings-card";
import { Spinner } from "@/components/ui/spinner";

// "Plan i naplata" na /settings (profile-settings-phase-7-spec).
//
// SAMO SUČELJE. Ne zove Stripe, ne piše isPro, ne pomiče novac — CTA-ovi su
// imenovani šavovi koje popunjava stripe-integration-phase-2-spec §2.

// Iznosi su u kodu, ne u katalogu: formatira ih next-intl, pa tvrdo kodiran
// znak € nikad ne uđe u prijevod. Autoritet: project-paywall-spec.md.
const PRICE = { monthly: 9, yearly: 86, yearlyPerMonth: 7.2 } as const;

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
      } | null;
    };

export function BillingCard({ state }: { state: BillingState }) {
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
      {state.kind === "free" && <FreeState />}
      {state.kind === "pro" && <ProState state={state} />}
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

// ───────── Besplatni plan ─────────
function FreeState() {
  const t = useTranslations(NS);
  const format = useFormatter();
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const monthly = cycle === "monthly";

  // → createCheckoutSession(cycle) (stripe-integration-phase-2 §2).
  // Šalje se razdoblje iz stanja iznad, nikad cijena: iznos s klijenta može se
  // krivotvoriti u pretplatu od 0 €.
  function upgrade() {
    toast(t("comingSoon"));
  }

  const price = (value: number, digits: number) =>
    format.number(value, {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  const limits = [
    { icon: Users, text: t("limits.voters") },
    { icon: BarChart3, text: t("limits.results") },
    { icon: BellOff, text: t("limits.reminders") },
    { icon: Archive, text: t("limits.archive") },
  ];

  // nowrap: inače se "Godišnje −20 %" na 390 px lomi usred oznake.
  const segment = (active: boolean) =>
    `h-8 cursor-pointer rounded-full px-4 text-[0.8125rem] font-semibold whitespace-nowrap transition-colors ${
      active ? "bg-white text-brand-900" : "text-white/75 hover:text-white"
    }`;

  return (
    <>
      <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-x-6">
        {limits.map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-2.5 text-sm text-neutral-800">
            <Icon aria-hidden="true" className="size-4 shrink-0 text-neutral-600" />
            {text}
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-brand-900 p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <h3 className="font-heading text-xl font-semibold">{t("upsell.name")}</h3>
            <div aria-live="polite">
              <div className="mt-2.5 flex items-baseline gap-1.5">
                <span className="font-heading text-4xl leading-none font-bold">
                  {monthly ? price(PRICE.monthly, 0) : price(PRICE.yearly, 0)}
                </span>
                <span className="text-sm text-white/65">
                  {monthly ? t("upsell.perMonth") : t("upsell.perYear")}
                </span>
              </div>
              <p className="mt-2 text-[0.8125rem] text-white/65">
                {monthly
                  ? t("upsell.noteMonthly", { price: price(PRICE.yearly, 0) })
                  : t("upsell.noteYearly", {
                      price: price(PRICE.yearlyPerMonth, 2),
                    })}
              </p>
            </div>
          </div>

          <div
            role="group"
            aria-label={t("upsell.cycleLabel")}
            className="inline-flex gap-1 rounded-full bg-white/12 p-0.75"
          >
            <button
              type="button"
              aria-pressed={monthly}
              onClick={() => setCycle("monthly")}
              className={segment(monthly)}
            >
              {t("upsell.monthly")}
            </button>
            <button
              type="button"
              aria-pressed={!monthly}
              onClick={() => setCycle("yearly")}
              className={segment(!monthly)}
            >
              {t("upsell.yearly")}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-2.25 sm:grid-cols-2 sm:gap-x-6">
          {(t.raw("upsell.features") as string[]).map((feature) => (
            <div
              key={feature}
              className="flex items-start gap-2.25 text-[0.8125rem] text-white/90"
            >
              <Check
                aria-hidden="true"
                strokeWidth={3}
                className="mt-0.5 size-3.5 shrink-0 text-brand-500"
              />
              {feature}
            </div>
          ))}
        </div>

        <p className="mt-5 text-[0.8125rem] text-white/65">{t("upsell.trial")}</p>
        <button
          type="button"
          onClick={upgrade}
          className="mt-3 h-11 cursor-pointer rounded-md bg-white px-5.5 text-[0.9375rem] font-semibold text-brand-700 transition-colors hover:bg-brand-50"
        >
          {t("upsell.cta")}
        </button>
      </div>
    </>
  );
}

// ───────── Pro plan ─────────
function ProState({ state }: { state: Extract<BillingState, { kind: "pro" }> }) {
  const t = useTranslations(NS);
  const format = useFormatter();
  const [cancelOpen, setCancelOpen] = useState(false);

  // → createPortalSession() (stripe-integration-phase-2 §2). Način plaćanja,
  // računi i promjena razdoblja žive u Stripe portalu — ništa od toga se ne
  // gradi ovdje, kao ni sučelje za proration.
  function switchYearly() {
    toast(t("comingSoon"));
  }

  // → createPortalSession()
  function manageBilling() {
    toast(t("comingSoon"));
  }

  const sub = state.subscription;
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
              className="h-10 cursor-pointer rounded-md border-[1.5px] border-brand-700 px-4 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
            >
              {t("pro.switchYearly")}
            </button>
          )}
          <button
            type="button"
            onClick={manageBilling}
            className="h-10 cursor-pointer rounded-md border border-neutral-200 px-4 text-sm font-semibold text-neutral-800 transition-colors hover:bg-neutral-100"
          >
            {t("pro.manage")}
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

      <CancelDialog open={cancelOpen} onOpenChange={setCancelOpen} date={renewsAt} />
    </>
  );
}

function CancelDialog({
  open,
  onOpenChange,
  date,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string | null;
}) {
  const t = useTranslations(NS);

  // → cancelSubscription() (stripe-integration-phase-2 §2). Otkazivanje je
  // uvijek cancel_at_period_end, nikad subscriptions.del.
  function cancelSubscription() {
    toast(t("comingSoon"));
    onOpenChange(false);
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
              className="h-11 cursor-pointer rounded-md px-5 text-[0.9375rem] font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
            >
              {t("cancelModal.keep")}
            </button>
            <button
              type="button"
              onClick={cancelSubscription}
              className="h-11 cursor-pointer rounded-md bg-error-700 px-5.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-error-500"
            >
              {t("cancelModal.confirm")}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
