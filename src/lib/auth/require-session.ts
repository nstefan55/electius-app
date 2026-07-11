import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/mock-data";

// Auth guard seam — the single authorization choke point for the (app) shell.
// See domain-architecture-spec.md §5 (decision B): full session + org authz belongs here.
//
// Returns the signed-in user + the organizationId they belong to. Callers thread
// `organizationId` into every Prisma query/mutation to enforce multi-tenant isolation.
//
// ponytail: mock-backed this phase — cached lookup by mock email to derive the
// seeded org id (cuids aren't stable across seeds). TODO(auth-spec): replace with
// a real BetterAuth session read + redirect-to-/login when unauthenticated.
// cache() de-dupes the DB hit per request.
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
  // Reading cookies marks every caller as dynamic (no per-page force-dynamic
  // needed) AND is exactly the seam real BetterAuth will use for the session
  // token — swapping mock → real auth is a lookup change, not a shape change.
  await cookies();

  const admin = await prisma.user.findUnique({
    where: { email: currentUser.email },
    select: { organizationId: true },
  });
  if (!admin?.organizationId) {
    throw new Error(
      "Mock admin has no organization — run `npx prisma db seed`",
    );
  }
  return {
    user: {
      name: currentUser.name,
      email: currentUser.email,
      organization: currentUser.organization,
      isPro: currentUser.isPro,
    },
    organizationId: admin.organizationId,
  };
});
