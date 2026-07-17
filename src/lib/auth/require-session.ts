import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routing } from "@/i18n/routing";

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
    organization: string;
    isPro: boolean;
  };
  organizationId: string;
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
      organizationId: true,
      organization: { select: { name: true } },
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
      organization: admin.organization.name,
      isPro: admin.isPro,
    },
    organizationId: admin.organizationId,
  };
});

// Locale for redirect targets; falls back to the default outside an i18n
// request context (e.g. a Server Action with an expired session).
function resolveLocale(): Promise<string> {
  return getLocale().catch(() => routing.defaultLocale);
}
