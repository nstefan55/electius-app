import "server-only";

import { prisma } from "@/lib/prisma";
import { resolveLocale, type Locale } from "@/i18n/config";

// Jezik primatelja za tri poruke koje BetterAuth šalje sam (OTP, reset lozinke,
// potvrda brisanja računa). Živi ovdje, a ne u lib/auth/index.ts, iz istog
// razloga kao rate-limit-rules.ts: test tako čita pravilo bez podizanja
// BetterAutha, a invarijanta #8 drži testove u src/lib i src/actions.
//
// Redak uvijek postoji: signUpEmail ga stvori prije nego pozove slanje, a
// /api/auth/register mu je upravo upisao jezik stranice na kojoj se korisnik
// registrirao — pa je i prva poruka na tom jeziku. Email je @unique i
// indeksiran, a sve tri staze su rijetke.
//
// resolveLocale, a ne gola vrijednost: stupac je TEXT i piše ga i BetterAuthov
// /sign-up/email, koji se može gađati izravno — nepoznat jezik bi inače složio
// alias koji Resend ne poznaje i slanje bi puklo umjesto da padne na hr.
export async function localeForEmail(email: string): Promise<Locale> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { locale: true },
  });
  return resolveLocale(user?.locale);
}
