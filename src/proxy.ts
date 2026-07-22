import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { routing } from "./i18n/routing";

const handleI18n = createMiddleware(routing);

// Host = audience (domain-architecture-spec §1): dashboard.electius.com is the
// admin app, the apex is public. The proxy only routes — cookie-PRESENCE gate
// here, real session validation in requireSession() (the (app) choke point).
export function isDashboardHost(host: string): boolean {
  return host.split(":")[0].startsWith("dashboard."); // covers dashboard.localhost in dev
}

// Pre-session auth surfaces; /setup + /onboarding come AFTER signup
// (autoSignIn sets the cookie), so they stay gated (§5.B).
const PUBLIC_AUTH_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
];

// Admin-only surfaces the apex would otherwise also serve (route folders exist
// once) — apex hits 307 to NEXT_PUBLIC_APP_URL. Prefix-matched; /results is
// checked separately as EXACT-only because apex /results/[id] is public.
const DASHBOARD_ONLY_PATHS = [
  ...PUBLIC_AUTH_PATHS,
  "/setup",
  "/onboarding",
  "/home",
  "/elections",
  "/archive",
  "/voters",
  "/settings",
];

// Leading locale segment, e.g. "hr" in "/hr/…" — null for a bare "/" since
// localePrefix: "always" prefixes every locale including the default.
function localePrefix(pathname: string): string | null {
  const seg = pathname.split("/")[1];
  return (routing.locales as readonly string[]).includes(seg) ? seg : null;
}

export default function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";

  if (isDashboardHost(host)) {
    const { pathname, search } = request.nextUrl;
    const prefix = localePrefix(pathname); // "hr" | "en" | null (bare root)
    const rest = prefix ? pathname.slice(prefix.length + 1) : pathname;

    // Reverse-leak guard (auth-phase-3): voter ballots are apex-only. Bounce
    // /vote/* off the admin host BEFORE the auth gate so a stray dashboard-host
    // magic link reaches the ballot, never the admin login — the admin surface
    // must not serve voter routes (anonymity boundary). Fail-open if env unset.
    const marketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL;
    if (marketingUrl && (rest === "/vote" || rest.startsWith("/vote/"))) {
      return NextResponse.redirect(
        new URL(`/${prefix ?? routing.defaultLocale}${rest}${search}`, marketingUrl),
      );
    }

    // Auth gate (auth-phase-1): everything on this host needs a session cookie
    // except the public auth surfaces. Cookie PRESENCE only — the signed-in
    // bounce off login/signup lives in those pages (SessionBounce) with real
    // DB validation; bouncing on presence here redirect-looped for stale
    // cookies (e.g. sessions revoked by a password reset).
    const isPublicAuth = PUBLIC_AUTH_PATHS.some(
      (p) => rest === p || rest.startsWith(`${p}/`),
    );
    const hasSessionCookie = Boolean(getSessionCookie(request));

    if (!hasSessionCookie && !isPublicAuth) {
      const url = request.nextUrl.clone();
      url.pathname = `/${prefix ?? routing.defaultLocale}/login`;
      return NextResponse.redirect(url);
    }

    if (rest === "" || rest === "/") {
      // Host root ("/", "/hr", "/en") → the localized home overview. We
      // MUST emit the rewrite ourselves: next-intl returns next() for an
      // already-canonical path, which would re-route the ORIGINAL "/hr" to the
      // marketing page (the phase-1 bilingual gap). See domain-architecture-spec §6.
      const url = request.nextUrl.clone();
      url.pathname = `/${prefix ?? routing.defaultLocale}/home`;
      return NextResponse.rewrite(url);
    }
  } else {
    // Apex host: admin-only surfaces 307 cross-host to the app host (single
    // hop, locale + query preserved); marketing /, /vote/[token] and public
    // /results/[id] serve as-is. Trailing slashes never reach the proxy —
    // Next 308-normalizes them first.
    const { pathname, search } = request.nextUrl;
    const prefix = localePrefix(pathname);
    const rest = prefix ? pathname.slice(prefix.length + 1) || "/" : pathname;

    const isDashboardOnly =
      rest === "/results" ||
      DASHBOARD_ONLY_PATHS.some((p) => rest === p || rest.startsWith(`${p}/`));

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (isDashboardOnly && appUrl) {
      return NextResponse.redirect(
        new URL(`/${prefix ?? routing.defaultLocale}${rest}${search}`, appUrl),
      );
    }
  }

  return handleI18n(request);
}

export const config = {
  // Skip API routes, Next internals, and any path with a file extension.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
