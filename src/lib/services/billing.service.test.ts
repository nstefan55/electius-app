import { beforeEach, describe, expect, it, vi } from "vitest";

// delete i deleteMany su namjerno u mocku iako ih servis ne smije zvati: mock
// bez njih bi pao s "not a function", što dokazuje samo da metoda ne postoji.
// Ovako se tvrdi namjera — pečat arhive NIKAD ne briše redak.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    organization: { updateMany: vi.fn(), findUnique: vi.fn() },
    subscription: { findFirst: vi.fn() },
    archive: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const { prisma } = await import("@/lib/prisma");
const { projectEntitlement, assertProjectionLanded, stampArchiveRetention } =
  await import("@/lib/services/billing.service");

const ORG = "org_electius";
const CUSTOMER = "cus_123";
const SUB = "sub_123";

const T_NOW = new Date("2026-09-11T12:00:00Z");
const T_OLDER = new Date("2026-09-11T11:00:00Z");
const T_NEWER = new Date("2026-09-11T13:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.mocked(prisma.user.updateMany).mockReturnValue("user.updateMany" as never);
  vi.mocked(prisma.archive.update).mockReturnValue("archive.update" as never);
  // Brana redoslijeda prolazi po zadanom; pojedini test ju obara na count 0.
  vi.mocked(prisma.organization.updateMany).mockResolvedValue({ count: 1 } as never);
  // tx JE prisma: interaktivna transakcija zove tx.user.updateMany, pa ovako
  // svaka tvrdnja i dalje gleda iste mockove. Oba oblika $transactiona su
  // podržana jer stampArchiveRetention i dalje šalje polje.
  vi.mocked(prisma.$transaction).mockImplementation((async (arg: unknown) => {
    if (typeof arg === "function") return (arg as (tx: unknown) => unknown)(prisma);
    return [];
  }) as never);
});

/** Argumenti n-tog poziva user.updateMany. */
function updateCall(index: number) {
  return vi.mocked(prisma.user.updateMany).mock.calls[index]![0]!;
}

/** Argumenti n-tog poziva organization.updateMany (brana redoslijeda). */
function orgCall(index: number) {
  return vi.mocked(prisma.organization.updateMany).mock.calls[index]![0]!;
}

/** Minimalan Stripe.Event za assertProjectionLanded. */
function subscriptionEvent(created: Date, id = SUB) {
  return {
    id: "evt_1",
    type: "customer.subscription.updated",
    created: Math.floor(created.getTime() / 1000),
    data: { object: { object: "subscription", id } },
  } as never;
}

describe("projectEntitlement", () => {
  it("pravo je organizacijsko: piše po organizationId, nikad po korisniku", async () => {
    await projectEntitlement(
      "complete",
      ORG,
      { status: "active", stripeSubscriptionId: SUB, stripeCustomerId: CUSTOMER },
      subscriptionEvent(T_NOW),
    );

    const isProWrite = updateCall(0);
    expect(isProWrite.where).toEqual({ organizationId: ORG });
    expect(isProWrite.data).toEqual({ isPro: true });
    // Ključanje po korisniku iz sesije bio bi bug nevidljiv do dana kad
    // organizacija dobije drugog administratora.
    expect(JSON.stringify(isProWrite.where)).not.toContain("id\":\"user");
  });

  it("id pretplate ide samo na redak kupca — kolona je @unique", async () => {
    await projectEntitlement(
      "complete",
      ORG,
      { status: "active", stripeSubscriptionId: SUB, stripeCustomerId: CUSTOMER },
      subscriptionEvent(T_NOW),
    );

    const subWrite = updateCall(1);
    expect(subWrite.where).toEqual({
      organizationId: ORG,
      stripeCustomerId: CUSTOMER,
    });
    expect(subWrite.data).toEqual({ stripeSubscriptionId: SUB });
  });

  it("svi upisi idu u JEDNU transakciju", async () => {
    await projectEntitlement(
      "update",
      ORG,
      { status: "active", stripeSubscriptionId: SUB, stripeCustomerId: CUSTOMER },
      subscriptionEvent(T_NOW),
    );

    // isPro true bez id-a pretplate znači subscriptionBlocks false, dakle račun
    // s aktivnom pretplatom postaje obrisiv — zato ne smiju pasti odvojeno.
    // Marker redoslijeda je u istoj transakciji iz istog razloga: da se ne može
    // pomaknuti bez prava koje opisuje.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(typeof vi.mocked(prisma.$transaction).mock.calls[0]![0]).toBe("function");
  });

  it("canceled: isPro false I stripeSubscriptionId null", async () => {
    await projectEntitlement(
      "deleted",
      ORG,
      { status: "canceled", stripeSubscriptionId: SUB, stripeCustomerId: CUSTOMER },
      subscriptionEvent(T_NOW),
    );

    expect(updateCall(0).data).toEqual({ isPro: false });
    expect(updateCall(1).data).toEqual({ stripeSubscriptionId: null });
  });

  it("trialing i past_due ostaju Pro (faza 1 D5)", async () => {
    for (const status of ["trialing", "past_due"]) {
      vi.clearAllMocks();
      vi.mocked(prisma.organization.updateMany).mockResolvedValue({ count: 1 } as never);
      vi.mocked(prisma.$transaction).mockImplementation((async (arg: unknown) =>
        typeof arg === "function" ? (arg as (tx: unknown) => unknown)(prisma) : []) as never);
      await projectEntitlement("update", ORG, { status, stripeCustomerId: CUSTOMER }, subscriptionEvent(T_NOW));
      expect(updateCall(0).data).toEqual({ isPro: true });
    }
  });

  it("nepoznat status ne daje Pro", async () => {
    await projectEntitlement("update", ORG, { status: "paused" }, subscriptionEvent(T_NOW));
    expect(updateCall(0).data).toEqual({ isPro: false });
  });

  it("bez stripeCustomerId piše samo isPro — @unique kolona se ne dira naslijepo", async () => {
    await projectEntitlement(
      "update",
      ORG,
      { status: "active", stripeSubscriptionId: SUB },
      subscriptionEvent(T_NOW),
    );

    expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
    expect(updateCall(0).data).toEqual({ isPro: true });
  });
});

// Regresija iz produkcijskog testa 2026-08-21 (F4/P5): zastarjeli
// `updated{trialing}` isporučen NAKON `deleted` vraćao je isPro na true, a
// deletionGate ga čita — pa je uskrsnula pretplata BLOKIRALA GDPR brisanje
// računa, bez ičega u Portalu što bi se dalo otkazati.
describe("projectEntitlement — brana redoslijeda", () => {
  it("zahtjev je U WHERE klauzuli, ne pročitan pa provjeren", async () => {
    await projectEntitlement("update", ORG, { status: "active" }, subscriptionEvent(T_NOW));

    // Pročitaj-pa-provjeri bi dopustio da dvije istodobne isporuke obje prođu;
    // ovako o njima odlučuje baza, a broj redaka JE provjera.
    expect(orgCall(0).where).toEqual({
      id: ORG,
      OR: [
        { billingEventAppliedAt: null },
        { billingEventAppliedAt: { lte: T_NOW } },
      ],
    });
    expect(orgCall(0).data).toEqual({ billingEventAppliedAt: T_NOW });
  });

  it("zastarjeli događaj NE mijenja pravo i vraća false", async () => {
    vi.mocked(prisma.organization.updateMany).mockResolvedValue({ count: 0 } as never);

    await expect(
      projectEntitlement(
        "update",
        ORG,
        { status: "trialing", stripeSubscriptionId: SUB, stripeCustomerId: CUSTOMER },
        subscriptionEvent(T_OLDER),
      ),
    ).resolves.toBe(false);

    // Ovo je cijela poanta: nijedan upis u users.
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("svjež događaj primjenjuje i vraća true", async () => {
    await expect(
      projectEntitlement("update", ORG, { status: "active" }, subscriptionEvent(T_NEWER)),
    ).resolves.toBe(true);
    expect(prisma.user.updateMany).toHaveBeenCalled();
  });

  // Odluka 2026-09-11: event.created ima rezoluciju SEKUNDE, pa rafal
  // cancel-pa-delete rutinski stane u istu sekundu. lt bi tada tiho ispustio
  // legitiman prijelaz — a ispušteno pravo je nijemo, krivo je vidljivo.
  it("primjenjuje NA JEDNAKO: lte, ne lt", async () => {
    await projectEntitlement("update", ORG, { status: "active" }, subscriptionEvent(T_NOW));
    const clause = orgCall(0).where as { OR: { billingEventAppliedAt: unknown }[] };
    expect(clause.OR[1]!.billingEventAppliedAt).toEqual({ lte: T_NOW });
    expect(JSON.stringify(clause)).not.toContain('"lt"');
  });
});

describe("assertProjectionLanded", () => {
  it("baca kad marker nije stigao — jedini način da Stripe ponovi", async () => {
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue({ referenceId: ORG } as never);
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      billingEventAppliedAt: T_OLDER,
    } as never);

    // Plugin guta iznimke iz kuka i vraća 200; bez ovoga se prijelaz prava
    // izgubi tiho i trajno.
    await expect(assertProjectionLanded(subscriptionEvent(T_NOW))).rejects.toThrow();
  });

  it("šuti kad je marker JEDNAK — kuka je prošla", async () => {
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue({ referenceId: ORG } as never);
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      billingEventAppliedAt: T_NOW,
    } as never);

    await expect(assertProjectionLanded(subscriptionEvent(T_NOW))).resolves.toBeUndefined();
  });

  it("šuti kad je marker NOVIJI — brana je namjerno preskočila zastarjeli", async () => {
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue({ referenceId: ORG } as never);
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      billingEventAppliedAt: T_NEWER,
    } as never);

    // Inače bi zastarjeli događaj ulazio u vječnu petlju ponavljanja.
    await expect(assertProjectionLanded(subscriptionEvent(T_OLDER))).resolves.toBeUndefined();
  });

  it("šuti za obrisanu organizaciju — nema kamo projicirati", async () => {
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue({ referenceId: ORG } as never);
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(null as never);

    await expect(assertProjectionLanded(subscriptionEvent(T_NOW))).resolves.toBeUndefined();
  });

  it("šuti za događaj bez pretplate — ne dira ni bazu", async () => {
    const unrelated = {
      id: "evt_2",
      type: "invoice.paid",
      created: 1_000,
      data: { object: { object: "invoice", id: "in_1" } },
    } as never;

    await expect(assertProjectionLanded(unrelated)).resolves.toBeUndefined();
    expect(prisma.subscription.findFirst).not.toHaveBeenCalled();
  });
});

describe("stampArchiveRetention", () => {
  const rows = [
    { id: "a1", createdAt: new Date("2027-03-01T10:00:00Z") },
    { id: "a2", createdAt: new Date("2026-08-06T12:00:00Z") },
  ];

  it("cilja samo arhive bez roka, i to unutar organizacije", async () => {
    vi.mocked(prisma.archive.findMany).mockResolvedValue(rows as never);

    await stampArchiveRetention(ORG);

    expect(vi.mocked(prisma.archive.findMany).mock.calls[0]![0]!.where).toEqual({
      expiresAt: null,
      election: { organizationId: ORG },
    });
  });

  it("rok je kalendarska godina od createdAt SVAKOG retka posebno", async () => {
    vi.mocked(prisma.archive.findMany).mockResolvedValue(rows as never);

    await stampArchiveRetention(ORG);

    const calls = vi.mocked(prisma.archive.update).mock.calls;
    expect(calls[0]![0]).toEqual({
      where: { id: "a1" },
      // Prelazak preko 29. veljače 2028: 365 * 24 * 60 * 60 * 1000 ovdje pada
      // na 2028-02-29, kalendarska godina ne.
      data: { expiresAt: new Date("2028-03-01T10:00:00Z") },
    });
    expect(calls[1]![0]).toEqual({
      where: { id: "a2" },
      data: { expiresAt: new Date("2027-08-06T12:00:00Z") },
    });
  });

  it("NIŠTA se ne briše — nema povrata arhive", async () => {
    vi.mocked(prisma.archive.findMany).mockResolvedValue(rows as never);

    await stampArchiveRetention(ORG);

    expect(prisma.archive.delete).not.toHaveBeenCalled();
    expect(prisma.archive.deleteMany).not.toHaveBeenCalled();
    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(prisma.user.deleteMany).not.toHaveBeenCalled();
  });

  it("bez arhiva bez roka: 0, i nijedan upis", async () => {
    vi.mocked(prisma.archive.findMany).mockResolvedValue([] as never);

    await expect(stampArchiveRetention(ORG)).resolves.toBe(0);
    expect(prisma.archive.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
