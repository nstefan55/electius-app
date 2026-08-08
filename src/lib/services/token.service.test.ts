import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    election: { findUnique: vi.fn() },
    voter: { findMany: vi.fn() },
    voterToken: { deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

const { prisma } = await import("@/lib/prisma");
const {
  hashToken,
  tokenExpiry,
  windowOver,
  deadlinePassed,
  mutationsFrozen,
  mintTokensForPendingVoters,
} = await import("@/lib/services/token.service");

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.mocked(prisma.election.findUnique).mockReset();
  vi.mocked(prisma.voter.findMany).mockReset();
  vi.mocked(prisma.voterToken.deleteMany).mockClear();
  vi.mocked(prisma.voterToken.createMany).mockClear();
});

describe("hashToken", () => {
  it("produces the known SHA-256 hex vector", () => {
    // sha256("test") — standard test vector
    expect(hashToken("test")).toBe(
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    );
  });
});

describe("tokenExpiry", () => {
  it("uses endsAt when the election has a real close date", () => {
    const startsAt = new Date("2026-07-24T00:00:00Z");
    const endsAt = new Date("2026-07-30T00:00:00Z");
    expect(tokenExpiry(startsAt, endsAt)).toEqual(endsAt);
  });

  it("falls back to startsAt + 30 days for the wizard placeholder (endsAt <= startsAt)", () => {
    const startsAt = new Date("2026-07-24T00:00:00Z");
    const ceiling = new Date(startsAt.getTime() + 30 * DAY_MS);
    expect(tokenExpiry(startsAt, startsAt)).toEqual(ceiling);
    // endsAt strictly before startsAt (manual start moved startsAt forward)
    expect(tokenExpiry(startsAt, new Date("2026-07-01T00:00:00Z"))).toEqual(
      ceiling,
    );
  });

  // G2. Sidro je bilo `now`, pa se strop pomicao sa svakim pozivom i istek se
  // nikad nije približavao. Ovo je test koji pada ako se sidro vrati.
  it("does not move — the placeholder ceiling is fixed, not relative to the caller", () => {
    const startsAt = new Date("2026-07-24T00:00:00Z");
    const first = tokenExpiry(startsAt, startsAt);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T00:00:00Z")); // dva mjeseca poslije
    const second = tokenExpiry(startsAt, startsAt);
    vi.useRealTimers();
    expect(second).toEqual(first);
  });
});

describe("windowOver", () => {
  const now = new Date("2026-07-24T12:00:00Z");
  const startsAt = new Date("2026-07-20T00:00:00Z");

  it("is true once endsAt has passed", () => {
    expect(
      windowOver({ startsAt, endsAt: new Date("2026-07-23T00:00:00Z") }, now),
    ).toBe(true);
  });

  it("is false while the window is open", () => {
    expect(
      windowOver({ startsAt, endsAt: new Date("2026-07-30T00:00:00Z") }, now),
    ).toBe(false);
  });

  it("is true at the exact endsAt boundary — a token minted now dies now", () => {
    expect(windowOver({ startsAt, endsAt: now }, now)).toBe(true);
  });

  it("is false for the wizard placeholder (endsAt <= startsAt) inside the 30-day ceiling", () => {
    expect(windowOver({ startsAt, endsAt: startsAt }, now)).toBe(false);
    // Ovo je grana koju `endsAt < now` tiho gubi: rok je u prošlosti, ali
    // izbori nemaju zakazano zatvaranje pa tokeni žive do stropa.
    expect(
      windowOver({ startsAt, endsAt: new Date("2026-07-01T00:00:00Z") }, now),
    ).toBe(false);
  });

  // G2, cijeli. Prije usidrenja u startsAt ova tvrdnja NIJE MOGLA biti istinita
  // ni za jedan ulaz: strop se računao od `now`, pa je `now + 30d <= now` uvijek
  // bilo false. Izbori bez roka nisu se mogli zatvoriti nikad.
  it("is true for a placeholder election past its 30-day ceiling", () => {
    const long = new Date(startsAt.getTime() + 31 * DAY_MS);
    expect(windowOver({ startsAt, endsAt: startsAt }, long)).toBe(true);
  });

  it("is true at the exact 30-day ceiling boundary", () => {
    const ceiling = new Date(startsAt.getTime() + 30 * DAY_MS);
    expect(windowOver({ startsAt, endsAt: startsAt }, ceiling)).toBe(true);
  });

  it("agrees with tokenExpiry on every input — one rule, not two", () => {
    const cases = [
      { startsAt, endsAt: new Date("2026-07-23T00:00:00Z") }, // prošao
      { startsAt, endsAt: new Date("2026-07-30T00:00:00Z") }, // otvoren
      { startsAt, endsAt: now }, // granica
      { startsAt, endsAt: startsAt }, // rezervirani datum čarobnjaka
      { startsAt, endsAt: new Date("2026-07-01T00:00:00Z") }, // rezervirani, obrnut
    ];
    for (const e of cases) {
      expect(windowOver(e, now)).toBe(tokenExpiry(e.startsAt, e.endsAt) <= now);
    }
  });
});

describe("deadlinePassed", () => {
  const startsAt = new Date("2026-07-20T00:00:00Z");
  const now = new Date("2026-07-24T12:00:00Z");

  it("is true when a real close date has passed", () => {
    expect(
      deadlinePassed({ startsAt, endsAt: new Date("2026-07-23T00:00:00Z") }, now),
    ).toBe(true);
  });

  it("is false while a real close date is still ahead", () => {
    expect(
      deadlinePassed({ startsAt, endsAt: new Date("2026-07-30T00:00:00Z") }, now),
    ).toBe(false);
  });

  // Ovo je razlika prema windowOver i razlog zašto funkcija postoji. Nacrt bez
  // roka star godinu dana i dalje se smije pokrenuti — nema roka koji bi prošao.
  // Bez ovoga bi startElection takav nacrt trajno odbio, a rute za uređivanje
  // datuma nema.
  it("is false for the wizard placeholder however old — there is no deadline to pass", () => {
    const muchLater = new Date(startsAt.getTime() + 365 * DAY_MS);
    expect(deadlinePassed({ startsAt, endsAt: startsAt }, muchLater)).toBe(false);
    expect(
      deadlinePassed(
        { startsAt, endsAt: new Date("2026-07-01T00:00:00Z") },
        muchLater,
      ),
    ).toBe(false);
    // …dok windowOver za isti redak JEST istinit. Dva pitanja, dva odgovora.
    expect(windowOver({ startsAt, endsAt: startsAt }, muchLater)).toBe(true);
  });
});

describe("mutationsFrozen", () => {
  const startsAt = new Date("2026-07-20T00:00:00Z");
  const open = new Date("2026-07-30T00:00:00Z");
  const now = new Date("2026-07-24T12:00:00Z");

  it("is false for an election still taking votes", () => {
    expect(
      mutationsFrozen({ status: "ACTIVE", startsAt, endsAt: open }, now),
    ).toBe(false);
    expect(
      mutationsFrozen({ status: "SCHEDULED", startsAt, endsAt: open }, now),
    ).toBe(false);
    expect(
      mutationsFrozen({ status: "DRAFT", startsAt, endsAt: open }, now),
    ).toBe(false);
  });

  it("is true for CLOSED and ARCHIVED (D3 — the stricter line)", () => {
    expect(
      mutationsFrozen({ status: "CLOSED", startsAt, endsAt: open }, now),
    ).toBe(true);
    expect(
      mutationsFrozen({ status: "ARCHIVED", startsAt, endsAt: open }, now),
    ).toBe(true);
  });

  // Prozor između endsAt i sljedećeg prolaza čistača — i slučaj da pinger
  // uopće ne radi, gdje izbori ostanu ACTIVE zauvijek.
  it("is true for an ACTIVE election whose window is over but which the sweep has not closed", () => {
    expect(
      mutationsFrozen(
        { status: "ACTIVE", startsAt, endsAt: new Date("2026-07-23T00:00:00Z") },
        now,
      ),
    ).toBe(true);
  });
});

describe("mintTokensForPendingVoters", () => {
  // Fixture se i čita (election.endsAt), pa tip ostaje — `as never` ide na mockove.
  const election = {
    startsAt: new Date("2026-07-24T00:00:00Z"),
    endsAt: new Date("2026-07-30T00:00:00Z"),
  };
  // Prisma `select` sužava povratni tip; fixture nosi samo polja koja servis čita.
  const voters = [
    { id: "v1", email: "a@example.com", firstName: "Ana" },
    { id: "v2", email: "b@example.com", firstName: null },
  ] as never;

  it("returns [] without touching tokens when the election is missing", async () => {
    vi.mocked(prisma.election.findUnique).mockResolvedValue(null);
    expect(await mintTokensForPendingVoters("nope")).toEqual([]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns [] without a transaction when no voters are PENDING", async () => {
    vi.mocked(prisma.election.findUnique).mockResolvedValue(election as never);
    vi.mocked(prisma.voter.findMany).mockResolvedValue([]);
    expect(await mintTokensForPendingVoters("el_1")).toEqual([]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("deletes leftover tokens and mints fresh ones for every PENDING voter", async () => {
    vi.mocked(prisma.election.findUnique).mockResolvedValue(election as never);
    vi.mocked(prisma.voter.findMany).mockResolvedValue(voters);

    const minted = await mintTokensForPendingVoters("el_1");

    // Retry rule: delete + re-mint, keyed on exactly the PENDING voter ids.
    expect(prisma.voterToken.deleteMany).toHaveBeenCalledWith({
      where: { voterId: { in: ["v1", "v2"] } },
    });

    const createArg = vi.mocked(prisma.voterToken.createMany).mock.calls[0]![0]!;
    const rows = createArg.data as {
      hash: string;
      voterId: string;
      electionId: string;
      expiresAt: Date;
    }[];
    expect(rows).toHaveLength(2);
    // Stored hash = SHA-256(raw); expiry follows the rule.
    rows.forEach((row, i) => {
      expect(row.hash).toBe(hashToken(minted[i].rawToken));
      expect(row.electionId).toBe("el_1");
      expect(row.expiresAt).toEqual(election.endsAt);
    });
    // Each raw token is a distinct 256-bit base64url string.
    expect(minted[0].rawToken).not.toBe(minted[1].rawToken);
    expect(minted[0].rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("only PENDING voters are targeted", async () => {
    vi.mocked(prisma.election.findUnique).mockResolvedValue(election as never);
    vi.mocked(prisma.voter.findMany).mockResolvedValue([]);
    await mintTokensForPendingVoters("el_1");
    expect(prisma.voter.findMany).toHaveBeenCalledWith({
      where: { electionId: "el_1", status: "PENDING" },
      select: { id: true, email: true, firstName: true },
    });
  });

  it("never passes a raw token to Prisma (hash-only storage)", async () => {
    vi.mocked(prisma.election.findUnique).mockResolvedValue(election as never);
    vi.mocked(prisma.voter.findMany).mockResolvedValue(voters);

    const minted = await mintTokensForPendingVoters("el_1");

    const everyPrismaArg = JSON.stringify([
      vi.mocked(prisma.voterToken.deleteMany).mock.calls,
      vi.mocked(prisma.voterToken.createMany).mock.calls,
      vi.mocked(prisma.election.findUnique).mock.calls,
      vi.mocked(prisma.voter.findMany).mock.calls,
    ]);
    for (const { rawToken } of minted) {
      expect(everyPrismaArg).not.toContain(rawToken);
    }
  });
});
