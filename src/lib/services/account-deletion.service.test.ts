import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), count: vi.fn() },
    election: { findMany: vi.fn(), deleteMany: vi.fn() },
    voter: { count: vi.fn() },
    vote: { count: vi.fn(), deleteMany: vi.fn() },
    archive: { count: vi.fn(), deleteMany: vi.fn() },
    organization: { delete: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/services/storage.service", () => ({
  deleteObject: vi.fn(),
  keyFromUrl: vi.fn(),
}));

const { prisma } = await import("@/lib/prisma");
const { deleteObject, keyFromUrl } = await import(
  "@/lib/services/storage.service"
);
const {
  DeleteAccountError,
  purgeAvatar,
  purgeOrganizationData,
  subscriptionBlocks,
} = await import("@/lib/services/account-deletion.service");

const R2_BASE = "https://files.electius.com/";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  // Naš URL → ključ; sve ostalo (npr. Google avatar) nije iz naše kante.
  vi.mocked(keyFromUrl).mockImplementation((url: string) =>
    url.startsWith(R2_BASE) ? url.slice(R2_BASE.length) : null,
  );
  // Tagirani povratci: transakcijski niz se čita doslovno, pa se redoslijed
  // koraka može tvrditi, a ne samo njihov broj.
  vi.mocked(prisma.archive.deleteMany).mockReturnValue("archive.deleteMany" as never);
  vi.mocked(prisma.vote.deleteMany).mockReturnValue("vote.deleteMany" as never);
  vi.mocked(prisma.election.deleteMany).mockReturnValue(
    "election.deleteMany" as never,
  );
  vi.mocked(prisma.organization.delete).mockReturnValue(
    "organization.delete" as never,
  );
  vi.mocked(prisma.user.count).mockResolvedValue(0);
  vi.mocked(prisma.election.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.voter.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.vote.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.archive.count).mockResolvedValue(0 as never);
});

function mockUser(over: Record<string, unknown> = {}) {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    isPro: false,
    stripeSubscriptionId: null,
    organizationId: "org1",
    organization: { logoUrl: null },
    ...over,
  } as never);
}

describe("subscriptionBlocks", () => {
  it("blocks only when Pro AND a subscription id are both present", () => {
    expect(subscriptionBlocks({ isPro: true, stripeSubscriptionId: "sub_1" })).toBe(
      true,
    );
    // Pro bez pretplate (ručno postavljen flag) ne smije zaključati brisanje —
    // nema što otkazati, a račun bi ostao neizbrisiv.
    expect(subscriptionBlocks({ isPro: true, stripeSubscriptionId: null })).toBe(
      false,
    );
    // Otkazana pretplata ostavlja id, ali isPro pada na false.
    expect(
      subscriptionBlocks({ isPro: false, stripeSubscriptionId: "sub_1" }),
    ).toBe(false);
    expect(subscriptionBlocks({ isPro: false, stripeSubscriptionId: null })).toBe(
      false,
    );
  });
});

describe("purgeOrganizationData", () => {
  it("refuses an active subscription and writes nothing", async () => {
    mockUser({ isPro: true, stripeSubscriptionId: "sub_1" });

    await expect(purgeOrganizationData("u1")).rejects.toMatchObject({
      code: "subscriptionActive",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("refuses an organization with another admin and writes nothing", async () => {
    mockUser();
    vi.mocked(prisma.user.count).mockResolvedValue(1);

    await expect(purgeOrganizationData("u1")).rejects.toBeInstanceOf(
      DeleteAccountError,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("counts only OTHER admins in the shared-organization guard", async () => {
    mockUser();
    await purgeOrganizationData("u1");

    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { organizationId: "org1", id: { not: "u1" } },
    });
  });

  it("deletes archives and votes before elections and the organization, in one transaction", async () => {
    mockUser();
    vi.mocked(prisma.election.findMany).mockResolvedValue([
      { id: "e1", reportKey: null },
      { id: "e2", reportKey: null },
    ] as never);

    await purgeOrganizationData("u1");

    // Archive i Vote nemaju kaskadu (anonimnost/integritet) — moraju prvi.
    expect(prisma.archive.deleteMany).toHaveBeenCalledWith({
      where: { electionId: { in: ["e1", "e2"] } },
    });
    expect(prisma.vote.deleteMany).toHaveBeenCalledWith({
      where: { electionId: { in: ["e1", "e2"] } },
    });
    expect(prisma.organization.delete).toHaveBeenCalledWith({
      where: { id: "org1" },
    });
    // Jedna transakcija, i redoslijed koraka JE ispravnost: Prisma izvršava
    // niz onim redom kojim je složen, ne redom poziva.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.$transaction).mock.calls[0][0]).toEqual([
      "archive.deleteMany",
      "vote.deleteMany",
      "election.deleteMany",
      "organization.delete",
    ]);
  });

  it("removes stored reports and the logo after the commit, never the avatar", async () => {
    mockUser({ organization: { logoUrl: `${R2_BASE}logos/org1/a.png` } });
    vi.mocked(prisma.election.findMany).mockResolvedValue([
      { id: "e1", reportKey: "reports/e1.pdf" },
      { id: "e2", reportKey: null },
    ] as never);

    await purgeOrganizationData("u1");

    expect(deleteObject).toHaveBeenCalledWith("private", "reports/e1.pdf");
    expect(deleteObject).toHaveBeenCalledWith("public", "logos/org1/a.png");
    // Avatar pripada korisniku, koji u ovom trenutku još postoji — briše ga
    // afterDelete preko purgeAvatar.
    expect(deleteObject).toHaveBeenCalledTimes(2);
  });

  it("survives an R2 failure — erasure already committed, so it cannot report failure", async () => {
    mockUser();
    vi.mocked(prisma.election.findMany).mockResolvedValue([
      { id: "e1", reportKey: "reports/e1.pdf" },
    ] as never);
    vi.mocked(deleteObject).mockRejectedValue(new Error("R2 down"));

    await expect(purgeOrganizationData("u1")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled(); // glasno, nikad progutano
  });

  it("no-ops for an account with no organization", async () => {
    mockUser({ organizationId: null, organization: null });

    await purgeOrganizationData("u1");

    expect(prisma.user.count).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("logs ids and counts before erasing — never names or emails", async () => {
    mockUser();
    vi.mocked(prisma.election.findMany).mockResolvedValue([
      { id: "e1", reportKey: null },
    ] as never);
    vi.mocked(prisma.voter.count).mockResolvedValue(12 as never);
    vi.mocked(prisma.vote.count).mockResolvedValue(9 as never);
    vi.mocked(prisma.archive.count).mockResolvedValue(1 as never);

    await purgeOrganizationData("u1");

    const [, payload] = vi.mocked(console.info).mock.calls[0];
    expect(payload).toMatchObject({
      userId: "u1",
      organizationId: "org1",
      elections: 1,
      voters: 12,
      votes: 9,
      archives: 1,
    });
    expect(JSON.stringify(payload)).not.toMatch(/@/); // bez osobnih podataka
  });
});

describe("purgeAvatar", () => {
  it("deletes an avatar stored in our public bucket", async () => {
    await purgeAvatar(`${R2_BASE}avatars/u1/a.png`);
    expect(deleteObject).toHaveBeenCalledWith("public", "avatars/u1/a.png");
  });

  it("ignores a foreign URL (Google) and a missing image", async () => {
    await purgeAvatar("https://lh3.googleusercontent.com/a/abc");
    await purgeAvatar(null);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("ignores an unconfigured bucket instead of blocking the deletion", async () => {
    vi.mocked(keyFromUrl).mockImplementation(() => {
      throw new Error("Missing R2_PUBLIC_URL");
    });
    await expect(purgeAvatar(`${R2_BASE}avatars/u1/a.png`)).resolves.toBeUndefined();
  });
});
