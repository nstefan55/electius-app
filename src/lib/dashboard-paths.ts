// Path lists the proxy routes on. Kept out of proxy.ts so tests can read them
// without booting next-intl / BetterAuth (same reason as auth/rate-limit-rules.ts).

// Pre-session auth surfaces; /setup + /onboarding come AFTER signup
// (autoSignIn sets the cookie), so they stay gated (domain-architecture-spec §5.B).
export const PUBLIC_AUTH_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  // Poveznica iz e-pošte za brisanje računa: otvara se i bez sesije (pošta na
  // mobitelu), pa stranica sama traži prijavu umjesto da je vratar odbije.
  "/confirm-deletion",
  // Odredište nakon brisanja računa: sesija je već poništena, pa stranica mora
  // biti dostupna bez kolačića (profile-settings-phase-4-spec §2).
  "/account-deleted",
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
