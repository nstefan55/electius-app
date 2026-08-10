import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

// Server actions call requireSession() + prisma directly — mock both so the
// real modules (DB connection, next/headers, BetterAuth) never load. This is
// the pattern for every action test: mock the two seams, assert on inputs.
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { update: vi.fn() }, organization: { update: vi.fn() } },
}));
vi.mock("@/lib/auth/require-session", () => ({
  requireSession: vi.fn(),
}));

const { prisma } = await import("@/lib/prisma");
const { requireSession } = await import("@/lib/auth/require-session");
const { updateProfile, updateOrganization, setAccessibilityPref, setLocale } =
  await import("@/actions/settings");

const session = {
  user: { email: "admin@example.com", name: "A", organization: "Org", image: null, organizationLogo: null, isPro: false },
  organizationId: "org_1",
  accessibility: {
    reduceMotion: false,
    highContrast: false,
    largerText: false,
    focusOutlines: true,
  },
};

beforeEach(() => {
  vi.mocked(requireSession).mockResolvedValue(session);
  vi.mocked(prisma.user.update).mockReset();
  vi.mocked(prisma.organization.update).mockReset();
});

describe("updateProfile", () => {
  it("rejects invalid input without touching the session or DB", async () => {
    const result = await updateProfile({ firstName: "", lastName: "Doe" });
    expect(result).toEqual({ success: false, error: "invalid" });
    expect(requireSession).not.toHaveBeenCalled();
  });

  it("joins first + last name and scopes the write to the session email", async () => {
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);

    const result = await updateProfile({ firstName: "John", lastName: "Doe" });

    expect(result).toEqual({ success: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { email: "admin@example.com" },
      data: { name: "John Doe" },
    });
  });

  it("reports failure without leaking the DB error", async () => {
    vi.mocked(prisma.user.update).mockRejectedValue(new Error("db down"));

    const result = await updateProfile({ firstName: "John", lastName: "Doe" });
    expect(result).toEqual({ success: false, error: "failed" });
  });
});

describe("updateOrganization", () => {
  it("maps a P2002 contactEmail collision to 'emailTaken'", async () => {
    vi.mocked(prisma.organization.update).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    const result = await updateOrganization({
      name: "Org",
      contactEmail: "taken@example.com",
    });

    expect(result).toEqual({ success: false, error: "emailTaken" });
  });
});

describe("setAccessibilityPref", () => {
  // Akcija piše dinamički `data: { [key]: value }`. Zatvorena unija je jedino
  // što sprječava upis u proizvoljan stupac — ovaj test to pribija.
  it("refuses a key outside the closed union", async () => {
    // beforeEach samo prespaja mock, ne briše brojač poziva iz ranijih testova.
    vi.mocked(requireSession).mockClear();

    for (const key of ["isPro", "email", "stripeCustomerId", "__proto__"]) {
      const result = await setAccessibilityPref({ key, value: true });
      expect(result).toEqual({ success: false, error: "invalid" });
    }
    expect(requireSession).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("refuses a non-boolean value", async () => {
    const result = await setAccessibilityPref({
      key: "reduceMotion",
      value: "true",
    });
    expect(result).toEqual({ success: false, error: "invalid" });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("writes exactly the one column, scoped to the session email", async () => {
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);

    const result = await setAccessibilityPref({
      key: "highContrast",
      value: true,
    });

    expect(result).toEqual({ success: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { email: "admin@example.com" },
      data: { highContrast: true },
    });
  });

  it("persists false — turning a preference off is a write, not a no-op", async () => {
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);

    await setAccessibilityPref({ key: "focusOutlines", value: false });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { email: "admin@example.com" },
      data: { focusOutlines: false },
    });
  });

  it("reports failure without leaking the DB error", async () => {
    vi.mocked(prisma.user.update).mockRejectedValue(new Error("db down"));

    const result = await setAccessibilityPref({
      key: "largerText",
      value: true,
    });
    expect(result).toEqual({ success: false, error: "failed" });
  });
});

// Jezik (fix/locale-not-persisted). Kartica je do sada samo navigirala, pa je
// izbor umirao na sljedećem dolasku na /hr — a metla i BetterAuthove kuke, koje
// nemaju ni URL ni sesiju, jezik nisu mogle saznati uopće.
describe("setLocale", () => {
  it("rejects a locale outside LOCALES without touching the session or DB", async () => {
    // beforeEach samo prespaja mock, ne briše brojač poziva iz ranijih testova.
    vi.mocked(requireSession).mockClear();

    // Stupac je TEXT, pa bi bilo što ovdje i sjelo u bazu; z.enum je ono što to
    // sprječava na strani pisanja. Neuspjeh MORA biti prije requireSession —
    // inače je nepoznat jezik samo neuspio upis, a ne odbijen zahtjev.
    const result = await setLocale({ locale: "klingon" });

    expect(result).toEqual({ success: false, error: "invalid" });
    expect(requireSession).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("persists the chosen locale, scoped to the session's own row", async () => {
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);

    const result = await setLocale({ locale: "en" });

    expect(result).toEqual({ success: true });
    // Ovo je cijeli smisao ispravka: PIŠE. Bez ovog upisa kartica i dalje samo
    // navigira, a šest pošiljatelja nema odakle pročitati jezik.
    expect(vi.mocked(prisma.user.update).mock.calls[0]![0]).toEqual({
      where: { email: "admin@example.com" },
      data: { locale: "en" },
    });
  });

  it("reports failure instead of throwing when the write fails", async () => {
    vi.mocked(prisma.user.update).mockRejectedValue(new Error("db down"));

    expect(await setLocale({ locale: "hr" })).toEqual({
      success: false,
      error: "failed",
    });
  });
});
