import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    election: { findUnique: vi.fn() },
    voter: { updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/services/token.service", () => ({
  mintTokensForPendingVoters: vi.fn(),
}));
vi.mock("@/lib/services/email.service", () => ({
  sendInvitationEmails: vi.fn(),
}));

const { prisma } = await import("@/lib/prisma");
const { mintTokensForPendingVoters } = await import(
  "@/lib/services/token.service"
);
const { sendInvitationEmails } = await import("@/lib/services/email.service");
const { chunk, publishElection, CHUNK_SIZE } = await import(
  "@/lib/services/publication.service"
);

const election = {
  title: "Studentski izbori",
  organization: { name: "VVG" },
};

const mintedVoter = (i: number) => ({
  voterId: `v${i}`,
  email: `voter${i}@example.com`,
  firstName: null,
  rawToken: `raw${i}`,
});

beforeEach(() => {
  vi.mocked(prisma.election.findUnique).mockResolvedValue(election);
  vi.mocked(prisma.voter.updateMany).mockReset();
  vi.mocked(prisma.voter.updateMany).mockResolvedValue({ count: 0 });
  vi.mocked(mintTokensForPendingVoters).mockReset();
  vi.mocked(sendInvitationEmails).mockReset();
});

describe("chunk", () => {
  it("splits preserving order, remainder in the last chunk", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns a single chunk when items fit", () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });

  it("returns [] for no items", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it("defaults to the Resend batch limit", () => {
    expect(CHUNK_SIZE).toBe(100);
    const chunks = chunk(Array.from({ length: 250 }, (_, i) => i));
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50]);
  });
});

describe("publishElection", () => {
  it("no-ops on a missing election", async () => {
    vi.mocked(prisma.election.findUnique).mockResolvedValue(null);
    expect(await publishElection("nope")).toEqual({ sent: 0, failed: 0 });
    expect(mintTokensForPendingVoters).not.toHaveBeenCalled();
  });

  it("no-ops when nothing is PENDING (idempotent re-publish)", async () => {
    vi.mocked(mintTokensForPendingVoters).mockResolvedValue([]);
    expect(await publishElection("el_1")).toEqual({ sent: 0, failed: 0 });
    expect(sendInvitationEmails).not.toHaveBeenCalled();
  });

  it("flips only the successful chunk's voters to INVITED", async () => {
    const minted = Array.from({ length: 250 }, (_, i) => mintedVoter(i));
    vi.mocked(mintTokensForPendingVoters).mockResolvedValue(minted);
    // Chunk 2 of 3 fails whole (Resend batch calls are atomic).
    vi.mocked(sendInvitationEmails)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("resend: boom"))
      .mockResolvedValueOnce(undefined);

    const result = await publishElection("el_1");

    expect(result).toEqual({ sent: 150, failed: 100 });
    // INVITED flip ran for chunks 1 and 3 only — chunk 2 voters stay PENDING.
    const updates = vi.mocked(prisma.voter.updateMany).mock.calls;
    expect(updates).toHaveLength(2);
    expect(updates[0][0].where.id.in).toEqual(
      minted.slice(0, 100).map((m) => m.voterId),
    );
    expect(updates[1][0].where.id.in).toEqual(
      minted.slice(200).map((m) => m.voterId),
    );
    expect(updates[0][0].data).toEqual({ status: "INVITED" });
  });

  it("passes election title + org name to the invitation sender", async () => {
    vi.mocked(mintTokensForPendingVoters).mockResolvedValue([mintedVoter(1)]);
    vi.mocked(sendInvitationEmails).mockResolvedValue(undefined);

    await publishElection("el_1");

    expect(sendInvitationEmails).toHaveBeenCalledWith(
      [mintedVoter(1)],
      { title: "Studentski izbori", organizationName: "VVG" },
    );
  });
});
