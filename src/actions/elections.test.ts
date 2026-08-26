import { beforeEach, describe, expect, it, vi } from "vitest";

// Same seam-mocking pattern as settings.test.ts: mock prisma + requireSession,
// assert on the mock inputs — never hit the real DB. publication.service is a
// third seam here — the pipeline itself is covered by its own colocated tests.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    election: { updateMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
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
// Vrata metle su vlastiti šav — Redis polovica ima svoje kolocirane testove;
// ovdje samo ožičenje (uspjeh briše rok, odbijanje ne dira Redis).
vi.mock("@/lib/services/sweep-gate", () => ({
  clearSweepGate: vi.fn(),
}));
// archive.service is its own seam — the seal itself is covered by its colocated
// tests; here only the wiring and the error mapping.
vi.mock("@/lib/services/archive.service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/services/archive.service")>();
  return { ...actual, sealElection: vi.fn() };
});

const { prisma } = await import("@/lib/prisma");
const { requireSession } = await import("@/lib/auth/require-session");
const { publishElection, getReminderTargets, sendReminders } = await import(
  "@/lib/services/publication.service"
);
const { sealElection, ArchiveError } = await import(
  "@/lib/services/archive.service"
);
const { clearSweepGate } = await import("@/lib/services/sweep-gate");
const {
  startElection,
  renameElection,
  resendInvitations,
  closeElection,
  reminderPreview,
  sendElectionReminders,
  archiveElection,
} = await import("@/actions/elections");

const session = {
  user: { email: "admin@example.com", name: "A", organization: "Org", image: null, organizationLogo: null, isPro: false },
  organizationId: "org_1",
  accessibility: {
    reduceMotion: false,
    highContrast: false,
    largerText: false,
    focusOutlines: true,
  },
};

beforeEach(() => {
  vi.mocked(requireSession).mockReset();
  vi.mocked(requireSession).mockResolvedValue(session);
  vi.mocked(prisma.election.updateMany).mockReset();
  vi.mocked(prisma.election.findFirst).mockReset();
  vi.mocked(prisma.election.update).mockReset();
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
  vi.mocked(clearSweepGate).mockReset().mockResolvedValue(undefined);
});

describe("startElection", () => {
  // Skica s budućim rokom — predčitanje koje odlučuje smije li se pokrenuti.
  const openDraft = {
    startsAt: new Date("2026-07-01T00:00:00Z"),
    endsAt: new Date("2030-01-01T00:00:00Z"),
  };

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.election.findFirst).mockResolvedValue(openDraft as any);
  });

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

  it("uspješno pokretanje briše rok metle (sweep-gate D4)", async () => {
    vi.mocked(prisma.election.updateMany).mockResolvedValue({ count: 1 });

    await startElection("el_1");

    expect(clearSweepGate).toHaveBeenCalledTimes(1);
  });

  it("odbijanje (nema DRAFT retka) ne dira Redis", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue(null);

    await startElection("el_active");

    expect(clearSweepGate).not.toHaveBeenCalled();
  });

  it("publishes invitations after the flip and reports the real numbers", async () => {
    vi.mocked(prisma.election.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(publishElection).mockResolvedValue({ sent: 48, failed: 2 });

    const result = await startElection("el_1");

    expect(publishElection).toHaveBeenCalledWith("el_1");
    expect(result).toEqual({ success: true, sent: 48, failed: 2 });
  });

  it("returns invalidStatus when no DRAFT row matches (non-draft, cross-org, or missing)", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue(null);

    const result = await startElection("el_active");
    expect(result).toEqual({ success: false, error: "invalidStatus" });
    expect(prisma.election.updateMany).not.toHaveBeenCalled();
    expect(publishElection).not.toHaveBeenCalled();
  });

  it("refuses a draft whose close date already passed, without flipping or sending", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue({
      startsAt: new Date("2026-07-01T00:00:00Z"),
      endsAt: new Date("2026-07-10T00:00:00Z"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // Bez ovoga: startsAt = sada pretvori endsAt u rezervirani datum i glasanje
    // tiho traje 30 dana umjesto do datuma koji je admin postavio.
    expect(await startElection("el_stale")).toEqual({
      success: false,
      error: "deadlinePassed",
    });
    expect(prisma.election.updateMany).not.toHaveBeenCalled();
    expect(publishElection).not.toHaveBeenCalled();
  });

  it("still starts an unscheduled draft (endsAt <= startsAt is the placeholder, not a passed deadline)", async () => {
    const opens = new Date("2026-07-01T00:00:00Z");
    vi.mocked(prisma.election.findFirst).mockResolvedValue({
      startsAt: opens,
      endsAt: opens,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(prisma.election.updateMany).mockResolvedValue({ count: 1 });

    expect(await startElection("el_unscheduled")).toMatchObject({
      success: true,
    });
  });

  // Regresija za posljedicu usidrenja stropa u startsAt (G2). Nacrt nosi
  // startsAt = trenutak stvaranja, pa je windowOver za stari nacrt bez roka
  // ISTINIT — a straža čita startsAt PRIJE nego ga updateMany prepiše na sada.
  // Da straža pita windowOver, ovakav bi nacrt bio trajno nepokretljiv, a rute
  // za uređivanje datuma nema. Zato pita deadlinePassed.
  it("starts an unscheduled draft that is older than the 30-day token ceiling", async () => {
    const opens = new Date("2020-01-01T00:00:00Z"); // godinama u prošlosti
    vi.mocked(prisma.election.findFirst).mockResolvedValue({
      startsAt: opens,
      endsAt: opens,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(prisma.election.updateMany).mockResolvedValue({ count: 1 });

    expect(await startElection("el_ancient_draft")).toMatchObject({
      success: true,
    });
    // startsAt se prepisuje na sada, pa novi prozor kreće od klika.
    expect(
      vi.mocked(prisma.election.updateMany).mock.calls[0]![0]!.data,
    ).toMatchObject({ status: "ACTIVE" });
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

// G5 — zahtjev 3. Preimenovanje je prije imalo samo provjeru vlasništva, pa je
// bilo dostupno na CLOSED i ARCHIVED izborima.
describe("renameElection", () => {
  const OPEN = {
    status: "ACTIVE",
    startsAt: new Date("2026-07-01T00:00:00Z"),
    endsAt: new Date("2099-01-01T00:00:00Z"),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockElection = (value: any) =>
    vi.mocked(prisma.election.findFirst).mockResolvedValue(value);

  it("rejects an empty id or title without touching the session or DB", async () => {
    expect(await renameElection("", "Novo ime")).toEqual({
      success: false,
      error: "invalid",
    });
    expect(await renameElection("el_1", "   ")).toEqual({
      success: false,
      error: "invalid",
    });
    expect(requireSession).not.toHaveBeenCalled();
  });

  it("keeps org ownership in the WHERE clause", async () => {
    mockElection(null);

    expect(await renameElection("el_other_org", "Novo ime")).toEqual({
      success: false,
      error: "forbidden",
    });
    expect(prisma.election.findFirst).toHaveBeenCalledWith({
      where: { id: "el_other_org", organizationId: "org_1" },
      select: { status: true, startsAt: true, endsAt: true },
    });
    expect(prisma.election.update).not.toHaveBeenCalled();
  });

  it("renames an election that is still open", async () => {
    mockElection(OPEN as never);

    expect(await renameElection("el_1", "  Novo ime  ")).toEqual({
      success: true,
    });
    expect(vi.mocked(prisma.election.update).mock.calls[0]![0]!).toEqual({
      where: { id: "el_1" },
      data: { title: "Novo ime" },
    });
  });

  // D3 — stroža linija: i CLOSED i ARCHIVED. Kod zapečaćenih je oštrije, jer
  // Archive.electionData čuva vlastitu kopiju naslova.
  it.each(["CLOSED", "ARCHIVED"] as const)(
    "refuses %s and writes nothing",
    async (status) => {
      mockElection({ ...OPEN, status } as never);

      expect(await renameElection("el_1", "Novo ime")).toEqual({
        success: false,
        error: "electionEnded",
      });
      expect(prisma.election.update).not.toHaveBeenCalled();
    },
  );

  it("refuses an ACTIVE election whose window is over but which the sweep has not closed", async () => {
    mockElection({
      status: "ACTIVE",
      startsAt: new Date("2026-07-01T00:00:00Z"),
      endsAt: new Date("2026-07-10T00:00:00Z"),
    } as never);

    expect(await renameElection("el_1", "Novo ime")).toEqual({
      success: false,
      error: "electionEnded",
    });
    expect(prisma.election.update).not.toHaveBeenCalled();
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
    vi.mocked(prisma.election.findFirst).mockResolvedValue({ id: "el_1" } as never);
    vi.mocked(publishElection).mockResolvedValue({ sent: 2, failed: 0 });

    const result = await resendInvitations("el_1");

    expect(publishElection).toHaveBeenCalledWith("el_1");
    expect(result).toEqual({ success: true, sent: 2, failed: 0 });
  });

  it("reports failure when the pipeline throws", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue({ id: "el_1" } as never);
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
    vi.mocked(prisma.election.findFirst).mockResolvedValue({ id: "el_1" } as never);
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
    vi.mocked(prisma.election.findFirst).mockResolvedValue({ id: "el_1" } as never);
    vi.mocked(sendReminders).mockResolvedValue({ sent: 12, failed: 1 });

    const result = await sendElectionReminders("el_1");

    // The action re-derives its own recipients — it takes no count from the client.
    expect(sendReminders).toHaveBeenCalledWith("el_1");
    expect(result).toEqual({ success: true, sent: 12, failed: 1 });
  });

  it("reports failure when the pipeline throws", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue({ id: "el_1" } as never);
    vi.mocked(sendReminders).mockRejectedValue(new Error("boom"));

    const result = await sendElectionReminders("el_1");
    expect(result).toEqual({ success: false, error: "failed" });
  });
});

describe("archiveElection", () => {
  beforeEach(() => {
    vi.mocked(sealElection).mockReset();
  });

  it("seals through the service, scoped to the session org", async () => {
    vi.mocked(sealElection).mockResolvedValue({
      merkleRoot: "a".repeat(64),
      votesSealed: 7,
    });

    const result = await archiveElection("el_1");

    // The org comes from the session, never from the caller.
    expect(sealElection).toHaveBeenCalledWith("el_1", "org_1");
    expect(result).toEqual({
      success: true,
      merkleRoot: "a".repeat(64),
      votesSealed: 7,
    });
  });

  it("maps the CLOSED guard to invalidStatus (missing / cross-org / wrong status collapse)", async () => {
    vi.mocked(sealElection).mockRejectedValue(new ArchiveError("invalidStatus"));

    expect(await archiveElection("el_1")).toEqual({
      success: false,
      error: "invalidStatus",
    });
  });

  it("an unexpected throw stays a generic failure", async () => {
    vi.mocked(sealElection).mockRejectedValue(new Error("boom"));

    expect(await archiveElection("el_1")).toEqual({
      success: false,
      error: "failed",
    });
  });

  it("never reaches the service without an id", async () => {
    expect(await archiveElection("")).toEqual({
      success: false,
      error: "invalid",
    });
    expect(sealElection).not.toHaveBeenCalled();
  });
});
