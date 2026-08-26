import { beforeEach, describe, expect, it, vi } from "vitest";

// Izolacija organizacija (invarijanta #3) živi u WHERE klauzuli, pa se i pinja
// na ulazu: mockovi vraćaju prazno, a tvrdnje gledaju SAMO što je Prisma dobila.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    election: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

const { prisma } = await import("@/lib/prisma");
const db = await import("@/lib/db/elections");

const ORG = "org_a";

const firstWhere = (call = 0) =>
  vi.mocked(prisma.election.findFirst).mock.calls[call]![0]!.where;
const manyWhere = (call = 0) =>
  vi.mocked(prisma.election.findMany).mock.calls[call]![0]!.where;

beforeEach(() => {
  vi.mocked(prisma.election.findFirst).mockReset().mockResolvedValue(null);
  vi.mocked(prisma.election.findUnique).mockReset().mockResolvedValue(null);
  vi.mocked(prisma.election.findMany).mockReset().mockResolvedValue([]);
  vi.mocked(prisma.election.count).mockReset().mockResolvedValue(25);
});

// Svaki upit koji prima id izbora prima i organizaciju iz sesije. Ispadne li
// organizationId, tuđi id prestaje vraćati null i stranica ga otvori.
type Scoped = {
  name: string;
  fn: (id: string, organizationId: string) => Promise<unknown>;
};

const scoped: Scoped[] = [
  { name: "getElectionDetail", fn: db.getElectionDetail },
  { name: "getElectionStartInfo", fn: db.getElectionStartInfo },
  { name: "getElectionOverview", fn: db.getElectionOverview },
  { name: "getBallotPreview", fn: db.getBallotPreview },
  { name: "getElectionResults", fn: db.getElectionResults },
  { name: "getElectionTurnout", fn: db.getElectionTurnout },
  { name: "getVoterRosterForExport", fn: db.getVoterRosterForExport },
  { name: "getStoredReport", fn: db.getStoredReport },
];

describe("upiti po id-u izbora", () => {
  it.each(scoped)("$name traži i id i organizationId", async ({ fn }) => {
    await fn("el_1", ORG);

    expect(firstWhere()).toEqual({ id: "el_1", organizationId: ORG });
  });
});

// Popisi nemaju id u URL-u, pa je organizacija jedini filtar koji ih dijeli.
describe("popisi po organizaciji", () => {
  type Listed = { name: string; run: () => Promise<unknown>; where: object };

  const listed: Listed[] = [
    {
      name: "getDashboardData",
      run: () => db.getDashboardData(ORG),
      where: { organizationId: ORG },
    },
    {
      name: "getElectionsByStatus",
      run: () => db.getElectionsByStatus(ORG),
      where: { organizationId: ORG },
    },
    {
      name: "getArchivedElections",
      run: () => db.getArchivedElections(ORG),
      where: { organizationId: ORG, status: "ARCHIVED" },
    },
  ];

  it.each(listed)("$name filtrira po organizaciji", async ({ run, where }) => {
    await run();

    expect(manyWhere()).toEqual(where);
  });

  it("status se dodaje uz organizaciju, ne umjesto nje", async () => {
    await db.getElectionsByStatus(ORG, "CLOSED");

    expect(manyWhere()).toEqual({ organizationId: ORG, status: "CLOSED" });
  });

  // I `count` mora nositi organizaciju: nezaštićen bi vratio koliko izbora ima
  // cijela platforma i taj broj bi se ispisao kao ukupan broj ove organizacije.
  it("getElectionsPage scopa i brojanje i dohvat", async () => {
    await db.getElectionsPage(ORG, 1, 10);

    expect(
      vi.mocked(prisma.election.count).mock.calls[0]![0]!.where,
    ).toEqual({ organizationId: ORG });
    expect(manyWhere()).toEqual({ organizationId: ORG });
  });
});

// Jedini upit nad izborima bez organizacije — posjetitelj javne stranice je
// nema. Namjerno, pa je pinjan kao iznimka: doda li mu netko organizationId,
// javna stranica prestaje raditi; prepiše li netko ovaj oblik u administratorski
// upit, nestaje izolacija. Oba slučaja moraju srušiti imenovani test.
describe("getPublicResultsElection — namjerna iznimka", () => {
  it("traži samo id, bez organizationId", async () => {
    await db.getPublicResultsElection("el_1");

    expect(
      vi.mocked(prisma.election.findUnique).mock.calls[0]![0]!.where,
    ).toEqual({ id: "el_1" });
  });

  // `select` je granica anonimnosti: stranica je svjetski čitljiva, pa bi
  // dodan `voters` ili `votes` odao e-mail adrese, odnosno vrijeme listića.
  it("select ne nosi retke birača, vrijeme listića ni kontakt organizacije", async () => {
    await db.getPublicResultsElection("el_1");
    const select = vi.mocked(prisma.election.findUnique).mock.calls[0]![0]!
      .select as Record<string, unknown>;

    expect(select).not.toHaveProperty("voters");
    expect(select).not.toHaveProperty("votes");
    expect(select.organization).toEqual({ select: { name: true } });
  });
});
