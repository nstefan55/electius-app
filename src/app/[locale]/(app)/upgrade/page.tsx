import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/require-session";
import { resolveEntitlement } from "@/lib/services/entitlement.service";
import { FREE_VOTER_CAP, PRO_VOTER_CAP } from "@/lib/entitlements";
import { upgradeContextKey } from "@/lib/upgrade-context";
import { ProUpsell } from "@/components/billing/pro-upsell";

// /upgrade — odredište zaključane Pro značajke (pro-features-gating §3).
//
// Prava ruta, ne preusmjeravanje na /settings: preusmjeravanje baca ono jedino
// što ova stranica ima, a granica nema — KOJA je značajka zaustavila
// administratora — i spušta ga usred posla na stranicu s pet kartica postavki.
//
// Sesija i pripadnost organizaciji dolaze iz (app)/layout.tsx; requireSession je
// cache()-an, pa je ponovni poziv ovdje jedno memoizirano čitanje.
//
// Zaštita je razrješivač i ništa drugo — bez čitanja BILLING_ENABLED. Zastavica
// je privremena i briše se nakon osnivanja tvrtke, a razrješivač je već kratko
// spaja: dok je isključena svi razrješavaju `pro`, pa je ova ruta nedostupna do
// pokretanja naplate. To je zahtjev, postignut bez drugog prekidača.
export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string | string[] }>;
}) {
  const { organizationId } = await requireSession();
  const entitlement = await resolveEntitlement(null, organizationId);
  const locale = await getLocale();

  // Preusmjeravanje, ne notFound(): administrator je uredno prijavljen, a
  // njegov plan doista živi na /settings.
  if (entitlement.kind !== "free") redirect(`/${locale}/settings`);

  const { feature } = await searchParams;
  const key = upgradeContextKey(feature);
  const t = await getTranslations("dashboard.upgrade");

  // Staza povratka nosi PROČIŠĆEN ključ, nikad sirovi parametar: odustajanje od
  // Checkouta vraća na isti kontekst, a Stripe nikad ne dobije URL sklopljen od
  // korisničkog unosa.
  const cancelPath = key === "generic" ? "/upgrade" : `/upgrade?feature=${key}`;

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-neutral-800">
          {t(`context.${key}.title`)}
        </h1>
        {/* Zaglavlje kaže ŠTO je zaustavljeno i što Pro tu mijenja. Popis
            značajki plana namjerno ne ponavlja — stoji odmah ispod.
            Granice dolaze iz konstanti, ne iz prijevoda: broj upisan u katalog
            razišao bi se sa zaštitom koja ga provodi. Poruke bez tih mjesta
            dodatne vrijednosti jednostavno ignoriraju. */}
        <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-neutral-600">
          {t(`context.${key}.body`, {
            free: FREE_VOTER_CAP,
            pro: PRO_VOTER_CAP,
          })}
        </p>
      </div>

      <section className="flex flex-col gap-5 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <ProUpsell organizationId={organizationId} cancelPath={cancelPath} />
      </section>
    </div>
  );
}
