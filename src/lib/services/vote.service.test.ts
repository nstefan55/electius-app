import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  voterToken: { updateMany: vi.fn() },
  voter: { update: vi.fn() },
  vote: { create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    voterToken: { findUnique: vi.fn() },
    election: { findUnique: vi.fn() },
    voteOption: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const { prisma } = await import("@/lib/prisma");
const { hashToken } = await import("@/lib/services/token.service");
const { getBallotState, castVote, computeVoteHash, VoteError } = await import(
  "@/lib/services/vote.service"
);

const FUTURE = new Date(Date.now() + 7 * 86400_000);
const PAST = new Date(Date.now() - 86400_000);

const electionRow = (over: Record<string, unknown> = {}) => ({
  id: "el_1",
  title: "Studentski zbor 2026",
  description: "Opis",
  votingType: "SINGLE_CHOICE",
  status: "ACTIVE",
  startsAt: PAST,
  endsAt: FUTURE,
  resultsVisible: false,
  organization: { name: "VVG" },
  ...over,
  // Prisma `select` sužava tip; fixture nosi samo polja koja servis čita.
}) as never;

beforeEach(() => {
  vi.mocked(prisma.voterToken.findUnique).mockReset();
  vi.mocked(prisma.election.findUnique).mockReset();
  vi.mocked(prisma.voteOption.findMany).mockReset();
  vi.mocked(prisma.$transaction).mockReset();
  tx.voterToken.updateMany.mockReset();
  tx.voter.update.mockReset();
  tx.vote.create.mockReset();
  // Default: interactive transaction runs its callback against the tx mocks.
  vi.mocked(prisma.$transaction).mockImplementation(async (cb) =>
    (cb as unknown as (t: typeof tx) => Promise<unknown>)(tx),
  );
  tx.voterToken.updateMany.mockResolvedValue({ count: 1 });
});

describe("computeVoteHash", () => {
  it("matches SHA-256(electionId + sortedOptionIds + timestamp)", () => {
    const ts = "2026-07-25T10:00:00.000Z";
    const expected = createHash("sha256")
      .update("el_1" + "a,b" + ts)
      .digest("hex");
    expect(computeVoteHash("el_1", ["b", "a"], ts)).toBe(expected);
  });

  it("is selection-order-independent", () => {
    const ts = "2026-07-25T10:00:00.000Z";
    expect(computeVoteHash("el_1", ["x", "y", "z"], ts)).toBe(
      computeVoteHash("el_1", ["z", "x", "y"], ts),
    );
  });
});

describe("getBallotState", () => {
  // VoterToken → election rides through the voter relation (no direct relation).
  const tokenRow = (over: Record<string, unknown> = {}, election = electionRow()) => ({
    id: "tok_1",
    used: false,
    expiresAt: FUTURE,
    voter: { election },
    ...over,
  }) as never;

  it("routes by the design's state table", async () => {
    const cases: Array<{
      token: ReturnType<typeof tokenRow> | null;
      election?: ReturnType<typeof electionRow> | null;
      expected: Record<string, unknown>;
    }> = [
      // no token, no election → invalid
      { token: null, election: null, expected: { state: "invalid" } },
      // no token + election id → QR branch by status
      { token: null, election: electionRow(), expected: { state: "qrEntry" } },
      {
        token: null,
        election: electionRow({ status: "SCHEDULED" }),
        expected: { state: "notStarted", hasToken: false },
      },
      {
        token: null,
        election: electionRow({ status: "CLOSED" }),
        expected: { state: "closed", voted: null },
      },
      // DRAFT must not leak its existence
      {
        token: null,
        election: electionRow({ status: "DRAFT" }),
        expected: { state: "invalid" },
      },
      // token branch: closed checked BEFORE used (closed-voted framing)
      {
        token: tokenRow({ used: true }, electionRow({ status: "CLOSED" })),
        expected: { state: "closed", voted: true },
      },
      {
        token: tokenRow({}, electionRow({ status: "ARCHIVED" })),
        expected: { state: "closed", voted: false },
      },
      {
        token: tokenRow({}, electionRow({ status: "SCHEDULED" })),
        expected: { state: "notStarted", hasToken: true },
      },
      { token: tokenRow({ used: true }), expected: { state: "used" } },
      { token: tokenRow({ expiresAt: PAST }), expected: { state: "expired" } },
    ];

    for (const c of cases) {
      vi.mocked(prisma.voterToken.findUnique).mockResolvedValueOnce(c.token);
      if (c.token === null) {
        vi.mocked(prisma.election.findUnique).mockResolvedValueOnce(
          c.election ?? null,
        );
      }
      expect(await getBallotState("segment")).toMatchObject(c.expected);
    }
  });

  // Petlja koju ovo zatvara: istekla poveznica → zaslon nudi "zatraži novu" →
  // obrazac kuje token koji nasljeđuje isti mrtvi rok → opet istekla poveznica.
  // Izbori s prošlim rokom čitaju se kao zatvoreni, pa ulaza u petlju nema.
  describe("window over but still ACTIVE (before the sweep closes it)", () => {
    // startsAt mora biti STVARNO prije endsAt — inače je to rezervirani datum
    // čarobnjaka (endsAt <= startsAt) i rok uopće nije istekao.
    const overRow = electionRow({
      startsAt: new Date(Date.now() - 3 * 86400_000),
      endsAt: PAST,
    });

    it("reads as closed for a live token, not expired", async () => {
      vi.mocked(prisma.voterToken.findUnique).mockResolvedValue(
        tokenRow({ expiresAt: FUTURE }, overRow),
      );

      // Bez ovoga: state "expired" + CTA koji vodi na obrazac za novu poveznicu.
      expect(await getBallotState("raw")).toMatchObject({
        state: "closed",
        voted: false,
      });
    });

    it("reads as closed for an election-id segment, not qrEntry", async () => {
      vi.mocked(prisma.voterToken.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.election.findUnique).mockResolvedValue(overRow);

      // Bez ovoga: obrazac "pošalji mi poveznicu" koji može roditi samo mrtvu.
      expect(await getBallotState("el_1")).toMatchObject({
        state: "closed",
        voted: null,
      });
    });

    it("still reads as the ballot while the window is open", async () => {
      vi.mocked(prisma.voterToken.findUnique).mockResolvedValue(tokenRow());
      vi.mocked(prisma.voteOption.findMany).mockResolvedValue([]);

      // Granica: promjena smije dirati SAMO izbore s prošlim rokom.
      expect((await getBallotState("raw")).state).toBe("ballot");
    });

    it("keeps the wizard placeholder (endsAt <= startsAt) voting", async () => {
      const placeholder = electionRow({ startsAt: PAST, endsAt: PAST });
      vi.mocked(prisma.voterToken.findUnique).mockResolvedValue(
        tokenRow({}, placeholder),
      );
      vi.mocked(prisma.voteOption.findMany).mockResolvedValue([]);

      expect((await getBallotState("raw")).state).toBe("ballot");
    });
  });

  it("returns the ballot with options in orderIndex order for a valid token", async () => {
    vi.mocked(prisma.voterToken.findUnique).mockResolvedValue(tokenRow());
    vi.mocked(prisma.voteOption.findMany).mockResolvedValue([
      { id: "o1", text: "Ana", description: null },
      { id: "o2", text: "Marko", description: "2. godina" },
    ] as never);

    const result = await getBallotState("valid-raw-token");

    expect(result.state).toBe("ballot");
    if (result.state === "ballot") {
      expect(result.election.organizationName).toBe("VVG");
      expect(result.options.map((o) => o.id)).toEqual(["o1", "o2"]);
    }
    // Lookup is by hash, never the raw segment.
    expect(prisma.voterToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { hash: hashToken("valid-raw-token") },
      }),
    );
  });
});

describe("castVote", () => {
  const castTokenRow = (
    over: Record<string, unknown> = {},
    election: Record<string, unknown> = {
      status: "ACTIVE",
      votingType: "SINGLE_CHOICE",
      options: [{ id: "o1" }, { id: "o2" }],
    },
  ) => ({
    id: "tok_1",
    used: false,
    expiresAt: FUTURE,
    voterId: "v_1",
    electionId: "el_1",
    voter: { election },
    ...over,
  }) as never;

  const expectCode = async (promise: Promise<unknown>, code: string) => {
    await expect(promise).rejects.toMatchObject({ code });
  };

  it("rejects unknown / used / expired tokens and non-ACTIVE elections", async () => {
    vi.mocked(prisma.voterToken.findUnique).mockResolvedValueOnce(null);
    await expectCode(castVote("raw", ["o1"]), "invalid");

    vi.mocked(prisma.voterToken.findUnique).mockResolvedValueOnce(
      castTokenRow({ used: true }),
    );
    await expectCode(castVote("raw", ["o1"]), "used");

    vi.mocked(prisma.voterToken.findUnique).mockResolvedValueOnce(
      castTokenRow({ expiresAt: PAST }),
    );
    await expectCode(castVote("raw", ["o1"]), "invalid");

    vi.mocked(prisma.voterToken.findUnique).mockResolvedValueOnce(
      castTokenRow({}, {
        status: "CLOSED",
        votingType: "SINGLE_CHOICE",
        options: [{ id: "o1" }],
      }),
    );
    await expectCode(castVote("raw", ["o1"]), "invalid");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects invalid selections (foreign, empty, dupes, >1 on SINGLE)", async () => {
    for (const optionIds of [["nope"], [], ["o1", "o1"], ["o1", "o2"]]) {
      vi.mocked(prisma.voterToken.findUnique).mockResolvedValueOnce(castTokenRow());
      await expectCode(castVote("raw", optionIds), "selection");
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("accepts multi-choice selections of any size ≥1 (decision a: no cap)", async () => {
    vi.mocked(prisma.voterToken.findUnique).mockResolvedValue(
      castTokenRow({}, {
        status: "ACTIVE",
        votingType: "MULTI_CHOICE",
        options: [{ id: "o1" }, { id: "o2" }, { id: "o3" }],
      }),
    );
    const { voteHash } = await castVote("raw", ["o3", "o1", "o2"]);
    expect(voteHash).toMatch(/^[0-9a-f]{64}$/);
    const junction = tx.vote.create.mock.calls[0][0].data.options.create;
    expect(junction).toEqual([
      { optionId: "o3" },
      { optionId: "o1" },
      { optionId: "o2" },
    ]);
  });

  it("casts atomically: WHERE-guarded flip, voter → VOTED, anonymous vote row", async () => {
    vi.mocked(prisma.voterToken.findUnique).mockResolvedValue(castTokenRow());

    const { voteHash } = await castVote("raw-token-secret", ["o1"]);

    // The race guard lives in the WHERE clause.
    expect(tx.voterToken.updateMany).toHaveBeenCalledWith({
      where: { id: "tok_1", used: false },
      data: { used: true },
    });
    // Who voted — status only, no link to the vote.
    expect(tx.voter.update).toHaveBeenCalledWith({
      where: { id: "v_1" },
      data: { status: "VOTED" },
    });

    const voteArgs = tx.vote.create.mock.calls[0][0];
    const flat = JSON.stringify(voteArgs);
    // Schema-level anonymity: the vote row references NO voter, ever.
    expect(flat).not.toContain("voterId");
    expect(flat).not.toContain("v_1");
    // Raw token hygiene: never in any write.
    expect(flat).not.toContain("raw-token-secret");
    expect(voteArgs.data.voteHash).toBe(voteHash);
    expect(voteArgs.data.batchOrder).toBeGreaterThanOrEqual(0);
    expect(voteArgs.data.batchOrder).toBeLessThan(2147483647);
    expect(voteArgs.data.election).toEqual({ connect: { id: "el_1" } });
  });

  it("aborts on the double-submit race without writing a vote", async () => {
    vi.mocked(prisma.voterToken.findUnique).mockResolvedValue(castTokenRow());
    tx.voterToken.updateMany.mockResolvedValue({ count: 0 });

    await expectCode(castVote("raw", ["o1"]), "used");
    expect(tx.vote.create).not.toHaveBeenCalled();
    expect(tx.voter.update).not.toHaveBeenCalled();
  });

  it("VoteError carries the code", () => {
    expect(new VoteError("used").code).toBe("used");
  });
});
