import { beforeEach, describe, expect, it, vi } from "vitest";

// Same seam-mocking pattern as settings.test.ts: mock prisma + requireSession,
// assert on the mock inputs — never hit the real DB.
vi.mock("@/lib/prisma", () => ({
  prisma: { election: { updateMany: vi.fn() } },
}));
vi.mock("@/lib/auth/require-session", () => ({
  requireSession: vi.fn(),
}));

const { prisma } = await import("@/lib/prisma");
const { requireSession } = await import("@/lib/auth/require-session");
const { startElection } = await import("@/actions/elections");

const session = {
  user: { email: "admin@example.com", name: "A", organization: "Org", isPro: false },
  organizationId: "org_1",
};

beforeEach(() => {
  vi.mocked(requireSession).mockResolvedValue(session);
  vi.mocked(prisma.election.updateMany).mockReset();
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

    expect(result).toEqual({ success: true });
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

  it("returns invalidStatus when no DRAFT row matches (non-draft, cross-org, or missing)", async () => {
    vi.mocked(prisma.election.updateMany).mockResolvedValue({ count: 0 });

    const result = await startElection("el_active");
    expect(result).toEqual({ success: false, error: "invalidStatus" });
  });

  it("reports failure without leaking the DB error", async () => {
    vi.mocked(prisma.election.updateMany).mockRejectedValue(new Error("db down"));

    const result = await startElection("el_1");
    expect(result).toEqual({ success: false, error: "failed" });
  });
});
