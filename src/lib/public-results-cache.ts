import "server-only";

import { revalidatePath } from "next/cache";
import { LOCALES } from "@/i18n/config";

/**
 * Poništi keširanu javnu stranicu rezultata jednog izbora.
 *
 * `/results/[id]` je JEDINA poslužiteljski keširana ruta u aplikaciji (ISR,
 * `revalidate = 3600`), a `router.refresh()` do nje ne dohvaća: on čisti
 * klijentski keš TEKUĆE rute i poslužiteljski izrijekom ne dira. Bez ovoga
 * zatvoreni izbori do sat vremena prikazuju skriveni zaslon, a izbrisani i
 * dalje svoj zbroj.
 *
 * Petlja po `LOCALES` jer je ruta prefiksirana jezikom (`localePrefix:
 * "always"`): `/hr/results/{id}` i `/en/results/{id}` keširaju se odvojeno, pa
 * bi tvrdo upisan `/hr` ostavio `/en` zastarjelim — i to bez ijedne greške.
 * Zato i doslovne putanje, a ne uzorak `"page"`: on bi poništio SVE keširane
 * stranice rezultata, a sintaksa s grupom ruta ovdje nije provjerena.
 *
 * Nikad ne baca (posture `clearSweepGate`): mutacija ne smije pasti jer je keš
 * štucnuo. Izgubljena invalidacija je slučaj omeđen TTL-om, neuspjelo
 * zatvaranje nije. `catch` je unutar petlje da pad jednog jezika ne pojede
 * drugi.
 */
export function revalidatePublicResults(id: string): void {
  for (const locale of LOCALES) {
    try {
      revalidatePath(`/${locale}/results/${id}`);
    } catch (error) {
      // Glasno, nikad progutano — inače je zastarjela stranica bez ikakvog traga.
      console.error("[cache] public results revalidate failed", {
        id,
        locale,
        error,
      });
    }
  }
}
