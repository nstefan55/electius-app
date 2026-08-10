import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    election: { findFirst: vi.fn() },
    voter: { count: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
  },
}));

const { prisma } = await import("@/lib/prisma");
const { getVoterRoster } = await import("@/lib/db/voters");

// Prvi voter.count je `matched` (pod filtrom), drugi je broj neisporučenih na
// cijelim izborima — Promise.all zove argumente redom, pa je poredak određen.
const whereOf = (call: number) =>
  vi.mocked(prisma.voter.count).mock.calls[call]![0]!.where!;

const row = (over: Record<string, unknown> = {}) => ({
  id: "v1",
  firstName: "Ana",
  lastName: "Horvat",
  email: "ana@example.com",
  status: "INVITED",
  deliveryFailedAt: null,
  ...over,
});

beforeEach(() => {
  vi.mocked(prisma.election.findFirst).mockReset();
  vi.mocked(prisma.election.findFirst).mockResolvedValue({
    _count: { votes: 3, voters: 10 },
  } as never);
  vi.mocked(prisma.voter.count).mockReset();
  vi.mocked(prisma.voter.count).mockResolvedValue(0);
  vi.mocked(prisma.voter.groupBy).mockReset();
  vi.mocked(prisma.voter.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.voter.findMany).mockReset();
  vi.mocked(prisma.voter.findMany).mockResolvedValue([]);
});

describe("getVoterRoster — the FAILED filter (§Faza 4)", () => {
  // "FAILED" dijeli padajući izbornik i URL parametar sa statusima, ali NIJE
  // status: birač kojem je dostava pala i dalje je PENDING ili INVITED, jer je
  // status red za ponavljanje (invarijanta #7). Spoji li ih netko u jednu granu,
  // WHERE dobije status koji enum ne poznaje.
  it("gađa stupac dostave, a status ostavlja na miru", async () => {
    await getVoterRoster("el_1", "org_1", { status: "FAILED" });

    expect(whereOf(0)).toMatchObject({
      electionId: "el_1",
      deliveryFailedAt: { not: null },
    });
    expect(whereOf(0)).not.toHaveProperty("status");
  });

  it("običan status i dalje gađa status, ne dostavu", async () => {
    await getVoterRoster("el_1", "org_1", { status: "INVITED" });

    expect(whereOf(0)).toMatchObject({ electionId: "el_1", status: "INVITED" });
    expect(whereOf(0)).not.toHaveProperty("deliveryFailedAt");
  });

  // Brojka služi tome da se filtar uopće poželi uključiti, pa mora vrijediti za
  // cijele izbore. Pod filtrom pretrage bi znala pokazati 0 dok kvarova ima.
  it("broji neisporučene na cijelim izborima, bez pretrage i filtra", async () => {
    await getVoterRoster("el_1", "org_1", { q: "ana", status: "INVITED" });

    expect(whereOf(1)).toEqual({
      electionId: "el_1",
      deliveryFailedAt: { not: null },
    });
  });

  it("vraća broj neisporučenih iz zasebnog upita", async () => {
    vi.mocked(prisma.voter.count)
      .mockResolvedValueOnce(10) // matched
      .mockResolvedValueOnce(2); // deliveryFailed

    const roster = await getVoterRoster("el_1", "org_1");

    expect(roster?.deliveryFailed).toBe(2);
  });
});

describe("getVoterRoster — što prelazi na klijenta", () => {
  // Vremenska oznaka ostaje na poslužitelju: redak prikazuje samo DA adresa ne
  // radi. Spread retka umjesto projekcije proturio bi datum — TypeScript to ne
  // hvata, jer višak polja preživi u izvođenju (isti trap kao GDPR izvoz).
  it("nosi činjenicu, ne datum", async () => {
    vi.mocked(prisma.voter.findMany).mockResolvedValue([
      row({ deliveryFailedAt: new Date("2026-08-10T09:00:00Z") }),
      row({ id: "v2", email: "b@example.com" }),
    ] as never);

    const roster = await getVoterRoster("el_1", "org_1");

    expect(roster!.voters[0]).not.toHaveProperty("deliveryFailedAt");
    expect(roster!.voters[0]!.deliveryFailed).toBe(true);
    expect(roster!.voters[1]!.deliveryFailed).toBe(false);
    // Ništa u serijaliziranom retku ne smije nositi trenutak kvara.
    expect(JSON.stringify(roster!.voters)).not.toContain("2026-08-10");
  });

  it("vraća null za tuđi ili nepostojeći izbor, bez ijednog daljnjeg upita", async () => {
    vi.mocked(prisma.election.findFirst).mockResolvedValue(null);

    expect(await getVoterRoster("el_1", "druga_org")).toBeNull();
    expect(prisma.voter.count).not.toHaveBeenCalled();
    expect(prisma.voter.findMany).not.toHaveBeenCalled();
  });
});
