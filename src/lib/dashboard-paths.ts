// Path lists the proxy routes on. Kept out of proxy.ts so tests can read them
// without booting next-intl / BetterAuth (same reason as auth/rate-limit-rules.ts).

// Pre-session auth surfaces; /setup + /onboarding come AFTER signup
// (autoSignIn sets the cookie), so they stay gated (domain-architecture-spec §5.B).
export const PUBLIC_AUTH_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
];

// Admin-only surfaces the apex would otherwise also serve (route folders exist
// once) — apex hits 307 to NEXT_PUBLIC_APP_URL. Prefix-matched; /results is
// checked separately as EXACT-only because apex /results/[id] is public.
export const DASHBOARD_ONLY_PATHS = [
  ...PUBLIC_AUTH_PATHS,
  "/setup",
  "/onboarding",
  "/home",
  "/elections",
  "/archive",
  "/voters",
  "/profile",
  "/settings",
];
