import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routing } from "@/i18n/routing";
import type { AccessibilityPrefs } from "@/lib/accessibility";

// Auth guard seam — the single authorization choke point for the (app) shell
// (domain-architecture-spec §5, decision B). Real BetterAuth session as of
// auth-phase-3: validates the session against the DB (the proxy only checks
// cookie PRESENCE), loads the admin's org, and redirects when either is
// missing. Callers thread `organizationId` into every Prisma query/mutation
// to enforce multi-tenant isolation. cache() de-dupes the lookups per request;
// the headers() read keeps every consumer dynamic (no per-page force-dynamic).
export interface Session {
  user: {
    name: string;
    email: string;
    // Read from the DB, not from the BetterAuth session object, so an upload
    // shows up on the next request instead of waiting for the session to roll.
    image: string | null;
    organization: string;
    // Rides along on the org select that already runs — no extra round trip,
    // and the PDF report needs it wherever it renders.
    organizationLogo: string | null;
    isPro: boolean;
  };
  organizationId: string;
  // Preferencije pristupačnosti — ljuska ih pretvara u data-atribute.
  accessibility: AccessibilityPrefs;
}

export const requireSession = cache(async (): Promise<Session> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    // Cookie present but session invalid/expired — the proxy gate can't tell.
    redirect(`/${await resolveLocale()}/login`);
  }

  // BetterAuth's session user carries only its own fields — isPro + org are
  // ours, so one scoped read completes the shape.
  const admin = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      isPro: true,
      image: true,
      organizationId: true,
      organization: { select: { name: true, logoUrl: true } },
      reduceMotion: true,
      highContrast: true,
      largerText: true,
      focusOutlines: true,
    },
  });
  if (!admin?.organizationId || !admin.organization) {
    // Signed in but no organization yet (fresh signup / Google OAuth) — /setup
    // owns profile + org creation and unblocks the account.
    redirect(`/${await resolveLocale()}/setup`);
  }

  return {
    user: {
      name: session.user.name,
      email: session.user.email,
      image: admin.image,
      organization: admin.organization.name,
      organizationLogo: admin.organization.logoUrl,
      isPro: admin.isPro,
    },
    organizationId: admin.organizationId,
    accessibility: {
      reduceMotion: admin.reduceMotion,
      highContrast: admin.highContrast,
      largerText: admin.largerText,
      focusOutlines: admin.focusOutlines,
    },
  };
});

// Locale for redirect targets; falls back to the default outside an i18n
// request context (e.g. a Server Action with an expired session).
function resolveLocale(): Promise<string> {
  return getLocale().catch(() => routing.defaultLocale);
}
