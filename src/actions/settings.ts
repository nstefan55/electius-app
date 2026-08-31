"use server";

import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireSession } from "@/lib/auth/require-session";
import { prisma } from "@/lib/prisma";
import { ACCESSIBILITY_KEYS } from "@/lib/accessibility";
import { revokeDeletionRequests } from "@/lib/services/account-deletion.service";
import { LOCALES } from "@/i18n/config";

// Settings mutations (profile-settings phase 1). requireSession() first, then
// writes scoped to the session's own user/organization — a foreign id can
// never reach the where clause. Password change is NOT here: it goes through
// BetterAuth's own endpoint via authClient.changePassword (client-side).
type ActionResult = { success: boolean; error?: string };

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
});

export async function updateProfile(input: unknown): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "invalid" };

  const session = await requireSession();
  // Session carries email, not id — email is @unique, same row.
  const name = `${parsed.data.firstName} ${parsed.data.lastName}`;
  try {
    await prisma.user.update({
      where: { email: session.user.email },
      data: { name },
    });
    return { success: true };
  } catch {
    return { success: false, error: "failed" };
  }
}

// Jedna akcija za sve četiri preferencije, ne četiri. `key` je zatvorena
// unija, pa dinamički `data: { [key]: value }` nikad ne može pisati u
// proizvoljan stupac — to je jedino što ovaj oblik čini sigurnim.
const accessibilitySchema = z.object({
  key: z.enum(ACCESSIBILITY_KEYS),
  value: z.boolean(),
});

export async function setAccessibilityPref(
  input: unknown,
): Promise<ActionResult> {
  const parsed = accessibilitySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "invalid" };

  const session = await requireSession();
  try {
    await prisma.user.update({
      where: { email: session.user.email },
      data: { [parsed.data.key]: parsed.data.value },
    });
    return { success: true };
  } catch {
    return { success: false, error: "failed" };
  }
}

// Jezik je do sada bio SAMO segment URL-a: kartica je navigirala i nije pisala
// ništa, pa je izbor umirao na sljedećem dolasku na /hr. Ovaj upis je ono što
// navigaciju čini trajnom — i jedino po čemu metla i BetterAuthove kuke, koje
// nemaju ni zahtjev ni sesiju, mogu znati čiji je jezik koji.
const localeSchema = z.object({ locale: z.enum(LOCALES) });

export async function setLocale(input: unknown): Promise<ActionResult> {
  const parsed = localeSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "invalid" };

  const session = await requireSession();
  try {
    await prisma.user.update({
      where: { email: session.user.email },
      data: { locale: parsed.data.locale },
    });
    return { success: true };
  } catch {
    return { success: false, error: "failed" };
  }
}

// Povlačenje zahtjeva za brisanje. Do sada se predomisliti značilo ne kliknuti
// poveznicu i čekati 24 sata — ništa na /settings nije ni pokazivalo da nešto
// visi. Bez ulaza, dakle bez zoda; bez ograničenja brzine, jer je iza sesije i
// ne uništava ništa osim korisnikove vlastite poveznice.
export async function cancelDeletionRequest(): Promise<ActionResult> {
  const session = await requireSession();
  try {
    // Sesija nosi e-poštu, ne id, a BetterAuthov token je vezan uz id — isti
    // upit u jednom koraku kao ruta za avatar.
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) return { success: false, error: "failed" };

    await revokeDeletionRequests(user.id);
    return { success: true };
  } catch {
    return { success: false, error: "failed" };
  }
}

const organizationSchema = z.object({
  name: z.string().trim().min(1).max(255),
  contactEmail: z.email(),
});

export async function updateOrganization(
  input: unknown,
): Promise<ActionResult> {
  const parsed = organizationSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "invalid" };

  const session = await requireSession();
  try {
    await prisma.organization.update({
      where: { id: session.organizationId },
      data: parsed.data,
    });
    return { success: true };
  } catch (err) {
    // contactEmail is @unique — name the collision instead of a generic toast.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return { success: false, error: "emailTaken" };
    }
    return { success: false, error: "failed" };
  }
}
