import { beforeEach, describe, expect, it, vi } from "vitest";

// next/cache je jedini šav: revalidatePath se mocka, ostalo je čista logika.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { revalidatePath } = await import("next/cache");
const { revalidatePublicResults } = await import("@/lib/public-results-cache");
const { LOCALES } = await import("@/i18n/config");

beforeEach(() => {
  vi.mocked(revalidatePath).mockReset();
  // Pad se namjerno bilježi; ovdje bi samo zaprljao izlaz testova.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("revalidatePublicResults", () => {
  it("invalidates the page once per locale, in the route's own path shape", () => {
    revalidatePublicResults("el_1");

    expect(vi.mocked(revalidatePath).mock.calls.map((c) => c[0])).toEqual(
      LOCALES.map((l) => `/${l}/results/el_1`),
    );
  });

  // Ruta je prefiksirana jezikom (localePrefix: "always"), pa se /hr i /en
  // keširaju odvojeno. Tvrdo upisan jedan jezik ostavio bi drugi zastarjelim, i
  // to bez ijedne greške — zato se popis izvodi iz LOCALES, a ne prepisuje.
  it("covers every configured locale, so a second locale cannot be forgotten", () => {
    revalidatePublicResults("el_1");

    expect(revalidatePath).toHaveBeenCalledTimes(LOCALES.length);
    for (const locale of LOCALES) {
      expect(revalidatePath).toHaveBeenCalledWith(`/${locale}/results/el_1`);
    }
  });

  // Posture clearSweepGate: izgubljena invalidacija je slučaj omeđen TTL-om,
  // neuspjelo zatvaranje izbora nije.
  it("swallows a throwing revalidatePath — a mutation must not fail on the cache layer", () => {
    vi.mocked(revalidatePath).mockImplementation(() => {
      throw new Error("cache down");
    });

    expect(() => revalidatePublicResults("el_1")).not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });

  // catch je UNUTAR petlje: inače bi pad na prvom jeziku pojeo sve ostale.
  it("a failure on one locale still invalidates the rest", () => {
    vi.mocked(revalidatePath).mockImplementationOnce(() => {
      throw new Error("cache down");
    });

    revalidatePublicResults("el_1");

    expect(revalidatePath).toHaveBeenCalledTimes(LOCALES.length);
    expect(revalidatePath).toHaveBeenLastCalledWith(
      `/${LOCALES[LOCALES.length - 1]}/results/el_1`,
    );
  });
});
