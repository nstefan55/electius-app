import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the two seams (DB + session) per the action-test pattern.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    election: { create: vi.fn() },
  },
}));
vi.mock("@/lib/auth/require-session", () => ({
  requireSession: vi.fn(),
}));
vi.mock("@/lib/services/entitlement.service", () => ({
  resolveEntitlement: vi.fn(),
}));

const { prisma } = await import("@/lib/prisma");
const { requireSession } = await import("@/lib/auth/require-session");
const { resolveEntitlement } = await import(
  "@/lib/services/entitlement.service"
);
const { createElection } = await import("@/actions/create-election");

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

const basePayload = {
  title: "Student council",
  description: "",
  electionType: "STANDARD",
  votingType: "SINGLE_CHOICE",
  allowAbstain: false,
  candidates: [{ name: "Ana" }, { name: "Marko", role: "2nd year" }],
  voters: [
    { name: "Petra Novak", email: "petra@unizg.hr" },
    { name: "Petra Dupe", email: "PETRA@unizg.hr" }, // dupe, case-insensitive
    { name: "Luka", email: "luka@unizg.hr" },
  ],
  startMode: "manual",
  startAt: "",
  closeAt: "2999-06-01T12:00",
  liveResults: false,
  quorumThreshold: null,
  adminTurnoutReminder: false,
  voterReminder24h: false,
};

beforeEach(() => {
  vi.mocked(requireSession).mockResolvedValue(session);
  vi.mocked(prisma.user.findUnique)
    .mockReset()
    .mockResolvedValue({ id: "user_1" } as never);
  vi.mocked(prisma.election.create)
    .mockReset()
    .mockResolvedValue({ id: "elc_1" } as never);
  vi.mocked(resolveEntitlement).mockReset().mockResolvedValue({ kind: "pro" });
});

describe("createElection", () => {
  it("rejects malformed input before touching the session", async () => {
    const result = await createElection({ title: 42 });
    expect(result).toEqual({ success: false, error: "invalid" });
    expect(requireSession).not.toHaveBeenCalled();
  });

  it("enforces the type/method coupling server-side", async () => {
    const result = await createElection({
      ...basePayload,
      electionType: "SURVEY",
      votingType: "SINGLE_CHOICE",
    });
    expect(result).toEqual({ success: false, error: "coupling" });
  });

  it("requires two candidates for a full create but not for a draft", async () => {
    const one = { ...basePayload, candidates: [{ name: "Ana" }] };
    expect(await createElection(one)).toEqual({
      success: false,
      error: "candidates",
    });
    expect(await createElection(one, true)).toEqual({
      success: true,
      data: { id: "elc_1" },
    });
  });

  it("requires a valid window when scheduled: close after start", async () => {
    const result = await createElection({
      ...basePayload,
      startMode: "scheduled",
      startAt: "2999-06-02T12:00",
      closeAt: "2999-06-01T12:00",
    });
    expect(result).toEqual({ success: false, error: "schedule" });
  });

  it("creates DRAFT for manual start, dedupes voters and splits names", async () => {
    const result = await createElection(basePayload);
    expect(result).toEqual({ success: true, data: { id: "elc_1" } });

    const arg = vi.mocked(prisma.election.create).mock.calls[0][0];
    expect(arg.data.status).toBe("DRAFT");
    expect(arg.data.organizationId).toBe("org_1");
    expect(arg.data.createdById).toBe("user_1");
    expect(arg.data.options!.create).toEqual([
      { text: "Ana", description: null, orderIndex: 0 },
      { text: "Marko", description: "2nd year", orderIndex: 1 },
    ]);
    // dupe email dropped; "Petra Novak" split into first/last
    expect(arg.data.voters!.create).toEqual([
      { email: "petra@unizg.hr", firstName: "Petra", lastName: "Novak" },
      { email: "luka@unizg.hr", firstName: "Luka", lastName: null },
    ]);
  });

  it("creates SCHEDULED with the chosen window when start is scheduled", async () => {
    await createElection({
      ...basePayload,
      startMode: "scheduled",
      startAt: "2999-06-01T09:00",
      closeAt: "2999-06-03T18:00",
    });
    const arg = vi.mocked(prisma.election.create).mock.calls[0][0];
    expect(arg.data.status).toBe("SCHEDULED");
    expect(arg.data.startsAt).toEqual(new Date("2999-06-01T09:00"));
    expect(arg.data.endsAt).toEqual(new Date("2999-06-03T18:00"));
  });

  it("reports failure without leaking the DB error", async () => {
    vi.mocked(prisma.election.create).mockRejectedValue(new Error("db down"));
    expect(await createElection(basePayload)).toEqual({
      success: false,
      error: "failed",
    });
  });
});

// Granica birača (entitlement-enforcement-spec §4). Ista granica kao addVoters,
// samo na drugom ulazu — čarobnjak stvara izbore i popis odjednom.
describe("createElection — granica plana", () => {
  const withVoters = (n: number) => ({
    ...basePayload,
    voters: Array.from({ length: n }, (_, i) => ({
      name: `V ${i}`,
      email: `v${i}@unizg.hr`,
    })),
  });

  beforeEach(() => {
    vi.mocked(resolveEntitlement).mockResolvedValue({ kind: "free" });
  });

  it("točno na granici prolazi", async () => {
    const res = await createElection(withVoters(50));

    expect(res.success).toBe(true);
    expect(prisma.election.create).toHaveBeenCalled();
  });

  it("jedan preko granice je odbijen i NE stvara izbore", async () => {
    const res = await createElection(withVoters(51));

    expect(res).toEqual({ success: false, error: "voterCap", cap: 50 });
    // Odbijanje koje ipak stvori izbore ostavlja pola popisa iza sebe.
    expect(prisma.election.create).not.toHaveBeenCalled();
  });

  it("broji popis nakon deduplikacije", async () => {
    // 51 redak, ali dva su isti birač → 50 stvarnih redaka, dakle prolazi.
    const payload = withVoters(50);
    payload.voters.push({ name: "Dupli", email: "V0@UNIZG.HR" });

    const res = await createElection(payload);

    expect(res.success).toBe(true);
  });

  it("Pro odbija tek na 501", async () => {
    vi.mocked(resolveEntitlement).mockResolvedValue({ kind: "pro" });

    expect((await createElection(withVoters(500))).success).toBe(true);
    expect(await createElection(withVoters(501))).toEqual({
      success: false,
      error: "voterCap",
      cap: 500,
    });
  });

  it("granica vrijedi i za spremanje skice", async () => {
    // Skica bez granice bila bi zaobilaznica: popis se skupi kao skica, pa se
    // objavi. Provjera stoji na jednom mjestu, prije upisa, za oba načina.
    const res = await createElection(withVoters(51), true);

    expect(res).toEqual({ success: false, error: "voterCap", cap: 50 });
    expect(prisma.election.create).not.toHaveBeenCalled();
  });

  it("pravo se razrješava na razini organizacije — izbori još ne postoje", async () => {
    await createElection(withVoters(1));

    expect(resolveEntitlement).toHaveBeenCalledWith(null, "org_1");
  });
});

describe("createElection — rezultati uživo", () => {
  it("zadano piše AFTER_CLOSE, ne ostavlja stupac nedirnut", async () => {
    // Prije ovog reza NIJEDNA korisnička staza nije pisala resultsMode, pa je
    // LIVE grana bila mrtav kod u produkciji. Test pribija da se stupac sada
    // doista upisuje — i kad je prekidač isključen.
    await createElection(basePayload);

    const arg = vi.mocked(prisma.election.create).mock.calls[0][0];
    expect(arg.data.resultsMode).toBe("AFTER_CLOSE");
  });

  it("uključen prekidač piše LIVE", async () => {
    await createElection({ ...basePayload, liveResults: true });

    const arg = vi.mocked(prisma.election.create).mock.calls[0][0];
    expect(arg.data.resultsMode).toBe("LIVE");
  });

  it("Free ne može odabrati LIVE i ništa se ne upisuje", async () => {
    vi.mocked(resolveEntitlement).mockResolvedValue({ kind: "free" });

    const res = await createElection({ ...basePayload, liveResults: true });

    expect(res).toEqual({ success: false, error: "liveResultsLocked" });
    // Odbijanje prije ijednog upisa — inače bi ostali izbori s pravom koje
    // organizacija nema.
    expect(prisma.election.create).not.toHaveBeenCalled();
  });

  it("Free bez LIVE-a prolazi normalno", async () => {
    vi.mocked(resolveEntitlement).mockResolvedValue({ kind: "free" });

    const res = await createElection(basePayload);

    expect(res.success).toBe(true);
  });

  it("zaštita vrijedi i za skicu — inače je skica zaobilaznica", async () => {
    // Isti razlog kao granica birača: LIVE skica samo odgađa isto stanje do
    // trenutka pokretanja izbora.
    vi.mocked(resolveEntitlement).mockResolvedValue({ kind: "free" });

    const res = await createElection({ ...basePayload, liveResults: true }, true);

    expect(res).toEqual({ success: false, error: "liveResultsLocked" });
    expect(prisma.election.create).not.toHaveBeenCalled();
  });
});
