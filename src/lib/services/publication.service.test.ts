import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    election: { findUnique: vi.fn() },
    voter: { updateMany: vi.fn(), findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/services/token.service", () => ({
  mintTokensForPendingVoters: vi.fn(),
  mintTokenForVoter: vi.fn(),
}));
vi.mock("@/lib/services/email.service", () => ({
  sendInvitationEmails: vi.fn(),
}));

const { prisma } = await import("@/lib/prisma");
const { mintTokensForPendingVoters, mintTokenForVoter } = await import(
  "@/lib/services/token.service"
);
const { sendInvitationEmails } = await import("@/lib/services/email.service");
const { chunk, publishElection, resendVoterLink, CHUNK_SIZE } = await import(
  "@/lib/services/publication.service"
);

const election = {
  status: "ACTIVE",
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
  vi.mocked(prisma.election.findUnique).mockReset();
  vi.mocked(prisma.election.findUnique).mockResolvedValue(election);
  vi.mocked(prisma.voter.updateMany).mockReset();
  vi.mocked(prisma.voter.updateMany).mockResolvedValue({ count: 0 });
  vi.mocked(prisma.voter.findFirst).mockReset();
  vi.mocked(mintTokensForPendingVoters).mockReset();
  vi.mocked(mintTokenForVoter).mockReset();
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

describe("resendVoterLink", () => {
  it("no-ops when the election is missing or not ACTIVE", async () => {
    vi.mocked(prisma.election.findUnique).mockResolvedValueOnce(null);
    await resendVoterLink("nope", "a@example.com");

    vi.mocked(prisma.election.findUnique).mockResolvedValueOnce({
      ...election,
      status: "CLOSED",
    });
    await resendVoterLink("el_1", "a@example.com");

    expect(prisma.voter.findFirst).not.toHaveBeenCalled();
    expect(sendInvitationEmails).not.toHaveBeenCalled();
  });

  it("no-ops silently for unknown emails and VOTED voters (enumeration-safe)", async () => {
    vi.mocked(prisma.voter.findFirst).mockResolvedValue(null);

    await resendVoterLink("el_1", "stranger@example.com");

    // VOTED is excluded in the WHERE itself; the email matches case-insensitively.
    expect(prisma.voter.findFirst).toHaveBeenCalledWith({
      where: {
        electionId: "el_1",
        email: { equals: "stranger@example.com", mode: "insensitive" },
        status: { not: "VOTED" },
      },
      select: { id: true, status: true },
    });
    expect(mintTokenForVoter).not.toHaveBeenCalled();
    expect(sendInvitationEmails).not.toHaveBeenCalled();
  });

  it("re-mints and re-sends for an INVITED voter without touching status", async () => {
    vi.mocked(prisma.voter.findFirst).mockResolvedValue({
      id: "v_1",
      status: "INVITED",
    });
    vi.mocked(mintTokenForVoter).mockResolvedValue(mintedVoter(1));

    await resendVoterLink("el_1", "Voter1@Example.com");

    expect(mintTokenForVoter).toHaveBeenCalledWith("v_1");
    expect(sendInvitationEmails).toHaveBeenCalledWith(
      [mintedVoter(1)],
      { title: "Studentski izbori", organizationName: "VVG" },
    );
    expect(prisma.voter.updateMany).not.toHaveBeenCalled();
  });

  it("flips a PENDING voter to INVITED after a successful send", async () => {
    vi.mocked(prisma.voter.findFirst).mockResolvedValue({
      id: "v_2",
      status: "PENDING",
    });
    vi.mocked(mintTokenForVoter).mockResolvedValue(mintedVoter(2));

    await resendVoterLink("el_1", "voter2@example.com");

    expect(prisma.voter.updateMany).toHaveBeenCalledWith({
      where: { id: "v_2" },
      data: { status: "INVITED" },
    });
  });

  it("does not flip status when the send throws (stays retryable)", async () => {
    vi.mocked(prisma.voter.findFirst).mockResolvedValue({
      id: "v_3",
      status: "PENDING",
    });
    vi.mocked(mintTokenForVoter).mockResolvedValue(mintedVoter(3));
    vi.mocked(sendInvitationEmails).mockRejectedValue(new Error("resend: boom"));

    await expect(resendVoterLink("el_1", "voter3@example.com")).rejects.toThrow();
    expect(prisma.voter.updateMany).not.toHaveBeenCalled();
  });
});
