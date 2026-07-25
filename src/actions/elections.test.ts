import { beforeEach, describe, expect, it, vi } from "vitest";

// Same seam-mocking pattern as settings.test.ts: mock prisma + requireSession,
// assert on the mock inputs — never hit the real DB. publication.service is a
// third seam here — the pipeline itself is covered by its own colocated tests.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    election: { updateMany: vi.fn(), findFirst: vi.fn() },
    voter: { count: vi.fn() },
  },
}));
vi.mock("@/lib/auth/require-session", () => ({
  requireSession: vi.fn(),
}));
vi.mock("@/lib/services/publication.service", () => ({
  publishElection: vi.fn(),
  getReminderTargets: vi.fn(),
  sendReminders: vi.fn(),
}));

const { prisma } = await import("@/lib/prisma");
const { requireSession } = await import("@/lib/auth/require-session");
const { publishElection, getReminderTargets, sendReminders } = await import(
  "@/lib/services/publication.service"
);
const {
  startElection,
  resendInvitations,
  closeElection,
  reminderPreview,
  sendElectionReminders,
} = await import("@/actions/elections");

const session = {
  user: { email: "admin@example.com", name: "A", organization: "Org", isPro: false },
  organizationId: "org_1",
};

beforeEach(() => {
  vi.mocked(requireSession).mockReset();
  vi.mocked(requireSession).mockResolvedValue(session);
  vi.mocked(prisma.election.updateMany).mockReset();
  vi.mocked(prisma.election.findFirst).mockReset();
  vi.mocked(prisma.voter.count).mockReset();
  vi.mocked(publishElection).mockReset();
  vi.mocked(publishElection).mockResolvedValue({ sent: 0, failed: 0 });
  vi.mocked(getReminderTargets).mockReset();
  vi.mocked(getReminderTargets).mockResolvedValue({
    recipients: [],
    alreadyVoted: 0,
    expired: 0,
  });
  vi.mocked(sendReminders).mockReset();
  vi.mocked(sendReminders).mockResolvedValue({ sent: 0, failed: 0 });
});

describe("startElection", () => {
  it("rejects an empty id without touching the session or DB", async () => {
    const result = await startElection("");
    expect(result).toEqual({ success: false, error: "invalid" });
    expect(requireSession).not.toHaveBeenCalled();
  });

  it("flips DRAFT → ACTIVE atomically, org-scoped, with startsAt = now", async () => {
    vi.mocked(prisma.election.updateMany).mockResolvedValue({ count: 1 });

    const before = Date.now();
    const result = await startElection("el_1");
    const after = Date.now();

    expect(result).toEqual({ success: true, sent: 0, failed: 0 });
    const arg = vi.mocked(prisma.election.updateMany).mock.calls[0][0];
    // The status guard lives in the WHERE clause — that's the atomicity.
    expect(arg.where).toEqual({
      id: "el_1",
      organizationId: "org_1",
      status: "DRAFT",
    });
    expect(arg.data).toMatchObject({ status: "ACTIVE" });
    const startsAt = (arg.data as { startsAt: Date }).startsAt.getTime();
    expect(startsAt).toBeGreaterThanOrEqual(before);
    expect(startsAt).toBeLessThanOrEqual(after);
  });

  it("publishes invitations after the flip and reports the real numbers", async () => {
    vi.mocked(prisma.election.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(publishElection).mockResolvedValue({ sent: 48, failed: 2 });

    const result = await startElection("el_1");

    expect(publishElection).toHaveBeenCalledWith("el_1");
    expect(result).toEqual({ success: true, sent: 48, failed: 2 });
  });

  it("returns invalidStatus when no DRAFT row matches (non-draft, cross-org, or missing)", async () => {
    vi.mocked(prisma.election.updateMany).mockResolvedValue({ count: 0 });

    const result = await startElection("el_active");
    expect(result).toEqual({ success: false, error: "invalidStatus" });
    expect(publishElection).not.toHaveBeenCalled();
  });

  it("stays a success when the publish pipeline throws — activation never rolls back", async () => {
    vi.mocked(prisma.election.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(publishElection).mockRejectedValue(new Error("resend down"));
    vi.mocked(prisma.voter.count).mockResolvedValue(50);

    const result = await startElection("el_1");

    expect(result).toEqual({ success: true, sent: 0, failed: 50 });
    expect(prisma.voter.count).toHaveBeenCalledWith({
      where: { electionId: "el_1", status: "PENDING" },
    });
  });

  it("reports failure without leaking the DB error", async () => {
    vi.mocked(prisma.election.updateMany).mockRejectedValue(new Error("db down"));

    const result = await startElection("el_1");
    expect(result).toEqual({ success: false, error: "failed" });
  });
});

describe("closeElection", () => {
  it("rejects an empty id without touching the session or DB", async () => {
    const result = await closeElection("");
    expect(result).toEqual({ success: false, error: "invalid" });
    expect(requireSession).not.toHaveBeenCalled();
  });

  it("flips ACTIVE → CLOSED atomically, org-scoped, with endsAt = now", async () => {
    vi.mocked(prisma.election.updateMany).mockResolvedValue({ count: 1 });

    const before = Date.now();
    const result = await closeElection("el_1");
    const after = Date.now();

    expect(result).toEqual({ success: true });
    const arg = vi.mocked(prisma.election.updateMany).mock.calls[0][0];
    // Status guard in the WHERE clause — a second click matches 0 rows.
    expect(arg.where).toEqual({
      id: "el_1",
      organizationId: "org_1",
      status: "ACTIVE",
    });
    expect(arg.data).toMatchObject({ status: "CLOSED" });
    const endsAt = (arg.data as { endsAt: Date }).endsAt.getTime();
    expect(endsAt).toBeGreaterThanOrEqual(before);
    expect(endsAt).toBeLessThanOrEqual(after);
  });

  it("returns invalidStatus when no ACTIVE row matches (already closed, cross-org, or missing)", async () => {
    vi.mocked(prisma.election.updateMany).mockResolvedValue({ count: 0 });

    const result = await closeElection("el_draft");
    expect(result).toEqual({ success: false, error: "invalidStatus" });
  });

  it("reports failure without leaking the DB error", async () => {
    vi.mocked(prisma.election.updateMany).mockRejectedValue(new Error("db down"));

    const result = await closeElection("el_1");
    expect(result).toEqual({ success: false, error: "failed" });
  });
});

describe("resendInvitations", () => {
  it("rejects an empty id without touching the session or DB", async () => {
    const result = await resendInvitations("");
    expect(result).toEqual({ success: false, error: "invalid" });
    expect(requireSession).not.toHaveBeenCalled();
  });

  it("guards on org ownership AND ACTIVE status in one WHERE clause", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue(null);

    const result = await resendInvitations("el_closed");

    expect(result).toEqual({ success: false, error: "invalidStatus" });
    expect(prisma.election.findFirst).toHaveBeenCalledWith({
      where: { id: "el_closed", organizationId: "org_1", status: "ACTIVE" },
      select: { id: true },
    });
    expect(publishElection).not.toHaveBeenCalled();
  });

  it("re-publishes an owned ACTIVE election and returns the numbers", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue({ id: "el_1" });
    vi.mocked(publishElection).mockResolvedValue({ sent: 2, failed: 0 });

    const result = await resendInvitations("el_1");

    expect(publishElection).toHaveBeenCalledWith("el_1");
    expect(result).toEqual({ success: true, sent: 2, failed: 0 });
  });

  it("reports failure when the pipeline throws", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue({ id: "el_1" });
    vi.mocked(publishElection).mockRejectedValue(new Error("boom"));

    const result = await resendInvitations("el_1");
    expect(result).toEqual({ success: false, error: "failed" });
  });
});

describe("reminderPreview", () => {
  it("rejects an empty id without touching the session or DB", async () => {
    const result = await reminderPreview("");
    expect(result).toEqual({ success: false, error: "invalid" });
    expect(requireSession).not.toHaveBeenCalled();
  });

  it("guards on org ownership AND ACTIVE status before counting", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue(null);

    const result = await reminderPreview("el_closed");

    expect(result).toEqual({ success: false, error: "invalidStatus" });
    expect(prisma.election.findFirst).toHaveBeenCalledWith({
      where: { id: "el_closed", organizationId: "org_1", status: "ACTIVE" },
      select: { id: true },
    });
    expect(getReminderTargets).not.toHaveBeenCalled();
  });

  it("returns the counts the modal renders", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue({ id: "el_1" });
    vi.mocked(getReminderTargets).mockResolvedValue({
      recipients: ["a", "b", "c"],
      alreadyVoted: 7,
      expired: 2,
    });

    const result = await reminderPreview("el_1");

    // Count, never the ids — voter identities don't belong in a client payload.
    expect(result).toEqual({
      success: true,
      recipients: 3,
      alreadyVoted: 7,
      expired: 2,
    });
  });

  it("reports failure without leaking the DB error", async () => {
    vi.mocked(prisma.election.findFirst).mockRejectedValue(new Error("db down"));

    const result = await reminderPreview("el_1");
    expect(result).toEqual({ success: false, error: "failed" });
  });
});

describe("sendElectionReminders", () => {
  it("rejects an empty id without touching the session or DB", async () => {
    const result = await sendElectionReminders("");
    expect(result).toEqual({ success: false, error: "invalid" });
    expect(requireSession).not.toHaveBeenCalled();
  });

  it("guards on org ownership AND ACTIVE status before sending", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue(null);

    const result = await sendElectionReminders("el_other_org");

    expect(result).toEqual({ success: false, error: "invalidStatus" });
    expect(sendReminders).not.toHaveBeenCalled();
  });

  it("sends and reports the real numbers", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue({ id: "el_1" });
    vi.mocked(sendReminders).mockResolvedValue({ sent: 12, failed: 1 });

    const result = await sendElectionReminders("el_1");

    // The action re-derives its own recipients — it takes no count from the client.
    expect(sendReminders).toHaveBeenCalledWith("el_1");
    expect(result).toEqual({ success: true, sent: 12, failed: 1 });
  });

  it("reports failure when the pipeline throws", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue({ id: "el_1" });
    vi.mocked(sendReminders).mockRejectedValue(new Error("boom"));

    const result = await sendElectionReminders("el_1");
    expect(result).toEqual({ success: false, error: "failed" });
  });
});
