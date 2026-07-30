import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    election: { findFirst: vi.fn(), updateMany: vi.fn() },
    archive: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const { prisma } = await import("@/lib/prisma");
const { sealElection, ArchiveError } = await import("./archive.service");
const { buildMerkleTree } = await import("./merkle.service");

const leaf = (c: string) => c.repeat(64);
const HASHES = [leaf("3"), leaf("1"), leaf("2")];

const closed = {
  id: "e1",
  title: "Studentski izbori",
  description: "Opis",
  electionType: "STANDARD",
  votingType: "SINGLE_CHOICE",
  startsAt: new Date("2026-07-01T00:00:00Z"),
  endsAt: new Date("2026-07-10T00:00:00Z"),
  resultsVisible: true,
  resultsMode: "AFTER_CLOSE",
  allowAbstain: false,
  quorumThreshold: 50,
  voterReminder24h: false,
  options: [{ id: "o1", text: "Ana", orderIndex: 0 }],
  votes: HASHES.map((voteHash) => ({ voteHash })),
  _count: { voters: 4 },
  createdBy: { isPro: false },
};

// Prolazi kroz pravu transakcijsku logiku s tx == mock prisma, pa se čuvar
// statusa i povratak arhive testiraju, a ne zaobilaze.
function runTransaction() {
  vi.mocked(prisma.$transaction).mockImplementation(
    // @ts-expect-error — mock tx nosi samo ono što sealElection dira
    async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  runTransaction();
  vi.mocked(prisma.election.updateMany).mockResolvedValue({ count: 1 });
  vi.mocked(prisma.archive.create).mockResolvedValue({} as never);
});

describe("sealElection", () => {
  it("čuvari su u WHERE klauzuli: id + organizacija + CLOSED", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue(closed as never);
    await sealElection("e1", "org1");

    const where = vi.mocked(prisma.election.findFirst).mock.calls[0]![0]!.where;
    expect(where).toMatchObject({
      id: "e1",
      organizationId: "org1",
      status: "CLOSED",
    });
  });

  it("nema izbora (tuđa organizacija ili nije CLOSED) → invalidStatus, bez pisanja", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue(null);

    await expect(sealElection("e1", "org1")).rejects.toThrow(ArchiveError);
    await expect(sealElection("e1", "org1")).rejects.toMatchObject({
      code: "invalidStatus",
    });
    expect(prisma.archive.create).not.toHaveBeenCalled();
    expect(prisma.election.updateMany).not.toHaveBeenCalled();
  });

  it("korijen u redu arhive je onaj koji gradi merkle.service", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue(closed as never);
    const res = await sealElection("e1", "org1");

    const expected = buildMerkleTree(HASHES).root;
    expect(res.merkleRoot).toBe(expected);
    expect(res.votesSealed).toBe(3);

    const data = vi.mocked(prisma.archive.create).mock.calls[0]![0]!.data;
    expect(data.merkleRoot).toBe(expected);
    expect(data.electionId).toBe("e1");
  });

  it("proofData nosi ugovor algoritma i sortirane listove", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue(closed as never);
    await sealElection("e1", "org1");

    const data = vi.mocked(prisma.archive.create).mock.calls[0]![0]!
      .data as never as { proofData: Record<string, unknown> };
    expect(data.proofData).toMatchObject({
      algorithm: "sha256-hex-concat/dup-last/lex-asc",
      leafOrdering: "lexicographic-asc",
    });
    expect(data.proofData.leaves).toEqual([leaf("1"), leaf("2"), leaf("3")]);
    // Putevi se NE spremaju — izvedivi su iz stabla.
    expect(data.proofData).not.toHaveProperty("paths");
    expect(Array.isArray(data.proofData.tree)).toBe(true);
  });

  it("snimka nosi konfiguraciju i zbrojeve, a NIJEDAN podatak o biračima", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue(closed as never);
    await sealElection("e1", "org1");

    const data = vi.mocked(prisma.archive.create).mock.calls[0]![0]!
      .data as never as { electionData: Record<string, unknown> };
    const snap = data.electionData;

    expect(snap).toMatchObject({
      title: "Studentski izbori",
      electionType: "STANDARD",
      votingType: "SINGLE_CHOICE",
      counts: { voters: 4, votesCast: 3, turnoutPct: 75 },
    });
    expect(snap.sealedAt).toEqual(expect.any(String));
    expect(snap.options).toEqual([{ id: "o1", text: "Ana", orderIndex: 0 }]);

    // Anonimnost: ništa o biračima ni o pojedinačnim listićima u snimci.
    const serialised = JSON.stringify(snap);
    for (const forbidden of ["email", "voterId", "firstName", "voteHash"]) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it("Free: expiresAt je godina unaprijed; Pro: null — čita se createdBy, ne sesija", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue(closed as never);
    await sealElection("e1", "org1");
    const free = vi.mocked(prisma.archive.create).mock.calls[0]![0]!.data
      .expiresAt as Date;
    expect(free).toBeInstanceOf(Date);
    const days = (free.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(364);
    expect(days).toBeLessThan(366);

    vi.clearAllMocks();
    runTransaction();
    vi.mocked(prisma.election.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.archive.create).mockResolvedValue({} as never);
    vi.mocked(prisma.election.findFirst).mockResolvedValue({
      ...closed,
      createdBy: { isPro: true },
    } as never);

    await sealElection("e1", "org1");
    expect(
      vi.mocked(prisma.archive.create).mock.calls[0]![0]!.data.expiresAt,
    ).toBeNull();
  });

  it("prelaz je atomičan: status u WHERE, count 0 baca i povlači arhivu", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue(closed as never);
    vi.mocked(prisma.election.updateMany).mockResolvedValue({ count: 0 });

    await expect(sealElection("e1", "org1")).rejects.toMatchObject({
      code: "invalidStatus",
    });

    const where = vi.mocked(prisma.election.updateMany).mock.calls[0]![0]!.where;
    expect(where).toMatchObject({
      id: "e1",
      organizationId: "org1",
      status: "CLOSED",
    });
    // Arhiva je bila kreirana unutar iste transakcije, pa bacanje je povlači.
    expect(prisma.archive.create).toHaveBeenCalled();
  });

  it("izbori bez glasova se pečate legalno", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue({
      ...closed,
      votes: [],
      _count: { voters: 0 },
    } as never);

    const res = await sealElection("e1", "org1");
    expect(res.votesSealed).toBe(0);
    expect(res.merkleRoot).toBe(buildMerkleTree([]).root);
  });
});
