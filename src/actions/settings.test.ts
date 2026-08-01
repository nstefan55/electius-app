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
const { updateProfile, updateOrganization } = await import(
  "@/actions/settings"
);

const session = {
  user: { email: "admin@example.com", name: "A", organization: "Org", image: null, organizationLogo: null, isPro: false },
  organizationId: "org_1",
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
