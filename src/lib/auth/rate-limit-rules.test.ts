import { describe, expect, it } from "vitest";
import { RATE_LIMIT_RULES } from "@/lib/auth/rate-limit-rules";

describe("RATE_LIMIT_RULES", () => {
  it("covers both email-otp endpoints, keyed IP+email", () => {
    expect(RATE_LIMIT_RULES["/email-otp/send-verification-otp"]).toEqual({
      action: "resendVerification",
      withEmail: true,
    });
    expect(RATE_LIMIT_RULES["/email-otp/verify-email"]).toEqual({
      action: "verifyOtp",
      withEmail: true,
    });
  });

  it("keeps the legacy send-verification-email rule (direct-POST guard)", () => {
    // The OTP override killed the UI path, not the endpoint — it's still
    // POST-able under the catch-all and still sends. Removing this rule
    // would reopen an unthrottled email-send path (2026-07-25 spec review).
    expect(RATE_LIMIT_RULES["/send-verification-email"]).toEqual({
      action: "resendVerification",
      withEmail: true,
    });
  });

  it("throttles the delete-account send but not the emailed callback", () => {
    // withUser, NOT the IP: the mail only ever reaches the account's own verified
    // address, so per-user is safe — while IP keying would let one exhausted
    // account block a brand-new admin on a brand-new organization behind the
    // same connection.
    expect(RATE_LIMIT_RULES["/delete-user"]).toEqual({
      action: "deleteAccount",
      withUser: true,
    });
    expect(RATE_LIMIT_RULES["/delete-user"].withEmail).toBeUndefined();
    // The callback is the only step that actually erases anything; the token is
    // unguessable and single-use, so a limit there would only break a legitimate
    // second click on a link the user already had to receive.
    expect(RATE_LIMIT_RULES["/delete-user/callback"]).toBeUndefined();
  });

  it("both send endpoints share one limiter window", () => {
    // Same action = same Upstash prefix — alternating endpoints can't
    // double the 3/15-min send budget.
    expect(RATE_LIMIT_RULES["/email-otp/send-verification-otp"].action).toBe(
      RATE_LIMIT_RULES["/send-verification-email"].action,
    );
  });
});
