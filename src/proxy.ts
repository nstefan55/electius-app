import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const handleI18n = createMiddleware(routing);

// dashboard.electius.com serves the admin app at its root. Rewrite ONLY the root
// "/" → the localized "/dashboard"; every other admin route is already root-level
// under (app), so it needs no rewrite. Auth is NOT enforced here — the session
// choke point lives in (app)/layout.tsx (Phase 2 seam). See domain-architecture-spec §6.
function isDashboardHost(host: string): boolean {
  return host.split(":")[0].startsWith("dashboard."); // covers dashboard.localhost in dev
}

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
  }

  return handleI18n(request);
}

export const config = {
  // Skip API routes, Next internals, and any path with a file extension.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
