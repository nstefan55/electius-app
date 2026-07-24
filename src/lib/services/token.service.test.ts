import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    election: { findUnique: vi.fn() },
    voter: { findMany: vi.fn() },
    voterToken: { deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

const { prisma } = await import("@/lib/prisma");
const { hashToken, tokenExpiry, mintTokensForPendingVoters } = await import(
  "@/lib/services/token.service"
);

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.mocked(prisma.election.findUnique).mockReset();
  vi.mocked(prisma.voter.findMany).mockReset();
  vi.mocked(prisma.voterToken.deleteMany).mockClear();
  vi.mocked(prisma.voterToken.createMany).mockClear();
});

describe("hashToken", () => {
  it("produces the known SHA-256 hex vector", () => {
    // sha256("test") — standard test vector
    expect(hashToken("test")).toBe(
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    );
  });
});

describe("tokenExpiry", () => {
  const now = new Date("2026-07-24T12:00:00Z");

  it("uses endsAt when the election has a real close date", () => {
    const startsAt = new Date("2026-07-24T00:00:00Z");
    const endsAt = new Date("2026-07-30T00:00:00Z");
    expect(tokenExpiry(startsAt, endsAt, now)).toEqual(endsAt);
  });

  it("falls back to now + 30 days for the wizard placeholder (endsAt <= startsAt)", () => {
    const startsAt = new Date("2026-07-24T00:00:00Z");
    expect(tokenExpiry(startsAt, startsAt, now)).toEqual(
      new Date(now.getTime() + 30 * DAY_MS),
    );
    // endsAt strictly before startsAt (manual start moved startsAt forward)
    expect(
      tokenExpiry(startsAt, new Date("2026-07-01T00:00:00Z"), now),
    ).toEqual(new Date(now.getTime() + 30 * DAY_MS));
  });
});

describe("mintTokensForPendingVoters", () => {
  const election = {
    startsAt: new Date("2026-07-24T00:00:00Z"),
    endsAt: new Date("2026-07-30T00:00:00Z"),
  };
  const voters = [
    { id: "v1", email: "a@example.com", firstName: "Ana" },
    { id: "v2", email: "b@example.com", firstName: null },
  ];

  it("returns [] without touching tokens when the election is missing", async () => {
    vi.mocked(prisma.election.findUnique).mockResolvedValue(null);
    expect(await mintTokensForPendingVoters("nope")).toEqual([]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns [] without a transaction when no voters are PENDING", async () => {
    vi.mocked(prisma.election.findUnique).mockResolvedValue(election);
    vi.mocked(prisma.voter.findMany).mockResolvedValue([]);
    expect(await mintTokensForPendingVoters("el_1")).toEqual([]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("deletes leftover tokens and mints fresh ones for every PENDING voter", async () => {
    vi.mocked(prisma.election.findUnique).mockResolvedValue(election);
    vi.mocked(prisma.voter.findMany).mockResolvedValue(voters);

    const minted = await mintTokensForPendingVoters("el_1");

    // Retry rule: delete + re-mint, keyed on exactly the PENDING voter ids.
    expect(prisma.voterToken.deleteMany).toHaveBeenCalledWith({
      where: { voterId: { in: ["v1", "v2"] } },
    });

    const createArg = vi.mocked(prisma.voterToken.createMany).mock.calls[0][0];
    const rows = createArg.data as {
      hash: string;
      voterId: string;
      electionId: string;
      expiresAt: Date;
    }[];
    expect(rows).toHaveLength(2);
    // Stored hash = SHA-256(raw); expiry follows the rule.
    rows.forEach((row, i) => {
      expect(row.hash).toBe(hashToken(minted[i].rawToken));
      expect(row.electionId).toBe("el_1");
      expect(row.expiresAt).toEqual(election.endsAt);
    });
    // Each raw token is a distinct 256-bit base64url string.
    expect(minted[0].rawToken).not.toBe(minted[1].rawToken);
    expect(minted[0].rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("only PENDING voters are targeted", async () => {
    vi.mocked(prisma.election.findUnique).mockResolvedValue(election);
    vi.mocked(prisma.voter.findMany).mockResolvedValue([]);
    await mintTokensForPendingVoters("el_1");
    expect(prisma.voter.findMany).toHaveBeenCalledWith({
      where: { electionId: "el_1", status: "PENDING" },
      select: { id: true, email: true, firstName: true },
    });
  });

  it("never passes a raw token to Prisma (hash-only storage)", async () => {
    vi.mocked(prisma.election.findUnique).mockResolvedValue(election);
    vi.mocked(prisma.voter.findMany).mockResolvedValue(voters);

    const minted = await mintTokensForPendingVoters("el_1");

    const everyPrismaArg = JSON.stringify([
      vi.mocked(prisma.voterToken.deleteMany).mock.calls,
      vi.mocked(prisma.voterToken.createMany).mock.calls,
      vi.mocked(prisma.election.findUnique).mock.calls,
      vi.mocked(prisma.voter.findMany).mock.calls,
    ]);
    for (const { rawToken } of minted) {
      expect(everyPrismaArg).not.toContain(rawToken);
    }
  });
});
