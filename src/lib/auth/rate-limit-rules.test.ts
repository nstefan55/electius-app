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

  it("both send endpoints share one limiter window", () => {
    // Same action = same Upstash prefix — alternating endpoints can't
    // double the 3/15-min send budget.
    expect(RATE_LIMIT_RULES["/email-otp/send-verification-otp"].action).toBe(
      RATE_LIMIT_RULES["/send-verification-email"].action,
    );
  });
});
