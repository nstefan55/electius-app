import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { verifyPassword } from "better-auth/crypto";
import { nextCookies } from "better-auth/next-js";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// BetterAuth server instance, mounted at /api/auth/[...all]; auth lives on the
// dashboard host only (BETTER_AUTH_URL/BETTER_AUTH_SECRET read from env — see
// domain-architecture-spec §5.A), with both public hosts trusted as origins
// because dev keeps auth on http://localhost:3000 while the login page lives
// on dashboard.localhost (Google rejects non-localhost plain-HTTP redirects).
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_MARKETING_URL,
  ].filter((origin): origin is string => Boolean(origin)),
  // Our Prisma model is `VerificationToken`; BetterAuth's default is `verification`.
  verification: { modelName: "verificationToken" },
  emailAndPassword: {
    enabled: true,
    // New passwords use BetterAuth's scrypt default (memory-hard vs bcrypt,
    // per-password random salt embedded in its `salt:key` format) by leaving
    // `hash` unset. Verify falls back to bcrypt for legacy seeded accounts
    // (bcrypt hashes always start with "$2") — keep bcryptjs installed until
    // those are migrated. See auth-phase-3-spec.
    password: {
      verify: ({ hash, password }) =>
        hash.startsWith("$2")
          ? bcrypt.compare(password, hash)
          : verifyPassword({ hash, password }),
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  // Keep last — lets Server Actions calling the auth API set cookies.
  plugins: [nextCookies()],
});

// Typed session (user.id included) — BetterAuth infers this; no .d.ts augmentation.
export type AuthSession = typeof auth.$Infer.Session;
