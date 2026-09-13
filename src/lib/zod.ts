import { z } from "zod";

// zod v4 pri gradnji PRVE objektne sheme provjerava podržava li okruženje JIT
// tako da napravi `new Function("")`. Naš CSP nema 'unsafe-eval', pa preglednik
// prijavi securitypolicyviolation prije nego zod uhvati iznimku: jedna greška u
// konzoli po stranici, i trajni šum onog dana kad praćenje grešaka počne slušati
// (mvp-launch §4 / D9). `jitless` gasi tu provjeru na izvoru — zod baš taj
// slučaj dokumentira u v4/core/util.cjs:216.
//
// NIKAD ovo ne "popravljati" dodavanjem 'unsafe-eval' u CSP.
//
// Samo preglednik: poslužitelj nema CSP i zadržava brži JIT validator. Zastavica
// živi na globalThis (`__zod_globalConfig`), pa bi postavljanje tijekom SSR-a
// klijentske komponente ugasilo JIT za svaku poslužiteljsku akciju u procesu —
// uvjet je tu zbog toga, nije mikrooptimizacija.
//
// `z` se u svemu što dođe do preglednika uvozi ODAVDE. Ponovni izvoz JE jamstvo
// redoslijeda: `allowsEval` je memoiziran i čita se kad se shema GRADI, dakle
// konfiguracija mora leći prije prvog z.object() poziva — a `z` iz ovog modula
// ne možeš dobiti a da se nije izvršila. Pinano u zod-jitless.test.ts.
if (typeof window !== "undefined") z.config({ jitless: true });

export { z };
