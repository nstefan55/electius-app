import { beforeEach, describe, expect, it, vi } from "vitest";

// completeSetup ne ide kroz requireSession() — taj helper org-less račune vraća
// baš na /setup, pa bi zabravio akciju koja to stanje rješava. Zato se mockira
// sirovi BetterAuth i next/headers.
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    organization: { update: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));

const { prisma } = await import("@/lib/prisma");
const { auth } = await import("@/lib/auth");
const { completeSetup } = await import("@/actions/setup");
const { TERMS_VERSION } = await import("@/lib/legal");

const input = {
  firstName: "Ana",
  lastName: "Horvat",
  organizationName: "Sveučilište u Zagrebu",
  organizationType: "UNIVERSITY",
};

beforeEach(() => {
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: "u1", email: "ana@example.com" },
  } as never);
  vi.mocked(prisma.user.findUnique).mockReset();
  vi.mocked(prisma.user.update).mockReset();
  vi.mocked(prisma.organization.update).mockReset();
});

describe("completeSetup — pristanak na uvjete", () => {
  it("odbija prvo postavljanje bez kvačice i NIŠTA ne zapisuje", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      organizationId: null,
      organization: null,
    } as never);

    const result = await completeSetup(input);

    expect(result).toEqual({ success: false, error: "terms" });
    // Nosivo: odbijanje ne smije ostaviti organizaciju. Prije ove promjene
    // kvačice nije ni bilo u tijelu zahtjeva, pa je račun nastajao bez ikakva
    // zapisa o pristanku.
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("uz kvačicu stvara organizaciju s vremenom I inačicom pristanka", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      organizationId: null,
      organization: null,
    } as never);

    const result = await completeSetup({ ...input, terms: true });

    expect(result).toEqual({ success: true });
    const create = vi.mocked(prisma.user.update).mock.calls[0][0] as never as {
      data: { organization: { create: Record<string, unknown> } };
    };
    const org = create.data.organization.create;
    expect(org.termsAcceptedAt).toBeInstanceOf(Date);
    // Bez inačice je obećanje iz odjeljka o izmjenama neprovjerljivo: „koji su
    // uvjeti obvezivali ovu organizaciju u ožujku" ostaje bez odgovora.
    expect(org.termsVersion).toBe(TERMS_VERSION);
  });

  it("povratak na /setup ne traži ponovni pristanak niti ga predatira", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      organizationId: "org1",
      organization: { termsAcceptedAt: new Date("2026-01-01") },
    } as never);

    const result = await completeSetup(input);

    expect(result).toEqual({ success: true });
    const update = vi.mocked(prisma.organization.update).mock
      .calls[0][0] as never as { data: Record<string, unknown> };
    // Uređivanje profila nije novi ugovor. Prepisivanje datuma izgubilo bi
    // trenutak stvarnog pristanka, a traženje kvačice bilo bi trenje bez zapisa.
    expect(update.data).not.toHaveProperty("termsAcceptedAt");
    expect(update.data).not.toHaveProperty("termsVersion");
  });

  it("organizacija koja pristanak još nema mora ga dati i pri povratku", async () => {
    // Stvarni slučaj: svaka organizacija otvorena prije ove promjene ima
    // termsAcceptedAt = null, pa je /setup jedino mjesto na kojem se zapis može
    // nadoknaditi.
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      organizationId: "org1",
      organization: { termsAcceptedAt: null },
    } as never);

    expect(await completeSetup(input)).toEqual({
      success: false,
      error: "terms",
    });
    expect(prisma.organization.update).not.toHaveBeenCalled();

    expect(await completeSetup({ ...input, terms: true })).toEqual({
      success: true,
    });
    const update = vi.mocked(prisma.organization.update).mock
      .calls[0][0] as never as { data: Record<string, unknown> };
    expect(update.data.termsAcceptedAt).toBeInstanceOf(Date);
    expect(update.data.termsVersion).toBe(TERMS_VERSION);
  });
});

describe("completeSetup — pristanak zapisan na registraciji (v0.9.69)", () => {
  it("ne traži kvačicu kad je korisnik već pristao, i PREPISUJE izvorni datum", async () => {
    // E-mail put: kvačica je bila na registraciji, /api/auth/register je
    // zapisao datum i inačicu na korisnika. Drugo pitanje ovdje bilo bi
    // trenje bez ijednog novog podatka.
    const accepted = new Date("2026-03-04T10:00:00Z");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      organizationId: null,
      termsAcceptedAt: accepted,
      termsVersion: "2026-01-01",
      organization: null,
    } as never);

    const result = await completeSetup(input);

    expect(result).toEqual({ success: true });
    const create = vi.mocked(prisma.user.update).mock.calls[0][0] as never as {
      data: { organization: { create: Record<string, unknown> } };
    };
    const org = create.data.organization.create;
    // Nosivo: prepisuje se KADA se pristalo, ne kada je organizacija nastala.
    // Današnji datum ovdje izgubio bi trenutak stvarnog pristanka.
    expect(org.termsAcceptedAt).toBe(accepted);
    expect(org.termsVersion).toBe("2026-01-01");
  });

  it("i dalje traži kvačicu kad ni korisnik ni organizacija nemaju zapis (Google)", async () => {
    // ⚠ Googleov gumb stoji iznad obrasca za registraciju i njegovu kvačicu
    // ne čita, pa je /setup jedina vrata koja tom putu preostaju. Bez ovoga
    // Google račun ne bi pristao nigdje.
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      organizationId: null,
      termsAcceptedAt: null,
      termsVersion: null,
      organization: null,
    } as never);

    expect(await completeSetup(input)).toEqual({
      success: false,
      error: "terms",
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("kad se pristane ovdje, zapis dobiva i korisnik, ne samo organizacija", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      organizationId: null,
      termsAcceptedAt: null,
      termsVersion: null,
      organization: null,
    } as never);

    await completeSetup({ ...input, terms: true });

    const call = vi.mocked(prisma.user.update).mock.calls[0][0] as never as {
      data: Record<string, unknown>;
    };
    // Tko je pristao mora biti odgovorivo bez čitanja organizacije.
    expect(call.data.termsAcceptedAt).toBeInstanceOf(Date);
    expect(call.data.termsVersion).toBe(TERMS_VERSION);
  });

  it("i na povratku (organizacija postoji, zapisa nema) korisnik dobiva zapis", async () => {
    // Druga staza kroz istu odluku: organizacija otvorena prije v0.9.65 ima
    // termsAcceptedAt = null. Kvačica se traži, i zapis mora dobiti i osoba,
    // ne samo organizacija — inače je stamp pokriven testom samo u grani koja
    // organizaciju tek stvara, a ova bi tiho ostala bez njega.
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      organizationId: "org1",
      termsAcceptedAt: null,
      termsVersion: null,
      organization: { termsAcceptedAt: null },
    } as never);

    expect(await completeSetup({ ...input, terms: true })).toEqual({
      success: true,
    });

    const userCall = vi.mocked(prisma.user.update).mock.calls[0][0] as never as {
      data: Record<string, unknown>;
    };
    expect(userCall.data.termsAcceptedAt).toBeInstanceOf(Date);
    expect(userCall.data.termsVersion).toBe(TERMS_VERSION);
  });
});
