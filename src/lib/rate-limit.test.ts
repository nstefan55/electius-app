import { describe, expect, it, vi } from "vitest";
import { clientIp, retryAfterSeconds } from "@/lib/rate-limit";

describe("clientIp", () => {
  it("reads the first hop of x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(clientIp(headers)).toBe("1.2.3.4");
  });

  it("falls back to 'unknown' when absent", () => {
    expect(clientIp(new Headers())).toBe("unknown");
    expect(clientIp(undefined)).toBe("unknown");
  });
});

describe("retryAfterSeconds", () => {
  it("rounds up to whole seconds", () => {
    vi.useFakeTimers().setSystemTime(0);
    expect(retryAfterSeconds(2500)).toBe(3);
    vi.useRealTimers();
  });

  it("never returns less than 1", () => {
    vi.useFakeTimers().setSystemTime(10_000);
    expect(retryAfterSeconds(0)).toBe(1);
    vi.useRealTimers();
  });
});
