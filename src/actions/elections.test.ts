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
}));

const { prisma } = await import("@/lib/prisma");
const { requireSession } = await import("@/lib/auth/require-session");
const { publishElection } = await import(
  "@/lib/services/publication.service"
);
const { startElection, resendInvitations } = await import(
  "@/actions/elections"
);

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
