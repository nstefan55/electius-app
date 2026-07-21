"use server";

import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireSession } from "@/lib/auth/require-session";
import { prisma } from "@/lib/prisma";

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
