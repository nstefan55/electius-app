import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { redactAnalyticsUrl } from "./analytics";

describe("redactAnalyticsUrl — glasačka ruta", () => {
  it("odbacuje /vote/<token> u oba jezika", () => {
    expect(redactAnalyticsUrl("/hr/vote/AbC123rawtoken")).toBeNull();
    expect(redactAnalyticsUrl("/en/vote/AbC123rawtoken")).toBeNull();
  });

  it("odbacuje i apsolutni oblik s query stringom", () => {
    expect(
      redactAnalyticsUrl("https://electius.com/hr/vote/tok?x=1"),
    ).toBeNull();
  });

  it("odbacuje QR ulaz (segment je id izbora, ne token)", () => {
    expect(redactAnalyticsUrl("/hr/vote/clx0000election")).toBeNull();
  });

  it("NE odbacuje admin rutu /voters — 'vote' mora završiti na / ili kraju", () => {
    expect(redactAnalyticsUrl("/hr/voters")).toBe("/hr/voters");
    expect(redactAnalyticsUrl("/hr/elections/clx1/voters")).toBe(
      "/hr/elections/clx1/voters",
    );
  });
});

describe("redactAnalyticsUrl — tokeni u query stringu", () => {
  it("skida ?token= s reset-password", () => {
    expect(redactAnalyticsUrl("/hr/reset-password?token=secret")).toBe(
      "/hr/reset-password",
    );
  });

  it("skida ?token= s confirm-deletion", () => {
    expect(redactAnalyticsUrl("/en/confirm-deletion?token=secret")).toBe(
      "/en/confirm-deletion",
    );
  });

  it("allowlist: nepoznat parametar otpada i bez da ga itko nabroji", () => {
    expect(redactAnalyticsUrl("/hr/home?sessionId=abc&nesto=1")).toBe(
      "/hr/home",
    );
  });

  it("zadržava utm_* — atribucija je razlog uvođenja analitike", () => {
    expect(
      redactAnalyticsUrl("/hr?utm_source=ph&utm_medium=launch&token=secret"),
    ).toBe("/hr?utm_source=ph&utm_medium=launch");
  });

  it("odbacuje fragment", () => {
    expect(redactAnalyticsUrl("/hr/privacy#f-kolacici")).toBe("/hr/privacy");
  });

  // Relativna grana vraca pathname+search pa fragment ionako otpada; jedino
  // apsolutni URL kroz url.toString() dokazuje da ga bas skidamo.
  it("odbacuje fragment i na apsolutnom URL-u", () => {
    expect(
      redactAnalyticsUrl("https://electius.com/hr/privacy?token=x#tajna"),
    ).toBe("https://electius.com/hr/privacy");
  });
});

describe("redactAnalyticsUrl — oblik i rubni slučajevi", () => {
  it("čuva apsolutni URL kao apsolutan", () => {
    expect(redactAnalyticsUrl("https://electius.com/hr/terms?token=x")).toBe(
      "https://electius.com/hr/terms",
    );
  });

  it("neispravan URL se odbacuje, ne propušta", () => {
    expect(redactAnalyticsUrl("http://[")).toBeNull();
  });
});

// Ugovorni test nad tekstom, kao locale-cookie.test.ts: paket je instaliran, pa
// /privacy VIŠE NE SMIJE tvrditi da analitike nema. Nijedan drugi alat to ne vidi
// — tsc, lint i build ne čitaju pravni tekst, a tvrdnja je objavljena.
describe("/privacy se slaže s onim što je instalirano", () => {
  const installed = "@vercel/analytics" in
    (JSON.parse(readFileSync("package.json", "utf8")).dependencies ?? {});

  for (const locale of ["hr", "en"] as const) {
    it(`${locale}: ne tvrdi da analitike nema`, () => {
      expect(installed).toBe(true);
      const raw = readFileSync(`messages/${locale}.json`, "utf8");
      const not = JSON.parse(raw).legal.privacy.s.collect.not as string[];
      expect(not.join(" ")).not.toMatch(/Vercel Analytics/i);
      expect(not.join(" ")).not.toMatch(
        /no analytics of any kind|nikakve analitike/i,
      );
    });
  }
});
