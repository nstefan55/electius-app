"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Dialog } from "@base-ui/react/dialog";
import { CreditCard, Trash2 } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { SettingsCard } from "@/components/settings/settings-card";
import { Spinner } from "@/components/ui/spinner";

// "Upravljanje računom" na /settings (profile-settings-phase-4-spec §1, dizajn:
// Settings.dc.html § Account management). Namjerno obična kartica, bez crvenog
// okvira: okvir upozorava na stranicu, a opasna je jedna radnja.
//
// Ovdje se ništa ne briše. Potvrda šalje e-poštu; brisanje izvršava tek klik na
// poveznicu iz nje (BetterAuth /delete-user/callback).

// Fiksna riječ, nikad prevedena — potvrda ne smije ovisiti o tome koji je jezik
// preglednik učitao.
const CONFIRM_WORD = "DELETE";

export function AccountManagementCard({
  organizationName,
  organizationId,
  subscriptionActive,
}: {
  organizationName: string;
  organizationId: string;
  subscriptionActive: boolean;
}) {
  const t = useTranslations("dashboard.settings.account");
  const tBilling = useTranslations("dashboard.settings.billing");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [portalPending, setPortalPending] = useState(false);

  // Otkazivanje se dovršava u Stripe portalu — jedino što odblokira brisanje.
  async function manageBilling() {
    setPortalPending(true);
    const { error } = await authClient.subscription.billingPortal({
      referenceId: organizationId,
      returnUrl: `/${locale}/settings`,
      locale,
    });
    // Uspjeh znači preusmjeravanje, pa se pending gasi samo na grešci.
    if (error) {
      if (error.message) console.error("[billing]", error.message);
      toast.error(tBilling("errors.portal"));
      setPortalPending(false);
    }
  }

  return (
    <SettingsCard
      title={t("title")}
      subtitle={t("subtitle")}
      bodyClassName="flex items-center justify-between gap-4 px-6 py-5"
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-neutral-800">{t("deleteLabel")}</div>
        <div className="mt-0.5 text-[0.8125rem] text-neutral-600">
          {t("deleteDescription")}
        </div>
      </div>

      {subscriptionActive ? (
        // Blokada se provjerava i na poslužitelju (beforeDelete) — ovo je samo
        // objašnjenje, ne zaštita.
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <p className="max-w-64 text-right text-[0.8125rem] text-neutral-600">
            {t("subscriptionBlocked")}
          </p>
          <button
            type="button"
            onClick={manageBilling}
            disabled={portalPending}
            className="inline-flex cursor-pointer items-center gap-1.5 text-[0.8125rem] font-semibold text-brand-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:no-underline"
          >
            <CreditCard className="size-3.5" />
            {t("manageBilling")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-10 shrink-0 cursor-pointer rounded-md bg-error-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-error-500"
        >
          {t("deleteLabel")}
        </button>
      )}

      <DeleteAccountDialog
        open={open}
        onOpenChange={setOpen}
        organizationName={organizationName}
      />
    </SettingsCard>
  );
}

function DeleteAccountDialog({
  open,
  onOpenChange,
  organizationName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationName: string;
}) {
  const t = useTranslations("dashboard.settings.account");
  const locale = useLocale();
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);

  const armed = typed.trim().toUpperCase() === CONFIRM_WORD;

  function close(next: boolean) {
    if (pending) return;
    if (!next) setTyped(""); // svako otvaranje kreće od prazne potvrde
    onOpenChange(next);
  }

  async function confirm() {
    if (!armed || pending) return;
    setPending(true);
    const { error } = await authClient.deleteUser({
      callbackURL: `/${locale}/account-deleted`,
    });
    setPending(false);

    if (error) {
      toast.error(error.status === 429 ? t("rateLimited") : t("requestFailed"));
      return;
    }
    close(false);
    toast.success(t("requested"), { duration: 8000 });
  }

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-3rem)] w-[calc(100%-2rem)] max-w-120 -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-white p-6 shadow-lg outline-none">
          <div className="flex items-start gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-error-50 text-error-700">
              <Trash2 className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-heading text-xl font-semibold text-neutral-800">
                {t("modalTitle")}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm leading-relaxed text-neutral-600">
                {t.rich("modalBody", {
                  org: organizationName,
                  b: (chunks) => (
                    <span className="font-semibold text-neutral-800">{chunks}</span>
                  ),
                })}
              </Dialog.Description>
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-neutral-600">
                {/* Ista ruta koju nudi kartica izvoza — brisanje je zadnji
                    trenutak da administrator uzme svoje podatke. */}
                {t.rich("modalExport", {
                  a: (chunks) => (
                    <a
                      href={`/api/organization/export?locale=${locale}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {chunks}
                    </a>
                  ),
                })}{" "}
                {t("modalGdpr")}
              </p>

              <div className="mt-4">
                <label
                  htmlFor="delete-confirm"
                  className="mb-1.5 block text-[0.8125rem] font-medium text-neutral-800"
                >
                  {t.rich("confirmLabel", {
                    word: () => (
                      <span className="font-mono font-medium text-error-700">
                        {CONFIRM_WORD}
                      </span>
                    ),
                  })}
                </label>
                <input
                  id="delete-confirm"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  className="h-11 w-full rounded-md border border-neutral-200 bg-white px-3 font-mono text-[0.9375rem] text-neutral-950 outline-none focus:border-error-500 focus:shadow-[0_0_0_3px_rgba(185,28,28,0.20)]"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => close(false)}
              className="h-11 cursor-pointer rounded-md px-5 text-[0.9375rem] font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
            >
              {t("keepAccount")}
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!armed || pending}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-error-700 px-5.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-error-500 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
            >
              {pending && (
                <Spinner
                  label={t("sending")}
                  className="size-4 border-2 border-white/40 border-t-white"
                />
              )}
              {t("deletePermanently")}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
