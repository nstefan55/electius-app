import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { routing } from "./i18n/routing";

const handleI18n = createMiddleware(routing);

// dashboard.electius.com serves the admin app at its root. Rewrite ONLY the root
// "/" → the localized "/dashboard"; every other admin route is already root-level
// under (app), so it needs no rewrite. The proxy gate below is a cookie-PRESENCE
// check only (no DB/API call — BetterAuth Next.js guidance); real session
// validation stays in the (app)/layout.tsx choke point. See domain-architecture-spec §6.
function isDashboardHost(host: string): boolean {
  return host.split(":")[0].startsWith("dashboard."); // covers dashboard.localhost in dev
}

// Pre-session auth surfaces — reachable without a session cookie. /setup and
// /onboarding come AFTER signup (autoSignIn sets the cookie), so they stay gated.
// See domain-architecture-spec §5.B.
const PUBLIC_AUTH_PATHS = ["/login", "/signup"];

// Dashboard-host-only surfaces (auth-phase-2): the route folders exist once in
// the app tree, so the apex would otherwise serve them too (the §9 "known
// ceiling" in domain-architecture-spec). Accessed on the apex they redirect to
// NEXT_PUBLIC_APP_URL. Prefix-matched — /results is handled separately as
// EXACT-only, because apex /results/[id] is the public results page.
const DASHBOARD_ONLY_PATHS = [
  ...PUBLIC_AUTH_PATHS,
  "/setup",
  "/onboarding",
  "/dashboard",
  "/elections",
  "/archive",
  "/voters",
];

// Locale sitting at the front of the path, e.g. "hr" in "/hr" or "en" in "/en".
// With localePrefix: "always" EVERY locale is prefixed, including the default (hr),
// so a bare "/" (no leading locale) returns null and falls back to the default below.
function localePrefix(pathname: string): string | null {
  const seg = pathname.split("/")[1];
  return (routing.locales as readonly string[]).includes(seg) ? seg : null;
}

export default function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";

  if (isDashboardHost(host)) {
    const { pathname } = request.nextUrl;
    const prefix = localePrefix(pathname); // "hr" | "en" | null (bare root)
    const rest = prefix ? pathname.slice(prefix.length + 1) : pathname;

    // ── Auth gate (auth-phase-1): everything on the dashboard host requires a
    // session cookie except the pre-session auth pages. Locale-aware redirect
    // (one hop, no next-intl 307 in between).
    const isPublicAuth = PUBLIC_AUTH_PATHS.some(
      (p) => rest === p || rest.startsWith(`${p}/`),
    );
    const hasSessionCookie = Boolean(getSessionCookie(request));

    if (!hasSessionCookie && !isPublicAuth) {
      const url = request.nextUrl.clone();
      url.pathname = `/${prefix ?? routing.defaultLocale}/login`;
      return NextResponse.redirect(url);
    }
    if (hasSessionCookie && isPublicAuth) {
      // Signed-in users bounce off login/signup → dashboard overview.
      const url = request.nextUrl.clone();
      url.pathname = `/${prefix ?? routing.defaultLocale}/dashboard`;
      return NextResponse.redirect(url);
    }

    if (rest === "" || rest === "/") {
      // Root of the dashboard host ("/", "/hr", "/en") → the dashboard overview,
      // at the resolved locale. Bare "/" has no prefix → default locale.
      // We MUST emit the rewrite ourselves. Delegating to next-intl silently drops it:
      // for the already-canonical "/hr/dashboard" next-intl returns next() (no rewrite),
      // and next() re-routes the ORIGINAL "/hr" → the marketing page. Rewriting straight
      // to the internal /{locale}/dashboard is locale-correct (the [locale] segment drives
      // getRequestConfig) and works for both hr and en. See domain-architecture-spec §6.
      const url = request.nextUrl.clone();
      url.pathname = `/${prefix ?? routing.defaultLocale}/dashboard`;
      return NextResponse.rewrite(url);
    }
  } else {
    // ── Apex host: dashboard-only surfaces cross-host-redirect to the app host
    // (single hop, locale resolved here so the target emits no second redirect).
    // Everything else (marketing /, /vote/[token], /results/[id]) serves as-is.
    const { pathname, search } = request.nextUrl;
    const prefix = localePrefix(pathname);
    // No trailing-slash handling needed — Next 308-normalizes "/x/" → "/x"
    // before the proxy runs (verified), so `rest` never carries one.
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
