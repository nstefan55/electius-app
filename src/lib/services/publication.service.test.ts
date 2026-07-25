import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    election: { findUnique: vi.fn() },
    voter: { updateMany: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("@/lib/services/token.service", () => ({
  mintTokensForPendingVoters: vi.fn(),
  mintTokenForVoter: vi.fn(),
  mintTokensForVoters: vi.fn(),
  tokenExpiry: vi.fn(),
}));
vi.mock("@/lib/services/email.service", () => ({
  sendInvitationEmails: vi.fn(),
}));

const { prisma } = await import("@/lib/prisma");
const {
  mintTokensForPendingVoters,
  mintTokenForVoter,
  mintTokensForVoters,
  tokenExpiry,
} = await import("@/lib/services/token.service");
const { sendInvitationEmails } = await import("@/lib/services/email.service");
const {
  chunk,
  publishElection,
  resendVoterLink,
  partitionReminderTargets,
  getReminderTargets,
  sendReminders,
  CHUNK_SIZE,
} = await import("@/lib/services/publication.service");

// Far enough out that nothing is expired unless a test says so.
const FUTURE = new Date("2030-01-01T00:00:00Z");

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
  vi.mocked(prisma.voter.findMany).mockReset();
  vi.mocked(prisma.voter.findMany).mockResolvedValue([]);
  vi.mocked(mintTokensForPendingVoters).mockReset();
  vi.mocked(mintTokenForVoter).mockReset();
  vi.mocked(mintTokensForVoters).mockReset();
  vi.mocked(mintTokensForVoters).mockResolvedValue([]);
  vi.mocked(tokenExpiry).mockReset();
  vi.mocked(tokenExpiry).mockReturnValue(FUTURE);
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

describe("partitionReminderTargets", () => {
  const now = new Date("2026-07-25T12:00:00Z");
  const live = { expiresAt: new Date("2026-07-30T00:00:00Z") };
  const dead = { expiresAt: new Date("2026-07-20T00:00:00Z") };

  it("splits voted / expired / reachable", () => {
    const result = partitionReminderTargets(
      [
        { id: "a", status: "INVITED", token: live },
        { id: "b", status: "VOTED", token: live },
        { id: "c", status: "INVITED", token: dead },
        { id: "d", status: "PENDING", token: null },
      ],
      now,
      false,
    );

    // PENDING (never emailed) and INVITED (emailed, not voted) both qualify.
    expect(result).toEqual({
      recipients: ["a", "d"],
      alreadyVoted: 1,
      expired: 1,
    });
  });

  it("counts a token expiring exactly now as expired", () => {
    const result = partitionReminderTargets(
      [{ id: "a", status: "INVITED", token: { expiresAt: now } }],
      now,
      false,
    );
    expect(result).toEqual({ recipients: [], alreadyVoted: 0, expired: 1 });
  });

  it("reaches nobody once the voting window is over — a fresh token would be born expired", () => {
    const result = partitionReminderTargets(
      [
        { id: "a", status: "INVITED", token: live },
        { id: "b", status: "PENDING", token: null },
        { id: "c", status: "VOTED", token: live },
      ],
      now,
      true,
    );
    expect(result).toEqual({ recipients: [], alreadyVoted: 1, expired: 2 });
  });

  it("returns empty for an election with no voters", () => {
    expect(partitionReminderTargets([], now, false)).toEqual({
      recipients: [],
      alreadyVoted: 0,
      expired: 0,
    });
  });
});

describe("getReminderTargets", () => {
  it("reads every voter of the election with its token expiry", async () => {
    vi.mocked(prisma.voter.findMany).mockResolvedValue([]);

    await getReminderTargets("el_1");

    expect(prisma.voter.findMany).toHaveBeenCalledWith({
      where: { electionId: "el_1" },
      select: { id: true, status: true, token: { select: { expiresAt: true } } },
    });
  });

  it("treats a past election-derived expiry as window-over", async () => {
    vi.mocked(tokenExpiry).mockReturnValue(new Date("2000-01-01T00:00:00Z"));
    vi.mocked(prisma.voter.findMany).mockResolvedValue([
      { id: "a", status: "INVITED", token: null },
    ]);

    const result = await getReminderTargets("el_1");

    expect(result).toEqual({ recipients: [], alreadyVoted: 0, expired: 1 });
  });

  it("returns empty for an unknown election", async () => {
    vi.mocked(prisma.election.findUnique).mockResolvedValue(null);

    const result = await getReminderTargets("nope");

    expect(result).toEqual({ recipients: [], alreadyVoted: 0, expired: 0 });
    expect(prisma.voter.findMany).not.toHaveBeenCalled();
  });
});

describe("sendReminders", () => {
  it("re-mints for exactly the reachable voters, then sends", async () => {
    vi.mocked(prisma.voter.findMany).mockResolvedValue([
      { id: "a", status: "INVITED", token: { expiresAt: FUTURE } },
      { id: "b", status: "VOTED", token: { expiresAt: FUTURE } },
      { id: "c", status: "PENDING", token: null },
    ]);
    vi.mocked(mintTokensForVoters).mockResolvedValue([
      mintedVoter(1),
      mintedVoter(2),
    ]);

    const result = await sendReminders("el_1");

    // Re-mint is forced: raw tokens are unrecoverable, so the reminder must
    // carry a new link (and the old one dies).
    expect(mintTokensForVoters).toHaveBeenCalledWith("el_1", ["a", "c"]);
    expect(sendInvitationEmails).toHaveBeenCalledWith(
      [mintedVoter(1), mintedVoter(2)],
      { title: "Studentski izbori", organizationName: "VVG" },
    );
    expect(result).toEqual({ sent: 2, failed: 0 });
  });

  it("sends nothing when everyone has voted", async () => {
    vi.mocked(prisma.voter.findMany).mockResolvedValue([
      { id: "a", status: "VOTED", token: { expiresAt: FUTURE } },
    ]);

    const result = await sendReminders("el_1");

    expect(mintTokensForVoters).toHaveBeenCalledWith("el_1", []);
    expect(sendInvitationEmails).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, failed: 0 });
  });

  it("flips reminded voters to INVITED so a PENDING one stops looking unsent", async () => {
    vi.mocked(prisma.voter.findMany).mockResolvedValue([
      { id: "c", status: "PENDING", token: null },
    ]);
    vi.mocked(mintTokensForVoters).mockResolvedValue([mintedVoter(3)]);

    await sendReminders("el_1");

    expect(prisma.voter.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["v3"] } },
      data: { status: "INVITED" },
    });
  });

  it("counts a failed chunk as failed instead of throwing", async () => {
    vi.mocked(prisma.voter.findMany).mockResolvedValue([
      { id: "a", status: "INVITED", token: { expiresAt: FUTURE } },
    ]);
    vi.mocked(mintTokensForVoters).mockResolvedValue([mintedVoter(1)]);
    vi.mocked(sendInvitationEmails).mockRejectedValue(new Error("resend: boom"));

    const result = await sendReminders("el_1");

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(prisma.voter.updateMany).not.toHaveBeenCalled();
  });
});
