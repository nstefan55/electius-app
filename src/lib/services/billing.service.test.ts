import { beforeEach, describe, expect, it, vi } from "vitest";

// delete i deleteMany su namjerno u mocku iako ih servis ne smije zvati: mock
// bez njih bi pao s "not a function", što dokazuje samo da metoda ne postoji.
// Ovako se tvrdi namjera — pečat arhive NIKAD ne briše redak.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    archive: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

const { prisma } = await import("@/lib/prisma");
const { projectEntitlement, stampArchiveRetention } = await import(
  "@/lib/services/billing.service"
);

const ORG = "org_electius";
const CUSTOMER = "cus_123";
const SUB = "sub_123";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.mocked(prisma.user.updateMany).mockReturnValue("user.updateMany" as never);
  vi.mocked(prisma.archive.update).mockReturnValue("archive.update" as never);
  vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
});

/** Argumenti n-tog poziva user.updateMany. */
function updateCall(index: number) {
  return vi.mocked(prisma.user.updateMany).mock.calls[index]![0]!;
}

describe("projectEntitlement", () => {
  it("pravo je organizacijsko: piše po organizationId, nikad po korisniku", async () => {
    await projectEntitlement("complete", ORG, {
      status: "active",
      stripeSubscriptionId: SUB,
      stripeCustomerId: CUSTOMER,
    });

    const isProWrite = updateCall(0);
    expect(isProWrite.where).toEqual({ organizationId: ORG });
    expect(isProWrite.data).toEqual({ isPro: true });
    // Ključanje po korisniku iz sesije bio bi bug nevidljiv do dana kad
    // organizacija dobije drugog administratora.
    expect(JSON.stringify(isProWrite.where)).not.toContain("id\":\"user");
  });

  it("id pretplate ide samo na redak kupca — kolona je @unique", async () => {
    await projectEntitlement("complete", ORG, {
      status: "active",
      stripeSubscriptionId: SUB,
      stripeCustomerId: CUSTOMER,
    });

    const subWrite = updateCall(1);
    expect(subWrite.where).toEqual({
      organizationId: ORG,
      stripeCustomerId: CUSTOMER,
    });
    expect(subWrite.data).toEqual({ stripeSubscriptionId: SUB });
  });

  it("oba upisa idu u JEDNU transakciju", async () => {
    await projectEntitlement("update", ORG, {
      status: "active",
      stripeSubscriptionId: SUB,
      stripeCustomerId: CUSTOMER,
    });

    // isPro true bez id-a pretplate znači subscriptionBlocks false, dakle račun
    // s aktivnom pretplatom postaje obrisiv — zato ne smiju pasti odvojeno.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.$transaction).mock.calls[0]![0]).toHaveLength(2);
  });

  it("canceled: isPro false I stripeSubscriptionId null", async () => {
    await projectEntitlement("deleted", ORG, {
      status: "canceled",
      stripeSubscriptionId: SUB,
      stripeCustomerId: CUSTOMER,
    });

    expect(updateCall(0).data).toEqual({ isPro: false });
    expect(updateCall(1).data).toEqual({ stripeSubscriptionId: null });
  });

  it("trialing i past_due ostaju Pro (faza 1 D5)", async () => {
    for (const status of ["trialing", "past_due"]) {
      vi.clearAllMocks();
      await projectEntitlement("update", ORG, { status, stripeCustomerId: CUSTOMER });
      expect(updateCall(0).data).toEqual({ isPro: true });
    }
  });

  it("nepoznat status ne daje Pro", async () => {
    await projectEntitlement("update", ORG, { status: "paused" });
    expect(updateCall(0).data).toEqual({ isPro: false });
  });

  it("bez stripeCustomerId piše samo isPro — @unique kolona se ne dira naslijepo", async () => {
    await projectEntitlement("update", ORG, { status: "active", stripeSubscriptionId: SUB });

    expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
    expect(updateCall(0).data).toEqual({ isPro: true });
  });

  it("ponovljeni događaj je no-op: isti apsolutni upis, bez čitaj-pa-piši", async () => {
    const event = {
      status: "active",
      stripeSubscriptionId: SUB,
      stripeCustomerId: CUSTOMER,
    };
    await projectEntitlement("update", ORG, event);
    const first = vi.mocked(prisma.user.updateMany).mock.calls.map((c) => c[0]);

    vi.clearAllMocks();
    await projectEntitlement("update", ORG, event);
    const second = vi.mocked(prisma.user.updateMany).mock.calls.map((c) => c[0]);

    expect(second).toEqual(first);
  });
});

describe("stampArchiveRetention", () => {
  const rows = [
    { id: "a1", createdAt: new Date("2027-03-01T10:00:00Z") },
    { id: "a2", createdAt: new Date("2026-08-06T12:00:00Z") },
  ];

  it("cilja samo arhive bez roka, i to unutar organizacije", async () => {
    vi.mocked(prisma.archive.findMany).mockResolvedValue(rows as never);

    await stampArchiveRetention(ORG);

    expect(vi.mocked(prisma.archive.findMany).mock.calls[0]![0]!.where).toEqual({
      expiresAt: null,
      election: { organizationId: ORG },
    });
  });

  it("rok je kalendarska godina od createdAt SVAKOG retka posebno", async () => {
    vi.mocked(prisma.archive.findMany).mockResolvedValue(rows as never);

    await stampArchiveRetention(ORG);

    const calls = vi.mocked(prisma.archive.update).mock.calls;
    expect(calls[0]![0]).toEqual({
      where: { id: "a1" },
      // Prelazak preko 29. veljače 2028: 365 * 24 * 60 * 60 * 1000 ovdje pada
      // na 2028-02-29, kalendarska godina ne.
      data: { expiresAt: new Date("2028-03-01T10:00:00Z") },
    });
    expect(calls[1]![0]).toEqual({
      where: { id: "a2" },
      data: { expiresAt: new Date("2027-08-06T12:00:00Z") },
    });
  });

  it("NIŠTA se ne briše — nema povrata arhive", async () => {
    vi.mocked(prisma.archive.findMany).mockResolvedValue(rows as never);

    await stampArchiveRetention(ORG);

    expect(prisma.archive.delete).not.toHaveBeenCalled();
    expect(prisma.archive.deleteMany).not.toHaveBeenCalled();
    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(prisma.user.deleteMany).not.toHaveBeenCalled();
  });

  it("bez arhiva bez roka: 0, i nijedan upis", async () => {
    vi.mocked(prisma.archive.findMany).mockResolvedValue([] as never);

    await expect(stampArchiveRetention(ORG)).resolves.toBe(0);
    expect(prisma.archive.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
