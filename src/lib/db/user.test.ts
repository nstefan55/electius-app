import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

const { prisma } = await import("@/lib/prisma");
const { localeForEmail } = await import("@/lib/db/user");

beforeEach(() => {
  vi.mocked(prisma.user.findUnique).mockReset();
});

// Jezik administratorske pošte (fix/locale-not-persisted). Ovo je JEDINA staza
// kojom OTP, reset lozinke i potvrda brisanja računa doznaju jezik: kuke ih
// zovu s adresom, ne s korisnikom. Dok je ovo bilo unutar lib/auth/index.ts,
// nijedan test nije mogao doći do njega, pa se povratak na hr nije vidio.
describe("localeForEmail", () => {
  it("reads the recipient's own stored locale", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      locale: "en",
    } as never);

    // Vrijednost koja NIJE zadana — s hr fixtureom bi prošla i implementacija
    // koja stupac uopće ne čita, jer je hr ionako ishod.
    expect(await localeForEmail("admin@example.com")).toBe("en");
    expect(vi.mocked(prisma.user.findUnique).mock.calls[0]![0]).toEqual({
      where: { email: "admin@example.com" },
      select: { locale: true },
    });
  });

  it("falls back to hr for an unknown locale in the column", async () => {
    // Stupac je TEXT, a /sign-up/email prima locale u tijelu zahtjeva i može se
    // gađati izravno. Bez ovoga bi templateId() složio alias `electius-otp-xx`,
    // Resend ga ne bi poznavao i slanje bi puklo umjesto da padne na hr.
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      locale: "klingon",
    } as never);

    expect(await localeForEmail("admin@example.com")).toBe("hr");
  });

  it("falls back to hr when no row matches the address", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

    expect(await localeForEmail("nobody@example.com")).toBe("hr");
  });
});
