import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// BILLING_ENABLED se čita pri učitavanju modula, pa svaki slučaj traži svjež
// import — isti obrazac kao urls.test.ts.
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findFirst: vi.fn() } },
}));

const { prisma } = await import("@/lib/prisma");

async function load(flag?: string) {
  vi.resetModules();
  vi.stubEnv("BILLING_ENABLED", flag);
  return import("@/lib/services/entitlement.service");
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("resolveEntitlement", () => {
  it("svima vraća pro dok naplata nije uključena i ne dira bazu", async () => {
    const { resolveEntitlement } = await load(undefined);

    await expect(resolveEntitlement(null, "org_1")).resolves.toEqual({
      kind: "pro",
    });
    // Ako zastavica nije prekidač provođenja, ovaj bi upit postojao.
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("tipfeler u zastavici znači pro, ne free", async () => {
    // Odsutnost i "TRUE" moraju pasti na pravno sigurnu stranu: nikoga ne
    // odbijamo dok naplata nije moguća.
    const { resolveEntitlement } = await load("TRUE");

    await expect(resolveEntitlement(null, "org_1")).resolves.toEqual({
      kind: "pro",
    });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("s uključenom naplatom vraća pro kad organizacija ima Pro administratora", async () => {
    const { resolveEntitlement } = await load("true");
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "u_1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await expect(resolveEntitlement("el_1", "org_1")).resolves.toEqual({
      kind: "pro",
    });
  });

  it("s uključenom naplatom vraća free kad nijedan administrator nije Pro", async () => {
    const { resolveEntitlement } = await load("true");
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    await expect(resolveEntitlement("el_1", "org_1")).resolves.toEqual({
      kind: "free",
    });
  });

  it("pravo traži po organizaciji, ne po korisniku iz sesije", async () => {
    const { resolveEntitlement } = await load("true");
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    await resolveEntitlement("el_1", "org_1");

    // Bez organizationId u WHERE-u pravo bi curilo između organizacija.
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { organizationId: "org_1", isPro: true },
      select: { id: true },
    });
  });
});
