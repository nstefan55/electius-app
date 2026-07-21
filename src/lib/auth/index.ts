import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { verifyPassword } from "better-auth/crypto";
import { nextCookies } from "better-auth/next-js";
import { oAuthProxy } from "better-auth/plugins";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  checkRateLimit,
  clientIp,
  retryAfterSeconds,
  type RateLimitAction,
} from "@/lib/rate-limit";
import {
  sendResetPasswordEmail,
  sendVerificationEmail,
} from "@/lib/services/email.service";

// Rate-limited BetterAuth paths (rate-limiting-spec). These endpoints live
// inside the /api/auth/[...all] catch-all, so the limiter runs as a `before`
// hook keyed on ctx.path. `withEmail` folds the target email into the key —
// tighter per-account limits, and one shared IP (campus NAT) can't exhaust
// everyone's attempts. /sign-up/email is NOT listed: registration goes through
// our own /api/auth/register route, which rate-limits itself (the server-side
// auth.api.signUpEmail call carries no client IP for a hook to read).
const RATE_LIMIT_RULES: Record<
  string,
  { action: RateLimitAction; withEmail?: boolean }
> = {
  "/sign-in/email": { action: "login", withEmail: true },
  "/request-password-reset": { action: "forgotPassword" },
  "/reset-password": { action: "resetPassword" },
  "/send-verification-email": { action: "resendVerification", withEmail: true },
};

// Kill switch for the whole email-verification-on-register flow. Default ON
// (prod-safe); only the literal "false" disables it — for dev/testing when the
// Resend domain isn't verified (fallback sender only delivers to the account
// owner, so any other test email could never log in).
export const emailVerificationEnabled =
  process.env.EMAIL_VERIFICATION_ENABLED !== "false";

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
  // Email/password accounts must click the Resend-delivered link before they
  // can sign in (requireEmailVerification below). Google arrives pre-verified,
  // so sendOnSignUp skips OAuth users. Clicking the link opens the session
  // (autoSignInAfterVerification) and lands on the callbackURL from signup.
  // The whole flow is gated on emailVerificationEnabled (see above) — when off,
  // no emails send and signup reverts to autoSignIn → /setup.
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, url);
    },
    sendOnSignUp: emailVerificationEnabled,
    // A blocked sign-in attempt re-sends a fresh link — the "resend" UX with
    // zero extra UI.
    sendOnSignIn: emailVerificationEnabled,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24, // 24h, not the 1h default — signup emails get opened late
  },
  emailAndPassword: {
    enabled: true,
    // Unverified accounts get 403 EMAIL_NOT_VERIFIED on sign-in; signUpEmail
    // stops issuing the autoSignIn cookie (funnel: signup → inbox → /setup).
    requireEmailVerification: emailVerificationEnabled,
    // Forgot-password flow: requestPasswordReset emails a link whose click
    // lands on redirectTo?token=… (or ?error=INVALID_TOKEN). The single-use
    // token is persisted through the `verification` mapping above — i.e. in
    // our existing VerificationToken model, identifier "reset-password:<token>"
    // (1h default expiry). Deliberately NOT gated on emailVerificationEnabled —
    // reset must work regardless of the verification toggle.
    sendResetPassword: async ({ user, url }) => {
      await sendResetPasswordEmail(user.email, url);
    },
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
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const rule = RATE_LIMIT_RULES[ctx.path];
      if (!rule) return;
      const email =
        rule.withEmail && typeof ctx.body?.email === "string"
          ? ctx.body.email.toLowerCase()
          : null;
      const ip = clientIp(ctx.headers);
      const { success, reset } = await checkRateLimit(
        rule.action,
        email ? `${ip}:${email}` : ip,
      );
      if (!success) {
        const seconds = retryAfterSeconds(reset);
        throw new APIError(
          "TOO_MANY_REQUESTS",
          {
            code: "RATE_LIMITED",
            message: `Too many attempts. Please try again in ${Math.ceil(seconds / 60)} minutes.`,
          },
          { "Retry-After": String(seconds) },
        );
      }
    }),
  },
  plugins: [
    // Routes OAuth through the registered callback host (BETTER_AUTH_URL) and
    // hands the session back to the app host it can't serve directly. Dev:
    // fixes state_security_mismatch when signing in from dashboard.localhost
    // while Google's callback is registered on localhost:3000 (Chrome treats
    // localhost as a public suffix — no cookie sharing between the two).
    // currentURL must be explicit: Next dev normalizes request.url to
    // localhost:3000 regardless of the Host header, so the plugin's own
    // origin detection would always skip. Prod: NEXT_PUBLIC_APP_URL ===
    // BETTER_AUTH_URL (both dashboard.electius.com), so the proxy is inert.
    oAuthProxy({
      productionURL: process.env.BETTER_AUTH_URL,
      currentURL: process.env.NEXT_PUBLIC_APP_URL,
    }),
    // Keep last — lets Server Actions calling the auth API set cookies.
    nextCookies(),
  ],
});

// Typed session (user.id included) — BetterAuth infers this; no .d.ts augmentation.
export type AuthSession = typeof auth.$Infer.Session;
