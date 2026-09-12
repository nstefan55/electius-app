"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OrganizationType } from "@/generated/prisma/client";
import { TERMS_VERSION } from "@/lib/legal";

// Profile + organization setup (setup-page-spec). Creates the admin's org and
// completes their name — the step that unblocks fresh accounts, since
// requireSession() bounces org-less users to /setup. Deliberately uses the raw
// BetterAuth session, NOT requireSession(): that helper redirects org-less
// users back here, which would deadlock the very action meant to fix it.
type ActionResult = { success: boolean; error?: string };

const schema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  organizationName: z.string().trim().min(1).max(255),
  organizationType: z.enum(OrganizationType),
  // Neobavezno U SHEMI, obavezno u akciji kad pristanak još nije zabilježen —
  // vidi ispod. Obrazac kvačicu i ne iscrtava organizaciji koja je već
  // pristala, pa bi z.literal(true) ovdje srušio svaki povratak na /setup.
  terms: z.boolean().optional(),
});

export async function completeSetup(input: unknown): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { success: false, error: "invalid" };
  const { firstName, lastName, organizationName, organizationType, terms } =
    parsed.data;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "unauthorized" };

  const name = `${firstName} ${lastName}`;
  try {
    const admin = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        organizationId: true,
        termsAcceptedAt: true,
        termsVersion: true,
        organization: { select: { termsAcceptedAt: true } },
      },
    });
    if (!admin) return { success: false, error: "unauthorized" };

    // Pristanak na uvjete (terms-of-service-spec D2). Organizacija je stranka
    // ugovora i ovdje tek nastaje, pa njezin zapis obvezuje — ali se pristanak
    // od v0.9.69 traži već na registraciji, gdje ga i zapisujemo na korisnika.
    //
    // Zato ovdje postoje TRI slučaja, ne dva:
    //   1. organizacija već ima zapis  → ništa; povratak na /setup je uređivanje
    //      profila, a ponovno pitanje ne bi promijenilo zapis.
    //   2. organizacija nema, korisnik ima → PREPIŠI korisnikov datum i inačicu.
    //      Ovuda prolazi e-mail put: kvačica je već bila na registraciji, pa
    //      bi drugo pitanje bilo trenje bez ijednog novog podatka. Prepisuje se
    //      izvorni datum, ne današnji — zapis mora reći KADA se pristalo.
    //   3. ni jedno ni drugo → pitaj. ⚠ Ovuda prolazi GOOGLE: taj gumb stoji
    //      iznad obrasca za registraciju i njegovu kvačicu ne čita, pa je ovo
    //      jedina vrata koja mu preostaju. Bez ovog slučaja Google put ne bi
    //      pristao nigdje.
    const orgAccepted = admin.organization?.termsAcceptedAt ?? null;
    // `?? null` nije ukras: nedostajuće polje je `undefined`, a `undefined ===
    // null` je false — bez normalizacije bi se račun bez zapisa čitao kao da
    // zapis IMA i kvačica se ne bi tražila nikome.
    const userAccepted = admin.termsAcceptedAt ?? null;
    const acceptsNow = orgAccepted === null && userAccepted === null;
    if (acceptsNow && terms !== true) return { success: false, error: "terms" };

    // Inačica se zapisuje uz vrijeme, jer §Q obećava obavijest prije izmjene:
    // bez nje je to obećanje neprovjerljivo.
    const stampUser = acceptsNow
      ? { termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION }
      : {};
    const acceptance =
      orgAccepted !== null
        ? {}
        : userAccepted !== null
          ? { termsAcceptedAt: userAccepted, termsVersion: admin.termsVersion }
          : stampUser;

    if (admin.organizationId) {
      // Revisit — refresh the profile + org in place, never create a second org.
      await prisma.$transaction([
        // stampUser je prazan osim u slučaju 3 (Google): osoba koja je ovdje
        // kliknula kvačicu dobiva i vlastiti zapis, pa je „tko je pristao"
        // odgovorivo bez čitanja organizacije.
        prisma.user.update({
          where: { id: session.user.id },
          data: { name, ...stampUser },
        }),
        prisma.organization.update({
          where: { id: admin.organizationId },
          data: {
            name: organizationName,
            type: organizationType,
            ...acceptance,
          },
        }),
      ]);
    } else {
      // One atomic write: nested create sets user.organizationId with the name.
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          name,
          ...stampUser,
          organization: {
            create: {
              name: organizationName,
              type: organizationType,
              contactEmail: session.user.email,
              ...acceptance,
            },
          },
        },
      });
    }
    return { success: true };
  } catch {
    // Includes the contactEmail-unique collision (P2002) — generic failure toast.
    return { success: false, error: "failed" };
  }
}
