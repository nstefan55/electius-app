import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isCanceling,
  isProStatus,
  PRO_PLAN_NAME,
  proPlan,
  requiredPriceId,
} from "@/lib/billing";

// billing.ts čita process.env u trenutku poziva, ne pri importu, pa je vi.stubEnv
// dovoljan — vi.resetModules() + dinamički import (obrazac iz urls.test.ts) ovdje
// ne bi ništa dokazao jer nema module-level consta koji bi se zamrznuo.
const MONTHLY = "price_test_monthly_9eur";
const YEARLY = "price_test_yearly_86eur";

describe("requiredPriceId", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", MONTHLY);
    vi.stubEnv("STRIPE_PRICE_PRO_YEARLY", YEARLY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the monthly ID for the monthly cycle, never the yearly one", () => {
    expect(requiredPriceId("monthly")).toBe(MONTHLY);
    expect(requiredPriceId("monthly")).not.toBe(YEARLY);
  });

  it("returns the yearly ID for the yearly cycle, never the monthly one", () => {
    expect(requiredPriceId("yearly")).toBe(YEARLY);
    expect(requiredPriceId("yearly")).not.toBe(MONTHLY);
  });

  it("throws when the variable is missing instead of falling back", () => {
    // Pad na drugi ciklus naplaćuje godišnjem pretplatniku 9 €/mj. Nema sigurnog
    // zamjenskog price ID-a, pa nema ni zamjene.
    vi.stubEnv("STRIPE_PRICE_PRO_YEARLY", undefined);
    expect(() => requiredPriceId("yearly")).toThrow("STRIPE_PRICE_PRO_YEARLY");
  });

  it("throws for the monthly cycle too", () => {
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", undefined);
    expect(() => requiredPriceId("monthly")).toThrow("STRIPE_PRICE_PRO_MONTHLY");
  });
});

describe("proPlan", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", MONTHLY);
    vi.stubEnv("STRIPE_PRICE_PRO_YEARLY", YEARLY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("puts the MONTHLY id on priceId", () => {
    // Odvojene tvrdnje: zamjena dviju varijabli je greška koju jedinični testovi
    // najčešće promaše jer objekt i dalje ima oba ključa popunjena.
    expect(proPlan().priceId).toBe(MONTHLY);
  });

  it("puts the YEARLY id on annualDiscountPriceId", () => {
    expect(proPlan().annualDiscountPriceId).toBe(YEARLY);
  });

  it("names the plan pro and carries a 14-day trial", () => {
    expect(proPlan().name).toBe(PRO_PLAN_NAME);
    expect(proPlan().name).toBe("pro");
    expect(proPlan().freeTrial.days).toBe(14);
  });

  it("throws if a price variable is missing", () => {
    vi.stubEnv("STRIPE_PRICE_PRO_YEARLY", undefined);
    expect(() => proPlan()).toThrow("STRIPE_PRICE_PRO_YEARLY");
  });
});

describe("isProStatus", () => {
  it("grants Pro while paying, trialing, or in dunning grace", () => {
    expect(isProStatus("active")).toBe(true);
    expect(isProStatus("trialing")).toBe(true);
    expect(isProStatus("past_due")).toBe(true);
  });

  it("revokes Pro once the subscription is over or never started", () => {
    expect(isProStatus("canceled")).toBe(false);
    expect(isProStatus("unpaid")).toBe(false);
    expect(isProStatus("incomplete_expired")).toBe(false);
    expect(isProStatus("incomplete")).toBe(false);
    expect(isProStatus("paused")).toBe(false);
  });

  it("treats an unknown status as not paying", () => {
    expect(isProStatus("something_new")).toBe(false);
    expect(isProStatus("")).toBe(false);
    expect(isProStatus("ACTIVE")).toBe(false);
  });
});

describe("isCanceling", () => {
  const ENDS = new Date("2026-09-04T10:00:00Z");

  it("says no while the subscription will bill again", () => {
    expect(isCanceling({ cancelAtPeriodEnd: false, cancelAt: null })).toBe(false);
    // Redak koji webhook još nije popunio — null nije "otkazano".
    expect(isCanceling({ cancelAtPeriodEnd: null, cancelAt: null })).toBe(false);
  });

  it("says yes on cancelAtPeriodEnd alone", () => {
    expect(isCanceling({ cancelAtPeriodEnd: true, cancelAt: null })).toBe(true);
  });

  it("cancelAt only → true", () => {
    // Oblik probnog razdoblja: Stripe NE diže cancelAtPeriodEnd nego postavlja
    // cancelAt. Provjera samo booleana proglašava otkazano probno razdoblje
    // aktivnim i zaključava brisanje računa do kraja probnog razdoblja.
    expect(isCanceling({ cancelAtPeriodEnd: false, cancelAt: ENDS })).toBe(true);
    expect(isCanceling({ cancelAtPeriodEnd: null, cancelAt: ENDS })).toBe(true);
  });

  it("says yes when both are set (plaćeni plan, 2026-08-21)", () => {
    expect(isCanceling({ cancelAtPeriodEnd: true, cancelAt: ENDS })).toBe(true);
  });
});
