import { beforeEach, describe, expect, it, vi } from "vitest";

// Isti obrazac kao elections.test.ts: mockiraj prisma + requireSession +
// publication.service, provjeravaj ulaze u mockove — nikad pravu bazu.
// Naglasak je na WHERE klauzulama: one SU sigurnosna granica.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    election: { findFirst: vi.fn() },
    voter: {
      createMany: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));
vi.mock("@/lib/auth/require-session", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/services/publication.service", () => ({
  publishElection: vi.fn(),
  inviteVoter: vi.fn(),
}));
vi.mock("@/lib/services/entitlement.service", () => ({
  resolveEntitlement: vi.fn(),
}));

const { prisma } = await import("@/lib/prisma");
const { requireSession } = await import("@/lib/auth/require-session");
const { publishElection, inviteVoter } = await import(
  "@/lib/services/publication.service"
);
const { resolveEntitlement } = await import(
  "@/lib/services/entitlement.service"
);
const { addVoters, updateVoterName, removeVoter, resendVoterInvite } =
  await import("@/actions/voters");

const session = {
  user: {
    email: "admin@example.com",
    name: "A",
    organization: "Org",
    image: null,
    organizationLogo: null,
    isPro: false,
  },
  organizationId: "org_1",
  accessibility: {
    reduceMotion: false,
    highContrast: false,
    largerText: false,
    focusOutlines: true,
  },
};

// Otvoren prozor je zadana vrijednost: mutationsFrozen čita datume, pa bi ih
// svaki test inače morao ponavljati. Testovi koji ispituju gotove izbore
// prepisuju endsAt eksplicitno.
const OPEN_WINDOW = {
  startsAt: new Date("2026-07-01T00:00:00Z"),
  endsAt: new Date("2099-01-01T00:00:00Z"),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockElection = (value: any) =>
  vi
    .mocked(prisma.election.findFirst)
    .mockResolvedValue(value === null ? null : { ...OPEN_WINDOW, ...value });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSession).mockResolvedValue(session);
  vi.mocked(publishElection).mockResolvedValue({ sent: 0, failed: 0 });
  vi.mocked(inviteVoter).mockResolvedValue("sent");
  vi.mocked(prisma.voter.createMany).mockResolvedValue({ count: 0 });
  vi.mocked(resolveEntitlement).mockResolvedValue({ kind: "pro" });
});

describe("addVoters", () => {
  const rows = [{ name: "Ana Horvat", email: "ana@example.com" }];

  it("rejects a malformed payload before touching the session or DB", async () => {
    expect(await addVoters({ electionId: "", rows })).toEqual({
      success: false,
      error: "invalid",
    });
    expect(await addVoters({ electionId: "e1", rows: [] })).toEqual({
      success: false,
      error: "invalid",
    });
    expect(requireSession).not.toHaveBeenCalled();
    expect(prisma.election.findFirst).not.toHaveBeenCalled();
  });

  it("scopes the lookup to the org AND to a still-open election", async () => {
    mockElection(null);
    const result = await addVoters({ electionId: "e1", rows });

    expect(result).toEqual({ success: false, error: "invalidStatus" });
    const where = vi.mocked(prisma.election.findFirst).mock.calls[0]![0]!.where;
    expect(where).toMatchObject({ id: "e1", organizationId: "org_1" });
    expect(where?.status).toEqual({
      in: ["DRAFT", "SCHEDULED", "ACTIVE"],
    });
    expect(prisma.voter.createMany).not.toHaveBeenCalled();
  });

  it("skips duplicates against the existing roster case-insensitively", async () => {
    mockElection({ status: "DRAFT", voters: [{ email: "ANA@example.com" }] });

    const result = await addVoters({
      electionId: "e1",
      rows: [
        { name: "Ana Horvat", email: "ana@example.com" },
        { name: "Ivan Ivić", email: "ivan@example.com" },
      ],
    });

    expect(result).toMatchObject({ success: true, added: 1, skipped: 1 });
    const data = vi.mocked(prisma.voter.createMany).mock.calls[0]![0]!.data;
    expect(data).toEqual([
      {
        electionId: "e1",
        email: "ivan@example.com",
        firstName: "Ivan",
        lastName: "Ivić",
      },
    ]);
  });

  it("dedupes within the payload itself", async () => {
    mockElection({ status: "DRAFT", voters: [] });

    const result = await addVoters({
      electionId: "e1",
      rows: [
        { name: "Ana Horvat", email: "ana@example.com" },
        { name: "Ana Duplikat", email: "ANA@EXAMPLE.COM" },
      ],
    });

    expect(result).toMatchObject({ added: 1, skipped: 1 });
  });

  it("writes nothing when every row is already on the list", async () => {
    mockElection({ status: "DRAFT", voters: [{ email: "ana@example.com" }] });

    const result = await addVoters({ electionId: "e1", rows });

    expect(result).toEqual({ success: true, added: 0, skipped: 1 });
    expect(prisma.voter.createMany).not.toHaveBeenCalled();
    expect(publishElection).not.toHaveBeenCalled();
  });

  it("splits the name on the first space and nulls a missing surname", async () => {
    mockElection({ status: "DRAFT", voters: [] });

    await addVoters({
      electionId: "e1",
      rows: [
        { name: "Ana Marija Horvat", email: "a@example.com" },
        { name: "Cher", email: "c@example.com" },
      ],
    });

    expect(vi.mocked(prisma.voter.createMany).mock.calls[0]![0]!.data).toEqual([
      {
        electionId: "e1",
        email: "a@example.com",
        firstName: "Ana",
        lastName: "Marija Horvat",
      },
      {
        electionId: "e1",
        email: "c@example.com",
        firstName: "Cher",
        lastName: null,
      },
    ]);
  });

  it("invites immediately on an ACTIVE election (odluka 2026-07-26)", async () => {
    mockElection({ status: "ACTIVE", voters: [] });
    vi.mocked(publishElection).mockResolvedValue({ sent: 1, failed: 0 });

    const result = await addVoters({ electionId: "e1", rows });

    expect(publishElection).toHaveBeenCalledWith("e1");
    expect(result).toEqual({ success: true, added: 1, skipped: 0, sent: 1, failed: 0 });
  });

  it("still adds the voters when the window is over, but reports nothing was sent", async () => {
    // Birači pripadaju popisu bez obzira na rok — samo poveznica ne ide.
    mockElection({ status: "ACTIVE", voters: [] });
    vi.mocked(publishElection).mockResolvedValue({
      sent: 0,
      failed: 0,
      blocked: "windowOver",
    });

    expect(await addVoters({ electionId: "e1", rows })).toEqual({
      success: true,
      added: 1,
      skipped: 0,
      sent: 0,
      failed: 0,
      blocked: "windowOver",
    });
  });

  it("does not send on an election that has not opened yet", async () => {
    mockElection({ status: "SCHEDULED", voters: [] });

    const result = await addVoters({ electionId: "e1", rows });

    expect(publishElection).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, added: 1, skipped: 0 });
  });

  it("still reports success when the send pipeline throws", async () => {
    // Birači su upisani — neuspjelo slanje ih ostavlja PENDING i ponovljivima.
    mockElection({ status: "ACTIVE", voters: [] });
    vi.mocked(publishElection).mockRejectedValue(new Error("resend down"));

    expect(await addVoters({ electionId: "e1", rows })).toMatchObject({
      success: true,
      added: 1,
    });
  });
});

describe("updateVoterName", () => {
  // Akcija sada prvo čita birača (prozor je usporedba stupca sa stupcem i ne
  // može u WHERE), pa svaki test mora ponuditi izbore uz njega.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockVoter = (election: any) =>
    vi
      .mocked(prisma.voter.findFirst)
      .mockResolvedValue({ election: { ...OPEN_WINDOW, ...election } } as never);

  it("scopes the write to the session org through the election relation", async () => {
    mockVoter({ status: "ACTIVE" });
    vi.mocked(prisma.voter.updateMany).mockResolvedValue({ count: 1 });

    const result = await updateVoterName({
      voterId: "v1",
      firstName: "Ana",
      lastName: "Horvat",
    });

    expect(result).toEqual({ success: true });
    expect(vi.mocked(prisma.voter.updateMany).mock.calls[0]![0]!).toEqual({
      where: {
        id: "v1",
        election: {
          organizationId: "org_1",
          status: { in: ["DRAFT", "SCHEDULED", "ACTIVE"] },
        },
      },
      data: { firstName: "Ana", lastName: "Horvat" },
    });
  });

  it("stores an empty field as null rather than an empty string", async () => {
    mockVoter({ status: "ACTIVE" });
    vi.mocked(prisma.voter.updateMany).mockResolvedValue({ count: 1 });

    await updateVoterName({ voterId: "v1", firstName: "Ana", lastName: "  " });

    expect(vi.mocked(prisma.voter.updateMany).mock.calls[0]![0]!.data).toEqual({
      firstName: "Ana",
      lastName: null,
    });
  });

  it("reports forbidden when the read matches nothing (cross-org id)", async () => {
    vi.mocked(prisma.voter.findFirst).mockResolvedValue(null);

    expect(
      await updateVoterName({ voterId: "v1", firstName: "A", lastName: "B" }),
    ).toEqual({ success: false, error: "forbidden" });
    expect(prisma.voter.updateMany).not.toHaveBeenCalled();
  });

  // G5 — zahtjev 3. Prije je ime birača bilo promjenjivo na SVAKOM statusu.
  it.each(["CLOSED", "ARCHIVED"] as const)(
    "writes nothing on %s",
    async (status) => {
      mockVoter({ status });

      expect(
        await updateVoterName({ voterId: "v1", firstName: "A", lastName: "B" }),
      ).toEqual({ success: false, error: "electionEnded" });
      expect(prisma.voter.updateMany).not.toHaveBeenCalled();
    },
  );

  it("writes nothing on an ACTIVE election whose window is over", async () => {
    mockVoter({
      status: "ACTIVE",
      startsAt: new Date("2026-07-01T00:00:00Z"),
      endsAt: new Date("2026-07-10T00:00:00Z"),
    });

    expect(
      await updateVoterName({ voterId: "v1", firstName: "A", lastName: "B" }),
    ).toEqual({ success: false, error: "electionEnded" });
    expect(prisma.voter.updateMany).not.toHaveBeenCalled();
  });
});

describe("removeVoter", () => {
  it("carries org, election status and voter status in one WHERE", async () => {
    vi.mocked(prisma.voter.deleteMany).mockResolvedValue({ count: 1 });

    const result = await removeVoter("v1");

    expect(result).toEqual({ success: true });
    expect(vi.mocked(prisma.voter.deleteMany).mock.calls[0]![0]!.where).toEqual({
      id: "v1",
      status: { not: "VOTED" },
      election: {
        organizationId: "org_1",
        status: { in: ["DRAFT", "SCHEDULED"] },
      },
    });
  });

  it("no-ops when nothing matches — a VOTED voter or a running election", async () => {
    vi.mocked(prisma.voter.deleteMany).mockResolvedValue({ count: 0 });

    expect(await removeVoter("v1")).toEqual({
      success: false,
      error: "invalidStatus",
    });
  });

  it("rejects an empty id without touching the DB", async () => {
    expect(await removeVoter("")).toEqual({ success: false, error: "invalid" });
    expect(prisma.voter.deleteMany).not.toHaveBeenCalled();
  });
});

describe("resendVoterInvite", () => {
  const OPENS = new Date("2026-07-20T00:00:00Z");
  const CLOSES = new Date("2030-01-01T00:00:00Z");
  const voter = {
    status: "INVITED",
    election: {
      title: "Izbori",
      startsAt: OPENS,
      endsAt: CLOSES,
      organization: { name: "Org" },
    },
  };

  it("requires an ACTIVE election, the right org, and a voter who has not voted", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.voter.findFirst).mockResolvedValue(voter as any);

    const result = await resendVoterInvite("v1");

    expect(result).toEqual({ success: true });
    expect(vi.mocked(prisma.voter.findFirst).mock.calls[0]![0]!.where).toEqual({
      id: "v1",
      status: { not: "VOTED" },
      election: { organizationId: "org_1", status: "ACTIVE" },
    });
  });

  it("reuses the shared single-voter send path with the current status", async () => {
    vi.mocked(prisma.voter.findFirst).mockResolvedValue({
      ...voter,
      status: "PENDING",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await resendVoterInvite("v1");

    expect(inviteVoter).toHaveBeenCalledWith("v1", "PENDING", {
      title: "Izbori",
      organizationName: "Org",
      startsAt: OPENS,
      endsAt: CLOSES,
    });
  });

  it("surfaces a window-over refusal instead of reporting success", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.voter.findFirst).mockResolvedValue(voter as any);
    vi.mocked(inviteVoter).mockResolvedValue("windowOver");

    // Tiho "uspjeh" bi admin pročitao kao "poveznica je poslana".
    expect(await resendVoterInvite("v1")).toEqual({
      success: false,
      error: "windowOver",
    });
  });

  it("refuses when the WHERE matches nothing, without sending", async () => {
    vi.mocked(prisma.voter.findFirst).mockResolvedValue(null);

    expect(await resendVoterInvite("v1")).toEqual({
      success: false,
      error: "invalidStatus",
    });
    expect(inviteVoter).not.toHaveBeenCalled();
  });
});

// Granica birača (entitlement-enforcement-spec §4). Free 50 / Pro 500, po
// izborima. Nazivnik su Voter redci, isto kao izlaznost i kvorum.
describe("addVoters — granica plana", () => {
  const rows = (n: number, prefix = "new") =>
    Array.from({ length: n }, (_, i) => ({
      name: `V ${i}`,
      email: `${prefix}${i}@example.com`,
    }));

  const existing = (n: number, prefix = "old") =>
    Array.from({ length: n }, (_, i) => ({ email: `${prefix}${i}@example.com` }));

  beforeEach(() => {
    vi.mocked(resolveEntitlement).mockResolvedValue({ kind: "free" });
  });

  it("točno na granici prolazi", async () => {
    mockElection({ status: "DRAFT", voters: existing(49) });

    const res = await addVoters({ electionId: "e1", rows: rows(1) });

    expect(res.success).toBe(true);
    expect(prisma.voter.createMany).toHaveBeenCalled();
  });

  it("jedan preko granice je odbijen i NE upisuje ništa", async () => {
    mockElection({ status: "DRAFT", voters: existing(50) });

    const res = await addVoters({ electionId: "e1", rows: rows(1) });

    expect(res).toEqual({
      success: false,
      error: "voterCap",
      cap: 50,
      current: 50,
    });
    // Zaštita koja odbija NAKON upisa gora je od nikakve zaštite.
    expect(prisma.voter.createMany).not.toHaveBeenCalled();
  });

  it("ponovno učitan isti CSV na granici prolazi — broji se fresh, ne rows", async () => {
    // Organizacija na Free planu s 50 birača ponovno učita istih 50 redaka.
    // Formula `existing + rows.length` odbila bi ovo (50 + 50 > 50) iako
    // deduplikacija ne ostavlja nijedan redak za upis.
    mockElection({ status: "DRAFT", voters: existing(50, "dup") });

    const res = await addVoters({ electionId: "e1", rows: rows(50, "dup") });

    expect(res).toEqual({ success: true, added: 0, skipped: 50 });
    expect(prisma.voter.createMany).not.toHaveBeenCalled();
  });

  it("Pro nosi 500, pa isti popis koji Free odbija prolazi", async () => {
    vi.mocked(resolveEntitlement).mockResolvedValue({ kind: "pro" });
    mockElection({ status: "DRAFT", voters: existing(50) });

    const res = await addVoters({ electionId: "e1", rows: rows(1) });

    expect(res.success).toBe(true);
  });

  it("Pro odbija tek na 501", async () => {
    vi.mocked(resolveEntitlement).mockResolvedValue({ kind: "pro" });
    mockElection({ status: "DRAFT", voters: existing(500) });

    const res = await addVoters({ electionId: "e1", rows: rows(1) });

    expect(res).toEqual({
      success: false,
      error: "voterCap",
      cap: 500,
      current: 500,
    });
    expect(prisma.voter.createMany).not.toHaveBeenCalled();
  });

  it("pravo se razrješava za TE izbore, ne samo za organizaciju", async () => {
    mockElection({ status: "DRAFT", voters: existing(0) });

    await addVoters({ electionId: "e1", rows: rows(1) });

    // electionId mora stići do resolvera, inače kupnja pojedinog izbora nikad
    // neće moći podići granicu samo tim izborima.
    expect(resolveEntitlement).toHaveBeenCalledWith("e1", "org_1");
  });

});

// G4 — zahtjev 3. Prije se redak UPISIVAO pa bi samo slanje bilo blokirano;
// birači bi ušli u nazivnik izlaznosti gotovih izbora i mogli postignuti
// kvorum gurnuti ispod praga.
describe("addVoters — izbori kojima je rok prošao", () => {
  const rows = [{ name: "Ana Horvat", email: "ana@example.com" }];
  const ENDED = {
    startsAt: new Date("2026-07-01T00:00:00Z"),
    endsAt: new Date("2026-07-10T00:00:00Z"),
  };

  it("odbija upis u ACTIVE izbore kojima je prozor gotov", async () => {
    mockElection({ status: "ACTIVE", ...ENDED, voters: [] });

    const res = await addVoters({ electionId: "e1", rows });

    expect(res).toEqual({ success: false, error: "electionEnded" });
    // Zaštita koja odbija NAKON upisa gora je od nikakve zaštite.
    expect(prisma.voter.createMany).not.toHaveBeenCalled();
    expect(publishElection).not.toHaveBeenCalled();
  });

  it("odbijanje ide neuspješnim putem, nikad kroz `blocked`", async () => {
    mockElection({ status: "ACTIVE", ...ENDED, voters: [] });

    const res = await addVoters({ electionId: "e1", rows });

    // `blocked` je kvalifikator uspjeha; dijalog ga čita tek nakon res.success,
    // pa bi odbijanje kroz njega tiho ispalo u generičku poruku o grešci.
    expect(res.success).toBe(false);
    expect(res.blocked).toBeUndefined();
  });

  it("odbija prije deduplikacije i granice — sadržaj popisa ne mijenja odgovor", async () => {
    mockElection({
      status: "ACTIVE",
      ...ENDED,
      voters: [{ email: "ana@example.com" }],
    });

    // Svi redci su duplikati; bez provjere prozora ovo bi vratilo uspjeh.
    const res = await addVoters({ electionId: "e1", rows });

    expect(res).toEqual({ success: false, error: "electionEnded" });
    expect(resolveEntitlement).not.toHaveBeenCalled();
  });

  it("i dalje prima birače dok je prozor otvoren", async () => {
    mockElection({ status: "ACTIVE", voters: [] });

    const res = await addVoters({ electionId: "e1", rows });

    expect(res.success).toBe(true);
    expect(prisma.voter.createMany).toHaveBeenCalled();
  });
});
