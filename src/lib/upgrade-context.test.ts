import { describe, expect, it } from "vitest";
import {
  UPGRADE_FEATURES,
  upgradeContextKey,
  upgradeHref,
} from "@/lib/upgrade-context";

// Preslikavanje ?feature= → ključ kataloga (pro-features-gating §5). Cijela
// vrijednost ovog modula je u tome što se NE ruši na nepoznat parametar:
// poveznica se zalijepi, zapamti i prepisuje rukom, a odredište kupnje koje
// baci 500 na tipfeler gore je od generičkog zaglavlja.
describe("upgradeContextKey", () => {
  it("svaki od pet parametara vraća vlastiti ključ", () => {
    for (const feature of UPGRADE_FEATURES) {
      expect(upgradeContextKey(feature)).toBe(feature);
    }
  });

  it("nepoznat parametar pada na generičko zaglavlje", () => {
    expect(upgradeContextKey("liveresults")).toBe("generic"); // krivi case
    expect(upgradeContextKey("prioritySupport")).toBe("generic");
    expect(upgradeContextKey("")).toBe("generic");
  });

  it("odsutan parametar pada na generičko zaglavlje", () => {
    expect(upgradeContextKey(undefined)).toBe("generic");
  });

  it("ponovljeni parametar (polje) je smeće, ne namjera", () => {
    // ?feature=voterCap&feature=liveResults stiže kao polje. Uzeti prvi član
    // znači pustiti da URL bira zaglavlje na nedefiniran način.
    expect(upgradeContextKey(["voterCap", "liveResults"])).toBe("generic");
    expect(upgradeContextKey([])).toBe("generic");
  });

  it("ne nasljeđuje ništa s prototipa Objecta", () => {
    // `includes` nad poljem, ne `key in map` — inače bi ?feature=constructor
    // prošao kao valjan i stranica bi tražila nepostojeći ključ kataloga.
    expect(upgradeContextKey("constructor")).toBe("generic");
    expect(upgradeContextKey("toString")).toBe("generic");
  });
});

describe("upgradeHref", () => {
  it("gradi stazu koju preslikavanje iznad prepoznaje", () => {
    // Ovo je cijela poanta jednog graditelja: parametar koji zaštita pošalje i
    // ključ koji stranica pročita ne mogu se razići.
    for (const feature of UPGRADE_FEATURES) {
      const href = upgradeHref(feature);
      expect(href).toBe(`/upgrade?feature=${feature}`);
      expect(upgradeContextKey(new URL(href, "https://x").searchParams.get("feature") ?? undefined)).toBe(feature);
    }
  });

  it("staza je bez prefiksa lokalizacije — dodaje ga Link", () => {
    expect(upgradeHref("voterCap").startsWith("/upgrade")).toBe(true);
  });
});
