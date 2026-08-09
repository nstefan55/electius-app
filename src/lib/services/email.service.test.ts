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
  sendDeleteAccountEmail,
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

type TemplateRef = { id: string; variables: Record<string, string> };
const templateOf = (payload: unknown) =>
  (payload as { template: TemplateRef }).template;

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

describe("template selection (§Faza 2)", () => {
  it("references a published alias per email, never raw content", async () => {
    await sendOtpEmail("a@example.com", "483920");
    await sendResetPasswordEmail("a@example.com", "https://x/reset");
    await sendDeleteAccountEmail("a@example.com", "https://x/delete");
    await sendInvitationEmails(
      [{ email: "a@example.com", rawToken: "raw" }],
      election,
    );
    await sendReminderEmails(
      [{ email: "a@example.com", rawToken: "raw" }],
      reminderElection,
    );

    expect(templateOf(emailSend.mock.calls[0][0]).id).toBe("electius-otp-hr");
    expect(templateOf(emailSend.mock.calls[1][0]).id).toBe("electius-reset-hr");
    expect(templateOf(emailSend.mock.calls[2][0]).id).toBe(
      "electius-delete-account-hr",
    );
    expect(templateOf(batchSend.mock.calls[0][0][0]).id).toBe(
      "electius-voter-invite-hr",
    );
    expect(templateOf(batchSend.mock.calls[1][0][0]).id).toBe(
      "electius-voter-reminder-hr",
    );

    // Tekst više ne putuje iz koda — predložak i sirovi sadržaj isključuju se.
    for (const [payload] of emailSend.mock.calls) {
      expect(payload.html).toBeUndefined();
      expect(payload.text).toBeUndefined();
      expect(payload.subject).toBeUndefined();
    }
  });

  it("picks the copy by putting the locale in the alias", async () => {
    // Jezik poruke odlučuje se SAMO ovdje — predložak nosi tekst, pa pogrešan
    // alias znači tiho pogrešan jezik u sandučiću.
    await sendOtpEmail("a@example.com", "483920", "en");
    await sendInvitationEmails(
      [{ email: "a@example.com", rawToken: "raw" }],
      election,
      "en",
    );

    expect(templateOf(emailSend.mock.calls[0][0]).id).toBe("electius-otp-en");
    expect(templateOf(batchSend.mock.calls[0][0][0]).id).toBe(
      "electius-voter-invite-en",
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
  it("passes the code as its only variable, so no link can reach the message", async () => {
    await sendOtpEmail("a@example.com", "483920");

    const [payload] = emailSend.mock.calls[0];
    expect(payload.to).toBe("a@example.com");

    // Šifra JE sadržaj (otp-implementation-auth-spec §3). Predložak nema CTA ni
    // poveznicu; sa strane koda jamstvo je da URL nije ni izraziv.
    expect(templateOf(payload).variables).toEqual({ CODE: "483920" });
    expect(Object.keys(templateOf(payload).variables)).not.toContain("URL");
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

  it("gives every recipient their own magic link in their own variables", async () => {
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
    // Svaki element serije nosi vlastite varijable — bez toga bi svi birači
    // dobili istu poveznicu.
    expect(templateOf(payloads[0]).variables.URL).toContain("/vote/raw-token-a");
    expect(templateOf(payloads[1]).variables.URL).toContain("/vote/raw-token-b");
    expect(templateOf(payloads[0]).variables.TITLE).toBe("Studentski izbori");
  });

  it("passes admin-controlled values as a raw/escaped pair", async () => {
    await sendInvitationEmails([{ email: "a@example.com", rawToken: "raw" }], {
      ...election,
      title: 'Izbori <b>2026</b> & "co"',
      organizationName: "Ivan & Co",
    });

    const vars = templateOf(batchSend.mock.calls[0][0][0]).variables;

    // Jedan predložak istim varijablama puni naslov, čisti tekst I HTML, a
    // trostruka vitičasta ne bježi. Sirova ide u naslov/tekst, pobjegla u HTML —
    // jedna varijabla ne može biti oboje.
    expect(vars.TITLE).toBe('Izbori <b>2026</b> & "co"');
    expect(vars.TITLE_HTML).toBe(
      "Izbori &lt;b&gt;2026&lt;/b&gt; &amp; &quot;co&quot;",
    );
    expect(vars.ORG).toBe("Ivan & Co");
    expect(vars.ORG_HTML).toBe("Ivan &amp; Co");
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

describe("sendReminderEmails", () => {
  it("formats the closing date in the locale that selected the template", async () => {
    await sendReminderEmails(
      [{ email: "a@example.com", rawToken: "raw" }],
      reminderElection,
      "en",
    );

    const template = templateOf(batchSend.mock.calls[0][0][0]);
    expect(template.id).toBe("electius-voter-reminder-en");
    // Isti UTC formatter koji koriste zaslon i izvještaj (invarijanta #5).
    expect(template.variables.CLOSES).toContain("2026");
    // CLOSES je izlaz našeg formattera, ne administratorov tekst — nema blizanca.
    expect(template.variables.CLOSES_HTML).toBeUndefined();
  });
});
