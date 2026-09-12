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
        organization: { select: { termsAcceptedAt: true } },
      },
    });
    if (!admin) return { success: false, error: "unauthorized" };

    // Pristanak na uvjete (terms-of-service-spec D2). OVDJE, a ne na
    // registraciji: ovo je jedini put kojim prolaze oba načina prijave —
    // Googleov callback slijeće ovamo, e-mail put dolazi nakon OTP-a, a
    // requireSession() ovamo vraća svaki račun bez organizacije. Prije ovoga
    // je jedina kvačica u proizvodu bila zaobilazna klikom na istaknutiji
    // gumb.
    //
    // Traži se samo dok zapisa nema. Povratak na /setup je uređivanje profila;
    // ponovno traženje pristanka na nepromijenjene uvjete bilo bi trenje bez
    // zapisa, a zapis se ionako ne bi promijenio.
    const accepted = admin.organization?.termsAcceptedAt ?? null;
    const acceptsNow = accepted === null;
    if (acceptsNow && terms !== true) return { success: false, error: "terms" };
    // Inačica se zapisuje uz vrijeme, jer §Q obećava obavijest prije izmjene:
    // bez nje je to obećanje neprovjerljivo.
    const acceptance = acceptsNow
      ? { termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION }
      : {};

    if (admin.organizationId) {
      // Revisit — refresh the profile + org in place, never create a second org.
      await prisma.$transaction([
        prisma.user.update({ where: { id: session.user.id }, data: { name } }),
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
