import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// urls.ts reads NEXT_PUBLIC_* into module-level consts at import time, so env
// vars must be stubbed before each dynamic import (vi.resetModules() forces a
// fresh evaluation instead of vitest's cached module graph).
describe("urls", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://dashboard.electius.com");
    vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", "https://electius.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds dashboard-host auth links", async () => {
    const { signInUrl, signUpUrl } = await import("@/lib/urls");
    expect(signInUrl()).toBe("https://dashboard.electius.com/login");
    expect(signUpUrl()).toBe("https://dashboard.electius.com/signup");
  });

  it("builds apex voter + results links", async () => {
    const { voteUrl, publicResultsUrl, marketingHomeUrl } = await import(
      "@/lib/urls"
    );
    expect(voteUrl("abc123")).toBe("https://electius.com/vote/abc123");
    expect(publicResultsUrl("election1")).toBe(
      "https://electius.com/results/election1",
    );
    expect(marketingHomeUrl()).toBe("https://electius.com/");
  });
});
