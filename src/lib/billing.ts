// Sve o Stripeu što se može odlučiti bez poziva Stripeu. Odvojeno od stripe.ts
// da se može testirati bez SDK-a, i od entitlements.ts da entitlementi ostanu
// bez rječnika naplate.

export type BillingCycle = "monthly" | "yearly";

export const PRO_PLAN_NAME = "pro";

const PRICE_ENV: Record<BillingCycle, string> = {
  monthly: "STRIPE_PRICE_PRO_MONTHLY",
  yearly: "STRIPE_PRICE_PRO_YEARLY",
};

// Baca ako varijabla nedostaje. Zamjenski price ID ne postoji: pad na drugi
// ciklus naplaćuje godišnjem pretplatniku 9 €/mj ili mjesečnom 86 €.
export function requiredPriceId(cycle: BillingCycle): string {
  const name = PRICE_ENV[cycle];
  const value = process.env[name];
  if (!value) throw new Error(`${name} nije postavljen`);
  return value;
}

// Plan koji @better-auth/stripe dobiva u konfiguraciji (faza 2). Godišnja cijena
// je popust na istom planu (annual: true pri upgradeu), ne drugi plan.
// D4 (trial_settings.end_behavior = cancel) nije polje plana — ide kroz
// getCheckoutSessionParams u fazi 2.
export function proPlan(): {
  name: string;
  priceId: string;
  annualDiscountPriceId: string;
  freeTrial: { days: 14 };
} {
  return {
    name: PRO_PLAN_NAME,
    priceId: requiredPriceId("monthly"),
    annualDiscountPriceId: requiredPriceId("yearly"),
    freeTrial: { days: 14 },
  };
}

// past_due namjerno ostaje Pro: ukidanje na prvom neuspjelom naplatnom pokušaju
// kažnjava isteklu karticu, a Stripeov retry sam dolazi do canceled/unpaid.
// Faza 2 to logira u hooku da problem s naplatom bude vidljiv, ne tih.
const PRO_STATUSES = new Set(["active", "trialing", "past_due"]);

// Jedino mjesto gdje se Stripe status tumači. Nepoznat status → false.
export function isProStatus(status: string): boolean {
  return PRO_STATUSES.has(status);
}
