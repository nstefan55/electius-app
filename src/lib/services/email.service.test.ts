import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Resend SDK itself — the service builds payloads, the SDK ships them.
const batchSend = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    batch = { send: batchSend };
    emails = { send: vi.fn() };
  },
}));

const { sendInvitationEmails } = await import("@/lib/services/email.service");

const election = { title: "Studentski izbori", organizationName: "VVG" };

beforeEach(() => {
  batchSend.mockReset();
  batchSend.mockResolvedValue({ data: [], error: null });
});

describe("sendInvitationEmails", () => {
  it("no-ops on an empty batch without calling Resend", async () => {
    await sendInvitationEmails([], election);
    expect(batchSend).not.toHaveBeenCalled();
  });

  it("builds one payload per recipient with the magic link carrying the raw token", async () => {
    await sendInvitationEmails(
      [
        { email: "a@example.com", rawToken: "raw-token-a" },
        { email: "b@example.com", rawToken: "raw-token-b" },
      ],
      election,
    );

    const payloads = batchSend.mock.calls[0][0];
    expect(payloads).toHaveLength(2);
    expect(payloads[0].to).toBe("a@example.com");
    expect(payloads[0].subject).toContain("Studentski izbori");
    // CTA magic link = voteUrl(rawToken), in both html and text bodies.
    expect(payloads[0].html).toContain("/vote/raw-token-a");
    expect(payloads[0].text).toContain("/vote/raw-token-a");
    expect(payloads[1].html).toContain("/vote/raw-token-b");
  });

  it("escapes admin-controlled values in the HTML body but not in the subject", async () => {
    await sendInvitationEmails(
      [{ email: "a@example.com", rawToken: "raw" }],
      { title: 'Izbori <b>2026</b> & "co"', organizationName: "VVG" },
    );

    const [payload] = batchSend.mock.calls[0][0];
    expect(payload.html).toContain("Izbori &lt;b&gt;2026&lt;/b&gt; &amp; &quot;co&quot;");
    expect(payload.html).not.toContain("<b>2026</b>");
    // Subject and plain text are not HTML — they stay raw.
    expect(payload.subject).toContain('Izbori <b>2026</b> & "co"');
  });

  it("throws on a Resend batch error so the chunk stays retryable", async () => {
    batchSend.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(
      sendInvitationEmails([{ email: "a@example.com", rawToken: "raw" }], election),
    ).rejects.toThrow("resend: boom");
  });
});
