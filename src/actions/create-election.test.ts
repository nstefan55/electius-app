import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the two seams (DB + session) per the action-test pattern.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    election: { create: vi.fn() },
  },
}));
vi.mock("@/lib/auth/require-session", () => ({
  requireSession: vi.fn(),
}));

const { prisma } = await import("@/lib/prisma");
const { requireSession } = await import("@/lib/auth/require-session");
const { createElection } = await import("@/actions/create-election");

const session = {
  user: {
    email: "admin@example.com",
    name: "A",
    organization: "Org",
    isPro: false,
  },
  organizationId: "org_1",
};

const basePayload = {
  title: "Student council",
  description: "",
  electionType: "STANDARD",
  votingType: "SINGLE_CHOICE",
  allowAbstain: false,
  candidates: [{ name: "Ana" }, { name: "Marko", role: "2nd year" }],
  voters: [
    { name: "Petra Novak", email: "petra@unizg.hr" },
    { name: "Petra Dupe", email: "PETRA@unizg.hr" }, // dupe, case-insensitive
    { name: "Luka", email: "luka@unizg.hr" },
  ],
  startMode: "manual",
  startAt: "",
  closeAt: "2999-06-01T12:00",
  sealedResults: false,
  quorumThreshold: null,
  autoCloseOnDeadline: true,
  adminTurnoutReminder: false,
  voterReminder24h: false,
};

beforeEach(() => {
  vi.mocked(requireSession).mockResolvedValue(session);
  vi.mocked(prisma.user.findUnique)
    .mockReset()
    .mockResolvedValue({ id: "user_1" } as never);
  vi.mocked(prisma.election.create)
    .mockReset()
    .mockResolvedValue({ id: "elc_1" } as never);
});

describe("createElection", () => {
  it("rejects malformed input before touching the session", async () => {
    const result = await createElection({ title: 42 });
    expect(result).toEqual({ success: false, error: "invalid" });
    expect(requireSession).not.toHaveBeenCalled();
  });

  it("enforces the type/method coupling server-side", async () => {
    const result = await createElection({
      ...basePayload,
      electionType: "SURVEY",
      votingType: "SINGLE_CHOICE",
    });
    expect(result).toEqual({ success: false, error: "coupling" });
  });

  it("requires two candidates for a full create but not for a draft", async () => {
    const one = { ...basePayload, candidates: [{ name: "Ana" }] };
    expect(await createElection(one)).toEqual({
      success: false,
      error: "candidates",
    });
    expect(await createElection(one, true)).toEqual({
      success: true,
      data: { id: "elc_1" },
    });
  });

  it("requires a valid window when scheduled: close after start", async () => {
    const result = await createElection({
      ...basePayload,
      startMode: "scheduled",
      startAt: "2999-06-02T12:00",
      closeAt: "2999-06-01T12:00",
    });
    expect(result).toEqual({ success: false, error: "schedule" });
  });

  it("creates DRAFT for manual start, dedupes voters and splits names", async () => {
    const result = await createElection(basePayload);
    expect(result).toEqual({ success: true, data: { id: "elc_1" } });

    const arg = vi.mocked(prisma.election.create).mock.calls[0][0];
    expect(arg.data.status).toBe("DRAFT");
    expect(arg.data.organizationId).toBe("org_1");
    expect(arg.data.createdById).toBe("user_1");
    expect(arg.data.options.create).toEqual([
      { text: "Ana", description: null, orderIndex: 0 },
      { text: "Marko", description: "2nd year", orderIndex: 1 },
    ]);
    // dupe email dropped; "Petra Novak" split into first/last
    expect(arg.data.voters.create).toEqual([
      { email: "petra@unizg.hr", firstName: "Petra", lastName: "Novak" },
      { email: "luka@unizg.hr", firstName: "Luka", lastName: null },
    ]);
  });

  it("creates SCHEDULED with the chosen window when start is scheduled", async () => {
    await createElection({
      ...basePayload,
      startMode: "scheduled",
      startAt: "2999-06-01T09:00",
      closeAt: "2999-06-03T18:00",
    });
    const arg = vi.mocked(prisma.election.create).mock.calls[0][0];
    expect(arg.data.status).toBe("SCHEDULED");
    expect(arg.data.startsAt).toEqual(new Date("2999-06-01T09:00"));
    expect(arg.data.endsAt).toEqual(new Date("2999-06-03T18:00"));
  });

  it("reports failure without leaking the DB error", async () => {
    vi.mocked(prisma.election.create).mockRejectedValue(new Error("db down"));
    expect(await createElection(basePayload)).toEqual({
      success: false,
      error: "failed",
    });
  });
});
