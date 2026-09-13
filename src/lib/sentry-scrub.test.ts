import { describe, expect, it } from "vitest";
import { redactSentryUrl, scrubEvent } from "./sentry-scrub";

// Ista obveza kao analytics.test.ts, samo je ovdje cijena veca: Sentry po
// zadanome salje tijela, kolacice, zaglavlja i query parametre, a token nam je
// i u putanji. Sve sto ovdje pukne znaci da sirovi glasacki token moze otici
// trecem pruzatelju — invarijanta #2.

describe("redactSentryUrl", () => {
  it("redigira token iz putanje glasackog listica, ali zadrzava rutu", () => {
    expect(redactSentryUrl("/hr/vote/RAWT0KEN_abc123")).toBe(
      "/hr/vote/[redacted]",
    );
    // Greska na listicu je upravo ono sto zelimo vidjeti — zato redakcija, a
    // ne odbacivanje kao u analytics.ts.
    expect(redactSentryUrl("/hr/vote/RAWT0KEN_abc123")).toContain("vote");
  });

  it("redigira i QR ulaz (segment je token ILI id izbora, ne zna se)", () => {
    expect(redactSentryUrl("/en/vote/clx123election")).toBe(
      "/en/vote/[redacted]",
    );
  });

  it("NE dira /voters — to je admin ruta", () => {
    expect(redactSentryUrl("/hr/voters")).toBe("/hr/voters");
    expect(redactSentryUrl("/hr/elections/abc/voters")).toBe(
      "/hr/elections/abc/voters",
    );
  });

  it("odbacuje svaki query parametar (allowlist je prazna)", () => {
    expect(redactSentryUrl("/hr/reset-password?token=secret")).toBe(
      "/hr/reset-password",
    );
    expect(redactSentryUrl("/hr/confirm-deletion?token=secret")).toBe(
      "/hr/confirm-deletion",
    );
    // Cak i bezopasan parametar pada: jedno pravilo, bez popisa za pamcenje.
    expect(redactSentryUrl("/hr/elections?page=3")).toBe("/hr/elections");
  });

  it("radi i na apsolutnom URL-u i cisti fragment", () => {
    expect(redactSentryUrl("https://electius.com/hr/vote/tok#frag")).toBe(
      "https://electius.com/hr/vote/[redacted]",
    );
  });

  it("na neraspoznatljiv ulaz vraca [redacted], ne prosljeduje ga", () => {
    // Uz bazni URL malo sto baca; ovo su stvarni primjeri koji bacaju.
    expect(redactSentryUrl("http://")).toBe("[redacted]");
    expect(redactSentryUrl("//")).toBe("[redacted]");
  });
});

describe("scrubEvent", () => {
  it("brise tijelo zahtjeva — POST /api/vote nosi sirovi token", () => {
    const event = scrubEvent({
      request: {
        url: "https://electius.com/api/vote",
        data: { token: "RAWT0KEN", optionIds: ["a"] },
      },
    });
    expect(event.request?.data).toBeUndefined();
  });

  it("brise kolacice, query_string i osjetljiva zaglavlja", () => {
    const event = scrubEvent({
      request: {
        cookies: { "better-auth.session_token": "live" },
        query_string: "token=secret",
        headers: {
          cookie: "live",
          authorization: "Bearer x",
          "x-forwarded-for": "1.2.3.4",
          "user-agent": "Firefox",
        },
      },
    });
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.query_string).toBeUndefined();
    expect(Object.keys(event.request!.headers!)).toEqual(["user-agent"]);
  });

  it("cisti i navigacijske mrvice (isti token, drugi put)", () => {
    const event = scrubEvent({
      breadcrumbs: [
        { data: { from: "/hr/vote/RAWT0KEN", to: "/hr/vote/RAWT0KEN?x=1" } },
        { data: { url: "/hr/reset-password?token=secret" } },
        {},
      ],
    });
    expect(event.breadcrumbs?.[0].data).toEqual({
      from: "/hr/vote/[redacted]",
      to: "/hr/vote/[redacted]",
    });
    expect(event.breadcrumbs?.[1].data?.url).toBe("/hr/reset-password");
  });

  it("nijedan sirovi token ne prezivi serijalizaciju cijelog dogadaja", () => {
    const event = scrubEvent({
      request: {
        url: "/hr/vote/RAWT0KEN_canary?token=RAWT0KEN_canary",
        data: { token: "RAWT0KEN_canary" },
        cookies: { s: "RAWT0KEN_canary" },
        headers: { cookie: "RAWT0KEN_canary" },
      },
      breadcrumbs: [{ data: { url: "/hr/vote/RAWT0KEN_canary" } }],
    });
    expect(JSON.stringify(event)).not.toContain("RAWT0KEN_canary");
  });
});
