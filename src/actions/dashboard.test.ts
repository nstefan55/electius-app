import { beforeEach, describe, expect, it, vi } from "vitest";
import { session } from "./session-fixture";

// Dva šava kao i u ostalim testovima akcija: sesija i sloj podataka. Ovdje se
// mocka db modul, a ne Prisma, jer se pinja upravo predaja organizacije dalje.
vi.mock("@/lib/db/elections", () => ({ getElectionTurnout: vi.fn() }));
vi.mock("@/lib/auth/require-session", () => ({ requireSession: vi.fn() }));

const { getElectionTurnout } = await import("@/lib/db/elections");
const { requireSession } = await import("@/lib/auth/require-session");
const { fetchTurnout } = await import("@/actions/dashboard");

beforeEach(() => {
  vi.mocked(requireSession).mockReset().mockResolvedValue(session);
  vi.mocked(getElectionTurnout).mockReset().mockResolvedValue(null);
});

describe("fetchTurnout", () => {
  // Anketa se okida svakih 15 s s klijenta, a jedini podatak koji klijent šalje
  // je id izbora. Organizacija mora doći iz sesije, inače tuđi id vraća brojke.
  it("uz id šalje organizaciju iz sesije", async () => {
    await fetchTurnout("el_1");

    expect(getElectionTurnout).toHaveBeenCalledWith("el_1", "org_1");
  });

  it("na tuđi ili nepostojeći id vraća null, bez iznimke", async () => {
    await expect(fetchTurnout("tudji_el")).resolves.toBeNull();
  });

  // Bez sesije requireSession preusmjerava (baca), pa upit ne smije biti dosežan.
  it("bez sesije ne dolazi do upita", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirect"));

    await expect(fetchTurnout("el_1")).rejects.toThrow();
    expect(getElectionTurnout).not.toHaveBeenCalled();
  });
});
