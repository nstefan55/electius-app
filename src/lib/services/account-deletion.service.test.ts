import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), count: vi.fn() },
    election: { findMany: vi.fn(), deleteMany: vi.fn() },
    voter: { count: vi.fn() },
    vote: { count: vi.fn(), deleteMany: vi.fn() },
    archive: { count: vi.fn(), deleteMany: vi.fn() },
    organization: { delete: vi.fn() },
    subscription: { findFirst: vi.fn() },
    verificationToken: { findFirst: vi.fn(), deleteMany: vi.fn() },
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
  DELETE_TOKEN_PREFIX,
  DeleteAccountError,
  deletionGate,
  hasPendingDeletionRequest,
  purgeAvatar,
  purgeOrganizationData,
  revokeDeletionRequests,
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
  vi.mocked(prisma.subscription.findFirst).mockResolvedValue(null as never);
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

const ENDS = new Date("2026-09-04T10:00:00Z");
const PRO = { isPro: true, stripeSubscriptionId: "sub_1" };
const WILL_BILL = { cancelAtPeriodEnd: false, cancelAt: null };
const CANCELING = { cancelAtPeriodEnd: false, cancelAt: ENDS };

describe("subscriptionBlocks", () => {
  it("does not block a Free account, whatever the row says", () => {
    // Pro bez pretplate (ručno postavljen flag) ne smije zaključati brisanje —
    // nema što otkazati, a račun bi ostao neizbrisiv.
    expect(
      subscriptionBlocks({ isPro: true, stripeSubscriptionId: null }, WILL_BILL),
    ).toBe(false);
    // Otkazana pretplata ostavlja id, ali isPro pada na false.
    expect(
      subscriptionBlocks({ isPro: false, stripeSubscriptionId: "sub_1" }, WILL_BILL),
    ).toBe(false);
    expect(
      subscriptionBlocks({ isPro: false, stripeSubscriptionId: null }, null),
    ).toBe(false);
  });

  it("missing row blocks — we do not know, so we assume it bills", () => {
    // Prozor između povratka s Checkouta i dolaska webhooka. Konzervativna
    // strana je jedina ispravna: pustiti brisanje na nepoznatom stanju znači
    // ostaviti Stripeu pretplatu koja naplaćuje nepostojeći račun.
    expect(subscriptionBlocks(PRO, null)).toBe(true);
  });

  it("blocks while the subscription will bill again", () => {
    expect(subscriptionBlocks(PRO, WILL_BILL)).toBe(true);
  });

  it("does not block once Stripe has been told to end it", () => {
    // Oba oblika: probno razdoblje (cancelAt) i plaćeni plan (cancelAtPeriodEnd).
    expect(subscriptionBlocks(PRO, CANCELING)).toBe(false);
    expect(
      subscriptionBlocks(PRO, { cancelAtPeriodEnd: true, cancelAt: null }),
    ).toBe(false);
  });
});

describe("deletionGate", () => {
  it("opens for a Free account without touching prisma.subscription", async () => {
    await expect(
      deletionGate({ isPro: false, stripeSubscriptionId: null }),
    ).resolves.toEqual({ kind: "open" });
    await expect(
      deletionGate({ isPro: true, stripeSubscriptionId: null }),
    ).resolves.toEqual({ kind: "open" });
    expect(prisma.subscription.findFirst).not.toHaveBeenCalled();
  });

  it("looks the row up by stripeSubscriptionId, never by referenceId", async () => {
    // Ta dva upita znaju vratiti RAZLIČITE retke: otkazana godišnja uz novu
    // mjesečnu daje po periodEnd DESC onu otkazanu, pa bi kartica nudila gumb
    // koji poslužitelj odbija.
    await deletionGate(PRO);

    expect(prisma.subscription.findFirst).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: "sub_1" },
      select: { cancelAtPeriodEnd: true, cancelAt: true, periodEnd: true },
    });
  });

  it("blocks when the row is missing", async () => {
    await expect(deletionGate(PRO)).resolves.toEqual({ kind: "blocked" });
  });

  it("blocks while the subscription will bill again", async () => {
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue({
      ...WILL_BILL,
      periodEnd: ENDS,
    } as never);

    await expect(deletionGate(PRO)).resolves.toEqual({ kind: "blocked" });
  });

  it("ends at cancelAt when Stripe set one (trial shape)", async () => {
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue({
      ...CANCELING,
      periodEnd: new Date("2027-01-01T00:00:00Z"),
    } as never);

    // cancelAt pobjeđuje: mjerodavan je stvarni kraj, ne sljedeća obnova.
    await expect(deletionGate(PRO)).resolves.toEqual({
      kind: "ending",
      endsAt: ENDS,
    });
  });

  it("falls back to periodEnd when only cancelAtPeriodEnd is set", async () => {
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue({
      cancelAtPeriodEnd: true,
      cancelAt: null,
      periodEnd: ENDS,
    } as never);

    await expect(deletionGate(PRO)).resolves.toEqual({
      kind: "ending",
      endsAt: ENDS,
    });
  });

  it("ends with a null date rather than inventing one", async () => {
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue({
      cancelAtPeriodEnd: true,
      cancelAt: null,
      periodEnd: null,
    } as never);

    // Kartica tada ispisuje rečenicu bez datuma (endingNoteNoDate).
    await expect(deletionGate(PRO)).resolves.toEqual({
      kind: "ending",
      endsAt: null,
    });
  });
});

describe("hasPendingDeletionRequest", () => {
  it("asks for this user's own unexpired delete-account row", async () => {
    vi.mocked(prisma.verificationToken.findFirst).mockResolvedValue(null as never);

    await hasPendingDeletionRequest("u1");

    const [args] = vi.mocked(prisma.verificationToken.findFirst).mock.calls[0];
    // value = userId je BetterAuthov upis; tuđi zahtjev je neizreciv.
    expect(args?.where?.value).toBe("u1");
    expect(args?.where?.identifier).toEqual({ startsWith: DELETE_TOKEN_PREFIX });
    // Istekli token više ništa ne otključava — kartica bi inače zauvijek
    // pokazivala "pending" i sakrila gumb za brisanje.
    expect(args?.where?.expiresAt).toMatchObject({ gt: expect.any(Date) });
  });

  it("is true only when a row comes back", async () => {
    vi.mocked(prisma.verificationToken.findFirst).mockResolvedValue({
      id: "v1",
    } as never);
    await expect(hasPendingDeletionRequest("u1")).resolves.toBe(true);

    vi.mocked(prisma.verificationToken.findFirst).mockResolvedValue(null as never);
    await expect(hasPendingDeletionRequest("u1")).resolves.toBe(false);
  });
});

describe("revokeDeletionRequests", () => {
  it("deletes only this user's delete-account rows, expired ones included", async () => {
    vi.mocked(prisma.verificationToken.deleteMany).mockResolvedValue({
      count: 2,
    } as never);

    await expect(revokeDeletionRequests("u1")).resolves.toBe(2);

    const [args] = vi.mocked(prisma.verificationToken.deleteMany).mock.calls[0];
    expect(args?.where?.value).toBe("u1");
    // Prefiks čuva reset-password:* retke, koji također nose value = userId.
    expect(args?.where?.identifier).toEqual({ startsWith: DELETE_TOKEN_PREFIX });
    // Bez expiresAt: pomesti mrtav token ne košta ništa.
    expect(args?.where).not.toHaveProperty("expiresAt");
  });
});

describe("purgeOrganizationData", () => {
  it("refuses a subscription that will bill again and writes nothing", async () => {
    mockUser({ isPro: true, stripeSubscriptionId: "sub_1" });
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue({
      ...WILL_BILL,
      periodEnd: ENDS,
    } as never);

    await expect(purgeOrganizationData("u1")).rejects.toMatchObject({
      code: "subscriptionActive",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("refuses when the subscription row is missing", async () => {
    mockUser({ isPro: true, stripeSubscriptionId: "sub_1" });
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue(null as never);

    await expect(purgeOrganizationData("u1")).rejects.toMatchObject({
      code: "subscriptionActive",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("lets a canceling subscription through — this is the bug being fixed", async () => {
    // Portal je otkazao pretplatu: status je i dalje trialing/active i isPro je
    // i dalje true, ali naplate više neće biti, pa nema što braniti. Prije ovoga
    // je račun ostajao neizbrisiv do kraja razdoblja (do godinu dana).
    mockUser({ isPro: true, stripeSubscriptionId: "sub_1" });
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue({
      ...CANCELING,
      periodEnd: ENDS,
    } as never);

    await expect(purgeOrganizationData("u1")).resolves.toBeUndefined();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
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
