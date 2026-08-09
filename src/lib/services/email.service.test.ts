import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Resend SDK itself — the service builds payloads, the SDK ships them.
const batchSend = vi.hoisted(() => vi.fn());
const emailSend = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({
  Resend: class {
    batch = { send: batchSend };
    emails = { send: emailSend };
  },
}));

// email.service uvozi hashToken iz token.service (izvod ključa idempotentnosti),
// a taj modul na vrhu drži prisma singleton. Mock je isti obrazac koji koriste
// svi susjedni testovi u ovoj mapi.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const {
  sendInvitationEmails,
  sendOtpEmail,
  sendReminderEmails,
  sendResetPasswordEmail,
} = await import("@/lib/services/email.service");

const election = {
  id: "el_1",
  title: "Studentski izbori",
  organizationName: "VVG",
};

const reminderElection = { ...election, endsAt: new Date("2026-08-20T12:00:00Z") };

// Ključ idempotentnosti / oznake žive u opcijama zahtjeva — DRUGI argument.
const optionsOf = (call: unknown[]) => call[1] as { idempotencyKey?: string };
const keyOf = (call: unknown[]) => optionsOf(call)?.idempotencyKey;

beforeEach(() => {
  // Pošiljatelj se sada razrješava pri slanju i baca ako nije postavljen, pa ga
  // testovi moraju postaviti eksplicitno.
  vi.stubEnv("RESEND_FROM_EMAIL", "Electius <system@electius.com>");
  batchSend.mockReset();
  batchSend.mockResolvedValue({ data: [], error: null });
  emailSend.mockReset();
  emailSend.mockResolvedValue({ data: { id: "email" }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sender resolution (§1.2)", () => {
  it("throws instead of falling back to a sandbox domain when RESEND_FROM_EMAIL is unset", async () => {
    vi.stubEnv("RESEND_FROM_EMAIL", undefined);

    // Prije ovoga je poruka tiho odlazila s onboarding@resend.dev — dostavljivo,
    // pogrešno, i aplikaciji nevidljivo.
    await expect(sendOtpEmail("a@example.com", "483920")).rejects.toThrow(
      "RESEND_FROM_EMAIL",
    );
    expect(emailSend).not.toHaveBeenCalled();
  });

  it("puts the configured sender on both single and batch sends", async () => {
    await sendOtpEmail("a@example.com", "483920");
    await sendInvitationEmails(
      [{ email: "a@example.com", rawToken: "raw" }],
      election,
    );

    expect(emailSend.mock.calls[0][0].from).toBe(
      "Electius <system@electius.com>",
    );
    expect(batchSend.mock.calls[0][0][0].from).toBe(
      "Electius <system@electius.com>",
    );
  });
});

describe("tags (§1.3)", () => {
  it("tags a voter send with its type and election, and never with an address", async () => {
    await sendInvitationEmails(
      [{ email: "voter@example.com", rawToken: "raw" }],
      election,
    );

    const [payloads] = batchSend.mock.calls[0];
    expect(payloads[0].tags).toEqual([
      { name: "type", value: "invite" },
      { name: "electionId", value: "el_1" },
    ]);

    // Adresa birača ne smije završiti u Resendovim zapisima — oznake nose cuid.
    expect(JSON.stringify(payloads[0].tags)).not.toContain("@");
  });

  it("tags each auth email with its own type and no election", async () => {
    await sendOtpEmail("admin@example.com", "483920");
    await sendResetPasswordEmail("admin@example.com", "https://x/reset");

    expect(emailSend.mock.calls[0][0].tags).toEqual([
      { name: "type", value: "otp" },
    ]);
    expect(emailSend.mock.calls[1][0].tags).toEqual([
      { name: "type", value: "reset" },
    ]);
  });

  it("distinguishes a reminder from an invitation", async () => {
    await sendReminderEmails(
      [{ email: "a@example.com", rawToken: "raw" }],
      reminderElection,
    );

    const [payloads] = batchSend.mock.calls[0];
    expect(payloads[0].tags).toContainEqual({
      name: "type",
      value: "reminder",
    });
  });
});

describe("idempotency keys (§1.4)", () => {
  it("changes the key when the tokens change, so a re-mint retry is never suppressed", async () => {
    // Ovo je razlog zbog kojeg se ključ izvodi iz tokena, a ne iz birača. Obje
    // staze ponovno kuju tokene pri svakom pozivu, pa ponovni pokušaj neuspjelog
    // komada nosi DRUGE poveznice — ključ vezan uz birače bio bi isti i tiho
    // ugušio upravo taj pokušaj (invarijanta #7).
    await sendInvitationEmails(
      [{ email: "a@example.com", rawToken: "token-before-remint" }],
      election,
    );
    const before = keyOf(batchSend.mock.calls[0]);

    batchSend.mockClear();
    await sendInvitationEmails(
      [{ email: "a@example.com", rawToken: "token-after-remint" }],
      election,
    );
    const after = keyOf(batchSend.mock.calls[0]);

    expect(before).toBeTruthy();
    expect(after).not.toBe(before);
  });

  it("keeps the key stable for the same token set regardless of recipient order", async () => {
    // Poredak primatelja ovisi o upitu; skup tokena ne. Isti zahtjev mora dati
    // isti ključ ili odbacivanje duplikata ne radi.
    await sendInvitationEmails(
      [
        { email: "a@example.com", rawToken: "tok-a" },
        { email: "b@example.com", rawToken: "tok-b" },
      ],
      election,
    );
    const first = keyOf(batchSend.mock.calls[0]);

    batchSend.mockClear();
    await sendInvitationEmails(
      [
        { email: "b@example.com", rawToken: "tok-b" },
        { email: "a@example.com", rawToken: "tok-a" },
      ],
      election,
    );

    expect(keyOf(batchSend.mock.calls[0])).toBe(first);
  });

  it("scopes the key by election and by kind", async () => {
    const recipients = [{ email: "a@example.com", rawToken: "tok" }];

    await sendInvitationEmails(recipients, election);
    const invite = keyOf(batchSend.mock.calls[0]);

    batchSend.mockClear();
    await sendInvitationEmails(recipients, { ...election, id: "el_2" });
    const otherElection = keyOf(batchSend.mock.calls[0]);

    batchSend.mockClear();
    await sendReminderEmails(recipients, reminderElection);
    const reminder = keyOf(batchSend.mock.calls[0]);

    expect(invite).toMatch(/^invite:el_1:[0-9a-f]{16}$/);
    expect(otherElection).toMatch(/^invite:el_2:/);
    expect(reminder).toMatch(/^reminder:el_1:/);
    // Isti tokeni, ista vrsta, drugi izbori → drugi ključ.
    expect(otherElection).not.toBe(invite);
  });

  it("never keys the raw token itself into the request", async () => {
    await sendInvitationEmails(
      [{ email: "a@example.com", rawToken: "super-secret-raw" }],
      election,
    );

    // Ključ je otisak POHRANJENIH otisaka — sirovi token u njega ne ulazi
    // (invarijanta #2).
    expect(keyOf(batchSend.mock.calls[0])).not.toContain("super-secret-raw");
  });

  it("sends user-triggered auth mail with no key at all", async () => {
    // "Pošalji ponovno" je zahtjev za NOVOM porukom — ključ bi ga ugušio.
    await sendOtpEmail("a@example.com", "483920");
    await sendResetPasswordEmail("a@example.com", "https://x/reset");

    expect(keyOf(emailSend.mock.calls[0])).toBeUndefined();
    expect(keyOf(emailSend.mock.calls[1])).toBeUndefined();
  });
});

describe("sendOtpEmail", () => {
  it("renders the code in both bodies with no link anywhere", async () => {
    await sendOtpEmail("a@example.com", "483920");

    const [payload] = emailSend.mock.calls[0];
    expect(payload.to).toBe("a@example.com");
    expect(payload.text).toContain("483920");
    expect(payload.html).toContain("483920");
    // The whole point is typing a code — no CTA button, no fallback link.
    expect(payload.html).not.toContain("<a ");
    expect(payload.html).not.toContain("http");
    expect(payload.text).not.toContain("http");
  });

  it("throws on a Resend error so a failed send fails loudly", async () => {
    emailSend.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(sendOtpEmail("a@example.com", "111111")).rejects.toThrow(
      "resend: boom",
    );
  });
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
    await sendInvitationEmails([{ email: "a@example.com", rawToken: "raw" }], {
      ...election,
      title: 'Izbori <b>2026</b> & "co"',
    });

    const [payload] = batchSend.mock.calls[0][0];
    expect(payload.html).toContain(
      "Izbori &lt;b&gt;2026&lt;/b&gt; &amp; &quot;co&quot;",
    );
    expect(payload.html).not.toContain("<b>2026</b>");
    // Subject and plain text are not HTML — they stay raw.
    expect(payload.subject).toContain('Izbori <b>2026</b> & "co"');
  });

  it("throws on a Resend batch error so the chunk stays retryable", async () => {
    batchSend.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(
      sendInvitationEmails(
        [{ email: "a@example.com", rawToken: "raw" }],
        election,
      ),
    ).rejects.toThrow("resend: boom");
  });
});
