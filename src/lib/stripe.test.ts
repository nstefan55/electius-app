import { afterEach, describe, expect, it, vi } from "vitest";

// stripe.ts memoizira klijenta u module-level const, pa svaki slučaj traži
// vi.resetModules() + dinamički import (obrazac iz urls.test.ts). Svaka varijabla
// se postavlja eksplicitno — vitest ne učitava .env, ali ambijentalni VERCEL_ENV
// na CI-u bi inače tiho promijenio ishod.
const TEST_KEY = "sk_test_fake_key_for_unit_tests";
const LIVE_KEY = "sk_live_fake_key_for_unit_tests";

async function loadStripe(env: {
  key?: string;
  vercelEnv?: string;
  nodeEnv?: string;
  billingEnabled?: string;
}) {
  vi.resetModules();
  vi.stubEnv("STRIPE_SECRET_KEY", env.key);
  vi.stubEnv("VERCEL_ENV", env.vercelEnv);
  vi.stubEnv("NODE_ENV", env.nodeEnv ?? "test");
  // Naoružano osim ako slučaj ne kaže drukčije — zastava je ta koja pali provjeru.
  // `in`, ne `??`: slučaj koji izričito šalje undefined testira upravo odsutnu zastavu.
  vi.stubEnv("BILLING_ENABLED", "billingEnabled" in env ? env.billingEnabled : "true");
  return import("@/lib/stripe");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("stripeClient — VERCEL_ENV decides what 'production' means", () => {
  // Sve četiri kombinacije nose NODE_ENV=production, jer next build ga takvim
  // postavlja na svakom Vercel deployu. Samo VERCEL_ENV razlikuje redove.
  it("allows a test key on a Preview deployment", async () => {
    // Razlog postojanja ovog popravka: prije je Preview + test ključ bacao
    // pri učitavanju modula i rušio SVAKU prijavljenu stranicu.
    const { stripeClient } = await loadStripe({
      key: TEST_KEY,
      vercelEnv: "preview",
      nodeEnv: "production",
    });
    expect(() => stripeClient()).not.toThrow();
  });

  it("still refuses a test key on the Production deployment", async () => {
    const { stripeClient } = await loadStripe({
      key: TEST_KEY,
      vercelEnv: "production",
      nodeEnv: "production",
    });
    expect(() => stripeClient()).toThrow("Test ključ u produkciji");
  });

  it("refuses a live key on a Preview deployment", async () => {
    const { stripeClient } = await loadStripe({
      key: LIVE_KEY,
      vercelEnv: "preview",
      nodeEnv: "production",
    });
    expect(() => stripeClient()).toThrow("Live ključ izvan produkcije");
  });

  it("allows a live key on the Production deployment", async () => {
    const { stripeClient } = await loadStripe({
      key: LIVE_KEY,
      vercelEnv: "production",
      nodeEnv: "production",
    });
    expect(() => stripeClient()).not.toThrow();
  });

  it("treats any other VERCEL_ENV value as not-production", async () => {
    const { stripeClient } = await loadStripe({
      key: LIVE_KEY,
      vercelEnv: "development",
      nodeEnv: "production",
    });
    expect(() => stripeClient()).toThrow("Live ključ izvan produkcije");
  });
});

describe("stripeClient — BILLING_ENABLED arms the test-key check", () => {
  it("allows a test key in production while billing is off", async () => {
    // Pretplata nije upaljena za korisnike, pa test ključ nikoga ne zavarava —
    // ovo je ono što dopušta testiranje webhooka na pravoj domeni.
    const { stripeClient } = await loadStripe({
      key: TEST_KEY,
      vercelEnv: "production",
      nodeEnv: "production",
      billingEnabled: "false",
    });
    expect(() => stripeClient()).not.toThrow();
  });

  it("re-arms the moment billing is switched on", async () => {
    const { stripeClient } = await loadStripe({
      key: TEST_KEY,
      vercelEnv: "production",
      nodeEnv: "production",
      billingEnabled: "true",
    });
    expect(() => stripeClient()).toThrow("Test ključ u produkciji");
  });

  it("treats an unset flag as billing-off, never as armed", async () => {
    const { stripeClient } = await loadStripe({
      key: TEST_KEY,
      vercelEnv: "production",
      nodeEnv: "production",
      billingEnabled: undefined,
    });
    expect(() => stripeClient()).not.toThrow();
  });

  it("never lets the flag excuse a live key outside production", async () => {
    // Zastava dira samo test ključ. Novčana strana ostaje nedirnuta.
    const { stripeClient } = await loadStripe({
      key: LIVE_KEY,
      vercelEnv: "preview",
      nodeEnv: "production",
      billingEnabled: "false",
    });
    expect(() => stripeClient()).toThrow("Live ključ izvan produkcije");
  });

  it("still allows a live key in production with billing off", async () => {
    const { stripeClient } = await loadStripe({
      key: LIVE_KEY,
      vercelEnv: "production",
      nodeEnv: "production",
      billingEnabled: "false",
    });
    expect(() => stripeClient()).not.toThrow();
  });
});

describe("stripeClient — NODE_ENV fallback when VERCEL_ENV is absent", () => {
  it("refuses a live key locally", async () => {
    const { stripeClient } = await loadStripe({
      key: LIVE_KEY,
      vercelEnv: undefined,
      nodeEnv: "development",
    });
    expect(() => stripeClient()).toThrow("Live ključ izvan produkcije");
  });

  it("allows a test key locally", async () => {
    const { stripeClient } = await loadStripe({
      key: TEST_KEY,
      vercelEnv: undefined,
      nodeEnv: "development",
    });
    expect(() => stripeClient()).not.toThrow();
  });

  it("keeps the old NODE_ENV=production behaviour off Vercel", async () => {
    // Ne-Vercel build i dalje odbija test ključ — fallback nije rupa u tom smjeru.
    const { stripeClient } = await loadStripe({
      key: TEST_KEY,
      vercelEnv: undefined,
      nodeEnv: "production",
    });
    expect(() => stripeClient()).toThrow("Test ključ u produkciji");
  });
});

describe("stripeClient — key presence and memoization", () => {
  it("throws when the secret key is missing", async () => {
    const { stripeClient } = await loadStripe({ key: undefined, vercelEnv: "preview" });
    expect(() => stripeClient()).toThrow("STRIPE_SECRET_KEY");
  });

  it("returns the same instance on repeated calls", async () => {
    const { stripeClient } = await loadStripe({ key: TEST_KEY, vercelEnv: "preview" });
    expect(stripeClient()).toBe(stripeClient());
  });
});

describe("stripeConfigured", () => {
  it("is false when only the secret key is set", async () => {
    // Bez tajne webhooka plugin se ne montira; ruta 404-a umjesto da tiho
    // odbacuje svaki potpis.
    vi.resetModules();
    vi.stubEnv("STRIPE_SECRET_KEY", TEST_KEY);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", undefined);
    const { stripeConfigured } = await import("@/lib/stripe");
    expect(stripeConfigured).toBe(false);
  });

  it("is true only when both keys are set", async () => {
    vi.resetModules();
    vi.stubEnv("STRIPE_SECRET_KEY", TEST_KEY);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fake");
    const { stripeConfigured } = await import("@/lib/stripe");
    expect(stripeConfigured).toBe(true);
  });
});
