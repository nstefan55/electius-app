import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    election: { findFirst: vi.fn(), updateMany: vi.fn() },
    archive: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

// R2 se ne dira u testu: zanima nas ZOVE li se brisanje i s kojom kantom.
vi.mock("./storage.service", () => ({ deleteObject: vi.fn() }));
vi.mock("./entitlement.service", () => ({ resolveEntitlement: vi.fn() }));

const { prisma } = await import("@/lib/prisma");
const { deleteObject } = await import("./storage.service");
const { resolveEntitlement } = await import("./entitlement.service");
const { sealElection, ArchiveError, pruneExpiredArchives } = await import(
  "./archive.service"
);
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
  vi.mocked(resolveEntitlement).mockResolvedValue({ kind: "free" });
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

  it("Free: expiresAt je godina unaprijed; Pro: null — odlučuje resolver, ne sesija", async () => {
    // Rok više ne dolazi iz vlastitog oneYearFrom uz izravno čitanje
    // createdBy.isPro: računa ga archiveExpiresAt iz prava koje razriješi
    // resolveEntitlement, ista funkcija koju čita i metla (invarijanta #5).
    vi.mocked(prisma.election.findFirst).mockResolvedValue(closed as never);
    await sealElection("e1", "org1");
    const free = vi.mocked(prisma.archive.create).mock.calls[0]![0]!.data
      .expiresAt as Date;
    expect(free).toBeInstanceOf(Date);
    const days = (free.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(364);
    expect(days).toBeLessThan(366);

    // Pravo se traži za TE izbore i TU organizaciju, ne za korisnika iz sesije.
    expect(resolveEntitlement).toHaveBeenCalledWith("e1", "org1");

    vi.clearAllMocks();
    runTransaction();
    vi.mocked(prisma.election.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.archive.create).mockResolvedValue({} as never);
    vi.mocked(resolveEntitlement).mockResolvedValue({ kind: "pro" });
    vi.mocked(prisma.election.findFirst).mockResolvedValue(closed as never);

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

  // D8: izvještaj spremljen dok su izbori bili CLOSED nastao je prije pečata, pa
  // nema Merkle korijen. Bez ništenja bi brzi put zauvijek posluživao taj
  // dokument bez zapisa o integritetu.
  it("pečaćenje ništi sva tri stupca spremljenog izvještaja", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue(closed as never);
    await sealElection("e1", "org1");

    const data = vi.mocked(prisma.election.updateMany).mock.calls[0]![0]!.data;
    expect(data).toMatchObject({
      status: "ARCHIVED",
      reportKey: null,
      reportGeneratedAt: null,
      reportLocale: null,
    });
  });

  it("zastarjeli objekt se briše iz privatne kante nakon commita", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue({
      ...closed,
      reportKey: "reports/e1/abc.pdf",
    } as never);

    await sealElection("e1", "org1");

    expect(deleteObject).toHaveBeenCalledWith("private", "reports/e1/abc.pdf");
  });

  it("bez spremljenog izvještaja se ništa ne briše", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue(closed as never);
    await sealElection("e1", "org1");
    expect(deleteObject).not.toHaveBeenCalled();
  });

  // Zaostali objekt je potrošen prostor; pad brisanja ne smije srušiti pečat,
  // koji je već commitan i nepovratan.
  it("pad brisanja u R2 ne ruši pečaćenje", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue({
      ...closed,
      reportKey: "reports/e1/abc.pdf",
    } as never);
    vi.mocked(deleteObject).mockRejectedValueOnce(new Error("R2 down"));

    await expect(sealElection("e1", "org1")).resolves.toMatchObject({
      votesSealed: 3,
    });
  });
});

// Metla obrezivanja (entitlement-enforcement-spec §6).
describe("pruneExpiredArchives", () => {
  const NOW = new Date("2027-06-01T00:00:00.000Z");

  const candidate = (over: Partial<Record<string, unknown>> = {}) => ({
    id: "a1",
    merkleRoot: "b".repeat(64),
    proofData: {
      algorithm: "sha256-hex-concat/dup-last/lex-asc",
      leafOrdering: "lex-asc",
      leaves: [leaf("1")],
      tree: [[leaf("1")]],
      root: "b".repeat(64),
    },
    // Zapečaćeno prije više od godine dana.
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    election: { id: "e1", organizationId: "org1" },
    ...over,
  });

  beforeEach(() => {
    vi.mocked(prisma.archive.updateMany).mockResolvedValue({ count: 1 });
  });

  it("bira samo istekle i još neobrezane retke", async () => {
    vi.mocked(prisma.archive.findMany).mockResolvedValue([]);

    await pruneExpiredArchives(NOW);

    // prunedAt je stupac upravo zato što negirani JSON path filtar na retku bez
    // ključa vraća NULL i tiho izbaci svaki neobrezani redak.
    expect(vi.mocked(prisma.archive.findMany).mock.calls[0]![0]!.where).toEqual({
      expiresAt: { lte: NOW },
      prunedAt: null,
    });
  });

  it("obrezuje teret dokaza i ostavlja korijen i algoritam", async () => {
    vi.mocked(prisma.archive.findMany).mockResolvedValue([
      candidate(),
    ] as never);

    await expect(pruneExpiredArchives(NOW)).resolves.toEqual({
      pruned: 1,
      kept: 0,
    });

    const call = vi.mocked(prisma.archive.updateMany).mock.calls[0]![0]!;
    expect(call.data).toEqual({
      proofData: {
        pruned: true,
        prunedAt: NOW.toISOString(),
        algorithm: "sha256-hex-concat/dup-last/lex-asc",
        leafOrdering: "lex-asc",
        root: "b".repeat(64),
      },
      prunedAt: NOW,
    });

    // UPDATE, nikad DELETE — redak arhive se ne briše.
    expect(prisma.archive.updateMany).toHaveBeenCalledTimes(1);
    // Isti atomski oblik: prunedAt: null i u WHERE-u.
    expect(call.where).toEqual({ id: "a1", prunedAt: null });
  });

  it("NE dira merkleRoot, electionData ni jedan report* stupac", async () => {
    vi.mocked(prisma.archive.findMany).mockResolvedValue([
      candidate(),
    ] as never);

    await pruneExpiredArchives(NOW);

    // Free plan obećava da se zapis arhive čuva zauvijek; obrezuje se samo
    // teret dokaza (D6). PDF i R2 objekti ostaju netaknuti — nema ni poziva.
    const data = vi.mocked(prisma.archive.updateMany).mock.calls[0]![0]!.data;
    expect(Object.keys(data).sort()).toEqual(["proofData", "prunedAt"]);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("Pro arhivu ne obrezuje iako pečat kaže da je istekla", async () => {
    // Jednosmjerni pečat: stampArchiveRetention ga upiše pri padu na Free, a
    // nitko ga ne briše pri nadogradnji. Metla koja mu vjeruje uništila bi
    // teret dokaza organizaciji koja plaća.
    vi.mocked(resolveEntitlement).mockResolvedValue({ kind: "pro" });
    vi.mocked(prisma.archive.findMany).mockResolvedValue([
      candidate(),
    ] as never);

    await expect(pruneExpiredArchives(NOW)).resolves.toEqual({
      pruned: 0,
      kept: 1,
    });
    expect(prisma.archive.updateMany).not.toHaveBeenCalled();
  });

  it("rok se ponovno izvodi iz prava, pa pečat u budućnosti ne obrezuje", async () => {
    // Zapečaćeno jučer, pečat istekao (npr. ručno pomaknut): pravo kaže da rok
    // još nije došao, i pravo pobjeđuje.
    vi.mocked(prisma.archive.findMany).mockResolvedValue([
      candidate({ createdAt: new Date("2027-05-31T00:00:00.000Z") }),
    ] as never);

    await expect(pruneExpiredArchives(NOW)).resolves.toEqual({
      pruned: 0,
      kept: 1,
    });
    expect(prisma.archive.updateMany).not.toHaveBeenCalled();
  });

  it("prazan prolaz ne dira ništa", async () => {
    vi.mocked(prisma.archive.findMany).mockResolvedValue([]);

    await expect(pruneExpiredArchives(NOW)).resolves.toEqual({
      pruned: 0,
      kept: 0,
    });
    expect(resolveEntitlement).not.toHaveBeenCalled();
    expect(prisma.archive.updateMany).not.toHaveBeenCalled();
  });

  it("razrješava pravo jednom po organizaciji, ne po arhivi", async () => {
    vi.mocked(prisma.archive.findMany).mockResolvedValue([
      candidate({ id: "a1" }),
      candidate({ id: "a2" }),
      candidate({ id: "a3", election: { id: "e9", organizationId: "org2" } }),
    ] as never);

    await pruneExpiredArchives(NOW);

    expect(vi.mocked(resolveEntitlement).mock.calls).toHaveLength(2);
    expect(prisma.archive.updateMany).toHaveBeenCalledTimes(3);
  });
});
