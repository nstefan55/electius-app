"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BillingToggle, PlanCards } from "@/components/marketing/plan-cards";
import { useUpgradeCheckout } from "@/components/billing/use-upgrade-checkout";

// Tijelo stranice /upgrade — iste kartice plana koje nosi odredišna stranica,
// s Checkoutom umjesto poveznice na registraciju.
//
// PlanCards se ponovno koristi, a ne prepisuje: cjenik na dva mjesta razišao bi
// se prvom promjenom cijene, i to na površinama koje obje tvrde istu ponudu.
// Sav tekst zato dolazi iz marketing.pricing — jedan izvor cijena.
//
// Klijentska komponenta jer se ovdje miču dvije stvari: razdoblje naplate i
// stanje Checkouta. Zaštita, kontekst zaključane značajke i staza povratka
// ostaju na poslužiteljskoj stranici iznad.
export function UpgradePlans({
  organizationId,
  cancelPath,
}: {
  organizationId: string;
  cancelPath: string;
}) {
  const t = useTranslations("dashboard.upgrade");
  const tb = useTranslations("dashboard.settings.billing");
  const tp = useTranslations("marketing.pricing");
  const [yearly, setYearly] = useState(false);
  const { upgrade, pending } = useUpgradeCheckout({ organizationId, cancelPath });

  return (
    <>
      <div className="mb-8 flex justify-center">
        <BillingToggle yearly={yearly} onChange={setYearly} />
      </div>

      <PlanCards
        yearly={yearly}
        // Registracija ovdje nije potez: administrator je prijavljen. Oba utora
        // se popunjavaju, pa natuknice obiju kartica ostaju u istoj liniji.
        showCta={false}
        // Ova stranica postoji tek kad se Pro doista može kupiti, pa bi „Uskoro"
        // iznad gumba za Checkout bila neistina.
        proBadge={false}
        // Free kartica nije mrtav stupac — na njoj administrator upravo JEST,
        // i stranica to inače nigdje ne kaže. Visina prati Pro gumb (min-h-12).
        freeCta={
          <div className="mb-7 flex min-h-12 items-center justify-center rounded-md border border-dashed border-neutral-200 bg-neutral-50 font-heading text-[0.9375rem] font-semibold text-neutral-600">
            {t("currentPlan")}
          </div>
        }
        proCta={
          <div className="mb-7 flex flex-col gap-2.5">
            {/* Šalje se razdoblje, nikad cijena — karticu koja objavi iznos
                može se namjestiti na pretplatu od 0 €. */}
            <button
              type="button"
              onClick={() => upgrade(yearly)}
              disabled={pending}
              className="min-h-12 cursor-pointer rounded-md bg-white font-heading text-[0.9375rem] font-semibold text-brand-700 transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? tb("redirecting") : tb("upsell.cta")}
            </button>
            <span className="text-center text-[0.8125rem] text-brand-100">
              {tp("pro.trial")}
            </span>
          </div>
        }
      />
    </>
  );
}
