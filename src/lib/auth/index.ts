import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// BetterAuth server instance — mounted at /api/auth/[...all]. Auth lives on the
// dashboard host only (BETTER_AUTH_URL = baseURL, secret = BETTER_AUTH_SECRET,
// both read from env automatically). See domain-architecture-spec §5.A.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // Both of our hosts may originate auth calls. Needed in dev, where
  // BETTER_AUTH_URL=http://localhost:3000 (Google rejects plain-HTTP redirect
  // URIs on anything but exactly localhost/127.0.0.1 — dashboard.localhost
  // fails its rules) while the login page lives on dashboard.localhost.
  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_MARKETING_URL,
  ].filter((origin): origin is string => Boolean(origin)),
  // Our Prisma model is `VerificationToken`; BetterAuth's default is `verification`.
  verification: { modelName: "verificationToken" },
  emailAndPassword: {
    enabled: true,
    // Seeded credential accounts are bcrypt (12 rounds), not BetterAuth's scrypt
    // default — see prisma/seed.ts. Hash new passwords the same way so one
    // verify path covers both.
    // Salting: bcrypt salts automatically — hash(pw, 12) generates a unique
    // random salt per password (= genSalt(12) + hash) and embeds it in the
    // stored hash; compare() extracts it on verify. Satisfies "salt + hash".
    password: {
      hash: (password) => bcrypt.hash(password, 12),
      verify: ({ hash, password }) => bcrypt.compare(password, hash),
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  // Keep last — lets Server Actions calling the auth API set cookies (Next.js
  // integration default). Route-handler flows work without it.
  plugins: [nextCookies()],
});

// Typed session (user.id included) — BetterAuth infers this; no .d.ts augmentation.
export type AuthSession = typeof auth.$Infer.Session;
