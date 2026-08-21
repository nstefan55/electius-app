"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { authClient } from "@/lib/auth/client";
import { PRO_PLAN_NAME } from "@/lib/billing";

// Prva kupnja Pro plana — jedan poziv, dva pozivna mjesta: ProUpsell (/settings,
// besplatno stanje) i UpgradePlans (/upgrade). Druga kopija bila bi drugi opis
// novčane staze, a upravo su njezina svojstva ono što ne smije odlutati:
// šalje se razdoblje a NIKAD cijena, staza povratka je pročišćena, uspjeh vodi
// na /settings.
//
// Namjerno NE pokriva ProState.switchYearly (prijelaz postojeće pretplate na
// godišnje) — ono nosi subscriptionId, bez kojeg plugin otvara drugu pretplatu i
// naplaćuje dvaput. Drugo pitanje, drugi poziv.
//
// Živi uz komponente, ne u src/lib: ondje je površina koju pokrivaju unit
// testovi (invarijanta #8), a kuka bez React rendera se u node okruženju ne
// može izvršiti.

// Korisniku ide prevedena poruka, nikad Stripeova. Njegovi tekstovi su engleski
// i interni ("the subscription update feature in the portal configuration is
// disabled") — administratoru ne govore ništa, a hrvatsko sučelje ne smije
// procuriti engleski. Original ide u konzolu, gdje i pripada.
export function fail(
  error: { message?: string } | null | undefined,
  localized: string,
) {
  if (error?.message) console.error("[billing]", error.message);
  toast.error(localized);
}

export function useUpgradeCheckout({
  organizationId,
  // Puna staza s upitnim nizom, jer odustajanje od Checkouta mora vratiti na
  // ISTU stranicu — uključujući ?feature=…, koji je jedini razlog zbog kojeg je
  // /upgrade prava ruta a ne preusmjeravanje.
  cancelPath,
}: {
  organizationId: string;
  cancelPath: string;
}) {
  const t = useTranslations("dashboard.settings.billing");
  const locale = useLocale();
  const [pending, setPending] = useState(false);

  // Uspjeh UVIJEK vodi na /settings: ondje živi provjerena traka "obrada u
  // tijeku", a svježeg pretplatnika vratiti na stranicu koja mu nudi kupnju je
  // krivi zaslon — i čim webhook stigne, /upgrade bi ga ionako odbio.
  const successUrl = `/${locale}/settings?checkout=success`;
  const cancelUrl = `/${locale}${cancelPath}`;

  // Plugin otvara Checkout i sam preusmjerava. locale ide dalje da Stripeove
  // stranice budu na hrvatskom, a ne na jeziku preglednika.
  async function upgrade(annual: boolean) {
    setPending(true);
    const { error } = await authClient.subscription.upgrade({
      plan: PRO_PLAN_NAME,
      annual,
      referenceId: organizationId,
      successUrl,
      cancelUrl,
      locale,
    });
    // Uspjeh znači preusmjeravanje, pa se pending namjerno ne gasi — gumb ostaje
    // zaključan dok stranica ne ode.
    if (error) {
      fail(error, t("errors.checkout"));
      setPending(false);
    }
  }

  return { upgrade, pending };
}
