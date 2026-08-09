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
  windowOver: vi.fn(),
}));
vi.mock("@/lib/services/email.service", () => ({
  sendInvitationEmails: vi.fn(),
  sendReminderEmails: vi.fn(),
}));

const { prisma } = await import("@/lib/prisma");
const {
  mintTokensForPendingVoters,
  mintTokenForVoter,
  mintTokensForVoters,
  windowOver,
} = await import("@/lib/services/token.service");
const { sendInvitationEmails, sendReminderEmails } = await import(
  "@/lib/services/email.service"
);
const {
  chunk,
  publishElection,
  resendVoterLink,
  partitionReminderTargets,
  getReminderTargets,
  sendReminders,
  autoReminderDue,
  CHUNK_SIZE,
  REMINDER_LEAD_MS,
} = await import("@/lib/services/publication.service");

// Far enough out that nothing is expired unless a test says so.
const FUTURE = new Date("2030-01-01T00:00:00Z");

const OPENS = new Date("2026-07-20T00:00:00Z");

const election = {
  status: "ACTIVE",
  title: "Studentski izbori",
  startsAt: OPENS,
  endsAt: FUTURE,
  organization: { name: "VVG" },
};

// Ono što inviteVoter proslijedi dalje: tekst e-pošte + rok za provjeru prozora.
const sendable = {
  id: "el_1",
  title: "Studentski izbori",
  organizationName: "VVG",
  startsAt: OPENS,
  endsAt: FUTURE,
};

const mintedVoter = (i: number) => ({
  voterId: `v${i}`,
  email: `voter${i}@example.com`,
  firstName: null,
  rawToken: `raw${i}`,
});

beforeEach(() => {
  vi.mocked(prisma.election.findUnique).mockReset();
  // Prisma `select` sužava povratni tip; fixture nosi samo polja koja servis čita.
  vi.mocked(prisma.election.findUnique).mockResolvedValue(election as never);
  vi.mocked(prisma.voter.updateMany).mockReset();
  vi.mocked(prisma.voter.updateMany).mockResolvedValue({ count: 0 });
  vi.mocked(prisma.voter.findFirst).mockReset();
  vi.mocked(prisma.voter.findMany).mockReset();
  vi.mocked(prisma.voter.findMany).mockResolvedValue([]);
  vi.mocked(mintTokensForPendingVoters).mockReset();
  vi.mocked(mintTokenForVoter).mockReset();
  vi.mocked(mintTokensForVoters).mockReset();
  vi.mocked(mintTokensForVoters).mockResolvedValue([]);
  vi.mocked(windowOver).mockReset();
  vi.mocked(windowOver).mockReturnValue(false);
  vi.mocked(sendInvitationEmails).mockReset();
  vi.mocked(sendReminderEmails).mockReset();
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

  it("refuses once the window is over — nothing minted, nothing sent, blocked reported", async () => {
    vi.mocked(windowOver).mockReturnValue(true);

    // "0 poslano jer nitko nije trebao pozivnicu" i "0 jer je rok prošao" su
    // različite činjenice — diskriminator ih razdvaja za sve tri površine.
    expect(await publishElection("el_1")).toEqual({
      sent: 0,
      failed: 0,
      blocked: "windowOver",
    });
    expect(mintTokensForPendingVoters).not.toHaveBeenCalled();
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
    // `where.id` je unija string | StringFilter — suzi na oblik koji servis šalje.
    const flippedIds = (i: number) =>
      (updates[i]![0].where!.id as { in: string[] }).in;
    expect(flippedIds(0)).toEqual(minted.slice(0, 100).map((m) => m.voterId));
    expect(flippedIds(1)).toEqual(minted.slice(200).map((m) => m.voterId));
    expect(updates[0]![0].data).toEqual({ status: "INVITED" });
  });

  it("passes election title + org name to the invitation sender", async () => {
    vi.mocked(mintTokensForPendingVoters).mockResolvedValue([mintedVoter(1)]);
    vi.mocked(sendInvitationEmails).mockResolvedValue(undefined);

    await publishElection("el_1");

    expect(sendInvitationEmails).toHaveBeenCalledWith(
      [mintedVoter(1)],
      { id: "el_1", title: "Studentski izbori", organizationName: "VVG" },
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
    } as never);
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
    } as never);
    vi.mocked(mintTokenForVoter).mockResolvedValue(mintedVoter(1));

    await resendVoterLink("el_1", "Voter1@Example.com");

    expect(mintTokenForVoter).toHaveBeenCalledWith("v_1");
    expect(sendInvitationEmails).toHaveBeenCalledWith([mintedVoter(1)], sendable);
    expect(prisma.voter.updateMany).not.toHaveBeenCalled();
  });

  it("sends nothing once the window is over — before the voter is even looked up", async () => {
    vi.mocked(windowOver).mockReturnValue(true);

    await resendVoterLink("el_1", "voter1@example.com");

    // Grana ovisi o izborima, ne o biraču: findFirst se nikad ne izvrši, pa
    // odgovor endpointa ne može odati je li adresa na popisu.
    expect(prisma.voter.findFirst).not.toHaveBeenCalled();
    expect(mintTokenForVoter).not.toHaveBeenCalled();
    expect(sendInvitationEmails).not.toHaveBeenCalled();
  });

  it("flips a PENDING voter to INVITED after a successful send", async () => {
    vi.mocked(prisma.voter.findFirst).mockResolvedValue({
      id: "v_2",
      status: "PENDING",
    } as never);
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
    } as never);
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
    vi.mocked(windowOver).mockReturnValue(true);
    vi.mocked(prisma.voter.findMany).mockResolvedValue([
      { id: "a", status: "INVITED", token: null },
    ] as never);

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

describe("autoReminderDue", () => {
  // Tjedan dana glasanja — dovoljno dug prozor da pravilo o kratkim izborima
  // ne smeta, pa svaki test mijenja točno jednu stvar.
  const NOW = new Date("2026-07-27T12:00:00Z");
  const week = (endsAt: Date) => ({
    startsAt: new Date(endsAt.getTime() - 7 * 24 * 60 * 60 * 1000),
    endsAt,
  });
  const inHours = (h: number) => new Date(NOW.getTime() + h * 60 * 60 * 1000);

  it("fires inside the 24 h window", () => {
    expect(autoReminderDue(week(inHours(12)), NOW)).toBe(true);
  });

  it("stays quiet while the deadline is further out than the lead time", () => {
    expect(autoReminderDue(week(inHours(25)), NOW)).toBe(false);
  });

  it("includes the exact lead-time boundary", () => {
    const endsAt = new Date(NOW.getTime() + REMINDER_LEAD_MS);
    expect(autoReminderDue(week(endsAt), NOW)).toBe(true);
  });

  it("stays quiet once the deadline has passed", () => {
    // Zatvoren prozor: token skovan sada rodio bi se istekao, pa nema koga
    // podsjetiti — samo bi svima umrla poveznica.
    expect(autoReminderDue(week(inHours(-1)), NOW)).toBe(false);
  });

  it("stays quiet at the deadline itself", () => {
    expect(autoReminderDue(week(NOW), NOW)).toBe(false);
  });

  it("never fires for an election whose whole window is 24 h or shorter", () => {
    // Izbori otvoreni četiri sata nikad nisu imali trenutak "24 sata prije
    // zatvaranja" dok su bili otvoreni. Bez ove klauzule bi im se svaka
    // poveznica rotirala nekoliko minuta nakon pozivnice.
    const endsAt = inHours(3);
    const opened = new Date(endsAt.getTime() - 4 * 60 * 60 * 1000);
    expect(autoReminderDue({ startsAt: opened, endsAt }, NOW)).toBe(false);
  });

  it("stays quiet for a window of exactly the lead time", () => {
    const endsAt = inHours(3);
    const opened = new Date(endsAt.getTime() - REMINDER_LEAD_MS);
    expect(autoReminderDue({ startsAt: opened, endsAt }, NOW)).toBe(false);
  });

  it("fires for a window one millisecond longer than the lead time", () => {
    const endsAt = inHours(3);
    const opened = new Date(endsAt.getTime() - REMINDER_LEAD_MS - 1);
    expect(autoReminderDue({ startsAt: opened, endsAt }, NOW)).toBe(true);
  });

  it("stays quiet on the wizard's placeholder dates (endsAt <= startsAt)", () => {
    // Nezakazano zatvaranje: rok uopće nije stvaran, pa "24 sata prije" nema
    // značenje. Ista klauzula koja izbacuje kratke izbore hvata i ovo.
    const startsAt = inHours(6);
    expect(autoReminderDue({ startsAt, endsAt: startsAt }, NOW)).toBe(false);
  });
});

describe("sendReminders", () => {
  it("re-mints for exactly the reachable voters, then sends", async () => {
    vi.mocked(prisma.voter.findMany).mockResolvedValue([
      { id: "a", status: "INVITED", token: { expiresAt: FUTURE } },
      { id: "b", status: "VOTED", token: { expiresAt: FUTURE } },
      { id: "c", status: "PENDING", token: null },
    ] as never);
    vi.mocked(mintTokensForVoters).mockResolvedValue([
      mintedVoter(1),
      mintedVoter(2),
    ]);

    const result = await sendReminders("el_1");

    // Re-mint is forced: raw tokens are unrecoverable, so the reminder must
    // carry a new link (and the old one dies).
    expect(mintTokensForVoters).toHaveBeenCalledWith("el_1", ["a", "c"]);
    // Tekst podsjetnika, ne pozivnice — inače birač dobiva duplikat poziva.
    // endsAt putuje s njim: rok se oblikuje uz tekst, u istom jeziku.
    expect(sendReminderEmails).toHaveBeenCalledWith(
      [mintedVoter(1), mintedVoter(2)],
      {
        id: "el_1",
        title: "Studentski izbori",
        organizationName: "VVG",
        endsAt: FUTURE,
      },
    );
    expect(sendInvitationEmails).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 2, failed: 0 });
  });

  it("sends nothing when everyone has voted", async () => {
    vi.mocked(prisma.voter.findMany).mockResolvedValue([
      { id: "a", status: "VOTED", token: { expiresAt: FUTURE } },
    ] as never);

    const result = await sendReminders("el_1");

    expect(mintTokensForVoters).toHaveBeenCalledWith("el_1", []);
    expect(sendReminderEmails).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, failed: 0 });
  });

  it("flips reminded voters to INVITED so a PENDING one stops looking unsent", async () => {
    vi.mocked(prisma.voter.findMany).mockResolvedValue([
      { id: "c", status: "PENDING", token: null },
    ] as never);
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
    ] as never);
    vi.mocked(mintTokensForVoters).mockResolvedValue([mintedVoter(1)]);
    vi.mocked(sendReminderEmails).mockRejectedValue(new Error("resend: boom"));

    const result = await sendReminders("el_1");

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(prisma.voter.updateMany).not.toHaveBeenCalled();
  });
});
