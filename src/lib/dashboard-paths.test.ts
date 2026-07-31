import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DASHBOARD_ONLY_PATHS,
  PUBLIC_AUTH_PATHS,
} from "@/lib/dashboard-paths";

// The (app) group is the admin app. Route folders exist once in the tree, so
// any surface missing from DASHBOARD_ONLY_PATHS is served by the APEX host too
// — the bug /settings shipped with before settings phase 1, and the one
// /profile would have shipped with here.
function appRouteSegments(): string[] {
  return readdirSync("src/app/[locale]/(app)", { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

describe("DASHBOARD_ONLY_PATHS", () => {
  it("covers every (app) route folder", () => {
    const missing = appRouteSegments().filter(
      (seg) =>
        // /results is deliberately absent: the proxy matches it EXACTLY,
        // because the apex must keep serving public /results/[id].
        seg !== "results" && !DASHBOARD_ONLY_PATHS.includes(`/${seg}`),
    );
    expect(missing).toEqual([]);
  });

  it("lists both account pages", () => {
    // Split into two routes by profile-settings phase 1; both are admin-only.
    expect(DASHBOARD_ONLY_PATHS).toContain("/profile");
    expect(DASHBOARD_ONLY_PATHS).toContain("/settings");
  });

  it("keeps /results out (exact-match path, public detail page)", () => {
    expect(DASHBOARD_ONLY_PATHS).not.toContain("/results");
  });

  it("redirects the pre-session auth surfaces off the apex as well", () => {
    // They gate differently on the dashboard host, but the apex must send
    // every one of them across — a login form on two hosts sets a cookie the
    // apex origin can't use.
    for (const p of PUBLIC_AUTH_PATHS) {
      expect(DASHBOARD_ONLY_PATHS).toContain(p);
    }
  });
});
