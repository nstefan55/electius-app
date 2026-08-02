import type { RateLimitAction } from "@/lib/rate-limit";

// Rate-limited BetterAuth paths (rate-limiting-spec + otp-implementation-auth-
// spec §6). These endpoints live inside the /api/auth/[...all] catch-all, so
// the limiter runs as a `before` hook keyed on ctx.path (see lib/auth/index).
// `withEmail` folds the target email into the key — tighter per-account
// limits, and one shared IP (campus NAT) can't exhaust everyone's attempts.
//
// /sign-up/email is listed even though registration normally goes through our
// own /api/auth/register route (which rate-limits itself — its server-side
// signUpEmail call carries no client IP for this hook to read): the native
// path is directly POST-able under the catch-all, so without its own rule a
// scripted client bypasses the 3/h register limit entirely (2026-07-21 audit,
// HIGH). /change-password shares the resetPassword window — session-gated,
// but throttles wrong-current-password guessing on a hijacked session (audit,
// LOW).
//
// /send-verification-email stays for the same direct-POST reason: its UI path
// died with the emailOTP override, but the endpoint still triggers a send —
// removing the rule would reopen an unthrottled send path (2026-07-25 spec
// review). It shares the resendVerification window with the new OTP send path
// so alternating endpoints can't double the budget; /email-otp/verify-email is
// the code-guessing guard layered above the plugin's per-code allowedAttempts.
//
// Lives in this dependency-free module (type-only import) so tests can pin
// the map without booting the BetterAuth server instance.
// `withUser` keys on the session's user id instead of the IP — for routes that
// already require a session. IP keying punishes the wrong person there: everyone
// behind one NAT shares a budget, and a brand-new admin on a brand-new
// organization inherits an exhausted window from an unrelated account. Falls
// back to the IP when no session resolves, so unauthenticated probing stays capped.
export const RATE_LIMIT_RULES: Record<
  string,
  { action: RateLimitAction; withEmail?: boolean; withUser?: boolean }
> = {
  "/sign-in/email": { action: "login", withEmail: true },
  "/sign-up/email": { action: "register" },
  "/request-password-reset": { action: "forgotPassword" },
  "/reset-password": { action: "resetPassword" },
  "/change-password": { action: "resetPassword" },
  "/send-verification-email": { action: "resendVerification", withEmail: true },
  "/email-otp/send-verification-otp": {
    action: "resendVerification",
    withEmail: true,
  },
  "/email-otp/verify-email": { action: "verifyOtp", withEmail: true },
  // Šalje poštu s poveznicom za brisanje računa. Ključ je korisnik, ne IP: pošta
  // ide isključivo na vlastitu potvrđenu adresu, pa nitko ne može bombardirati
  // tuđi sandučić, a novi račun ne nasljeđuje tuđi potrošeni prozor.
  // /delete-user/callback namjerno NIJE ovdje — vidi komentar uz limiter.
  "/delete-user": { action: "deleteAccount", withUser: true },
};
