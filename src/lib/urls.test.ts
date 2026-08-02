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
    const { voteUrl, electionVoteUrl, publicResultsUrl, marketingHomeUrl } =
      await import("@/lib/urls");
    expect(voteUrl("abc123")).toBe("https://electius.com/vote/abc123");
    expect(electionVoteUrl("elc1")).toBe("https://electius.com/vote/elc1");
    expect(publicResultsUrl("election1")).toBe(
      "https://electius.com/results/election1",
    );
    expect(marketingHomeUrl()).toBe("https://electius.com/");
  });

  it("points the delete-account link at our page, not the BetterAuth API route", async () => {
    const { confirmDeletionUrl } = await import("@/lib/urls");
    // /api/auth/delete-user/callback answers a session-less GET with JSON 404 on
    // a blank page (email opened on a phone). Our page owns every outcome.
    expect(confirmDeletionUrl("tok123")).toBe(
      "https://dashboard.electius.com/confirm-deletion?token=tok123",
    );
    expect(confirmDeletionUrl("a b&c")).toBe(
      "https://dashboard.electius.com/confirm-deletion?token=a%20b%26c",
    );
  });
});
