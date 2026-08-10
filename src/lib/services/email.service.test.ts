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
  sendTurnoutEmails,
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

type TemplateRef = { id: string; variables: Record<string, string | number> };
const templateOf = (payload: unknown) =>
  (payload as { template: TemplateRef }).template;

beforeEach(() => {
  // Pošiljatelj se sada razrješava pri slanju i baca ako nije postavljen, pa ga
  // testovi moraju postaviti eksplicitno.
  vi.stubEnv("RESEND_FROM_EMAIL", "Electius <system@electius.com>");
  batchSend.mockReset();
  // Stvarni oblik permissive odgovora: { data: { data: [id…], errors: [{index}…] } }.
  batchSend.mockResolvedValue({ data: { data: [], errors: [] }, error: null });
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

describe("permissive batching (§Faza 4)", () => {
  const one = [{ email: "a@example.com", rawToken: "raw" }];

  // Zadano je `strict`, gdje jedna neispravna adresa ruši svih 100 poruka u
  // komadu. Uz to je i tip odgovora uvjetovan literalom — bez njega polje
  // `errors` ne postoji ni na tipu, pa se odbijeni ne mogu ni pročitati.
  it("traži permissive provjeru na svakom skupnom slanju", async () => {
    await sendInvitationEmails(one, election);
    await sendReminderEmails(one, reminderElection);

    expect(optionsOf(batchSend.mock.calls[0])).toMatchObject({
      batchValidation: "permissive",
    });
    expect(optionsOf(batchSend.mock.calls[1])).toMatchObject({
      batchValidation: "permissive",
    });
  });

  it("vraća indekse odbijenih primatelja", async () => {
    batchSend.mockResolvedValue({
      data: {
        data: [{ id: "e1" }, { id: "e3" }],
        errors: [
          { index: 1, message: "Invalid `to` field." },
          { index: 3, message: "Suppressed." },
        ],
      },
      error: null,
    });

    const recipients = Array.from({ length: 4 }, (_, i) => ({
      email: `v${i}@example.com`,
      rawToken: `raw${i}`,
    }));

    expect(await sendInvitationEmails(recipients, election)).toEqual([1, 3]);
  });

  it("prazno polje kad je prošao cijeli komad", async () => {
    expect(await sendInvitationEmails(one, election)).toEqual([]);
  });

  // Dvije različite činjenice: "Resend nije primio poziv" i dalje baca, pa
  // pozivatelj cijeli komad ostavlja u redu za ponavljanje.
  it("i dalje baca kad padne CIJELI poziv", async () => {
    batchSend.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(sendInvitationEmails(one, election)).rejects.toThrow(
      "resend: boom",
    );
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

// ───────── Obavijesti o izlaznosti (email-delivery §4) ─────────

describe("sendTurnoutEmails", () => {
  const turnoutElection = {
    ...election,
    endsAt: new Date("2026-08-20T12:00:00Z"),
    quorumThreshold: null as number | null,
  };
  const figures = {
    milestone: 50,
    turnoutPct: 52,
    votesCast: 104,
    votersTotal: 200,
  };

  beforeEach(() => {
    vi.stubEnv("RESEND_TURNOUT_TOPIC_ID", "topic_1");
  });

  it("NIKAD ne nosi zbroj po kandidatima (§3.3)", async () => {
    await sendTurnoutEmails(["admin@example.com"], turnoutElection, figures);

    // Za AFTER_CLOSE izbore zbroj je zapečaćen i od administratora, pa bi brojke
    // po kandidatu u sandučiću zaobišle pečat koji svaki zaslon poštuje. Tip to
    // već sprječava; ovo pinira i sadržaj koji doista odlazi.
    const vars = templateOf(batchSend.mock.calls[0][0][0]).variables;
    const serialized = JSON.stringify(vars).toLowerCase();
    for (const forbidden of ["candidate", "kandidat", "option", "winner", "votesfor"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(Object.keys(vars).sort()).toEqual([
      "CLOSES",
      "MILESTONE",
      "ORG",
      "ORG_HTML",
      "QUORUM",
      "TITLE",
      "TITLE_HTML",
      "TURNOUT_PCT",
      "URL",
      "VOTERS_TOTAL",
      "VOTES_CAST",
    ]);
  });

  it("nosi topicId — jedina poruka koja ga smije nositi (§3.2)", async () => {
    await sendTurnoutEmails(["admin@example.com"], turnoutElection, figures);
    expect(batchSend.mock.calls[0][0][0].topicId).toBe("topic_1");

    // Transakcijske poruke ga NE nose: birač koji je jednom kliknuo "odjava"
    // mora i dalje dobiti svoj listić, inače mu je tiho oduzeto pravo glasa.
    batchSend.mockClear();
    await sendInvitationEmails(
      [{ email: "v@example.com", rawToken: "raw" }],
      election,
    );
    expect(batchSend.mock.calls[0][0][0].topicId).toBeUndefined();
  });

  it("odbija slanje bez teme umjesto da tiho pregazi odjavu", async () => {
    vi.stubEnv("RESEND_TURNOUT_TOPIC_ID", undefined);

    await expect(
      sendTurnoutEmails(["admin@example.com"], turnoutElection, figures),
    ).rejects.toThrow("RESEND_TURNOUT_TOPIC_ID");
    expect(batchSend).not.toHaveBeenCalled();
  });

  it("ključ idempotentnosti je izbori + prečka, stabilan preko ponovnih prolaza", async () => {
    await sendTurnoutEmails(["admin@example.com"], turnoutElection, figures);
    await sendTurnoutEmails(["admin@example.com"], turnoutElection, figures);

    // Bez kovanja tokena ovdje nema ničega što bi se mijenjalo među prolazima,
    // pa je isti ključ ISPRAVAN — za razliku od staza s čarobnom poveznicom,
    // gdje bi stabilan ključ ugušio ponovni pokušaj (invarijanta #7).
    expect(keyOf(batchSend.mock.calls[0])).toBe("turnout:el_1:50");
    expect(keyOf(batchSend.mock.calls[1])).toBe("turnout:el_1:50");

    // Druga prečka je druga poruka.
    await sendTurnoutEmails(["admin@example.com"], turnoutElection, {
      ...figures,
      milestone: 75,
    });
    expect(keyOf(batchSend.mock.calls[2])).toBe("turnout:el_1:75");
  });

  it("jedan unos po administratoru, svaki sa svojom poveznicom za odjavu", async () => {
    await sendTurnoutEmails(
      ["a@example.com", "b@example.com"],
      turnoutElection,
      figures,
    );

    // Zajednički To: dao bi svima istu odjavu i usput otkrio adrese
    // administratora jednu drugoj.
    const batch = batchSend.mock.calls[0][0] as { to: string }[];
    expect(batch.map((b) => b.to)).toEqual(["a@example.com", "b@example.com"]);
  });

  it("kvorum je crtica kad nije postavljen, inače potreban/ukupno", async () => {
    await sendTurnoutEmails(["a@example.com"], turnoutElection, figures);
    expect(templateOf(batchSend.mock.calls[0][0][0]).variables.QUORUM).toBe("—");

    batchSend.mockClear();
    await sendTurnoutEmails(
      ["a@example.com"],
      { ...turnoutElection, quorumThreshold: 70 },
      figures,
    );
    // quorumRequiredVoters(200, 70) = 140 — dijeljena derivacija, ne ovdje
    // izračunata (invarijanta #5).
    expect(templateOf(batchSend.mock.calls[0][0][0]).variables.QUORUM).toBe(
      "140/200",
    );
  });

  it("administratorov naslov ide u paru: sirov i pobjegao", async () => {
    await sendTurnoutEmails(
      ["a@example.com"],
      { ...turnoutElection, title: "O'Brien & <b>Co</b>" },
      figures,
    );

    const vars = templateOf(batchSend.mock.calls[0][0][0]).variables;
    expect(vars.TITLE).toBe("O'Brien & <b>Co</b>");
    expect(vars.TITLE_HTML).toBe("O&#39;Brien &amp; &lt;b&gt;Co&lt;/b&gt;");
  });

  it("jezik bira predložak", async () => {
    await sendTurnoutEmails(["a@example.com"], turnoutElection, figures, "en");
    expect(templateOf(batchSend.mock.calls[0][0][0]).id).toBe(
      "electius-admin-turnout-en",
    );

    batchSend.mockClear();
    await sendTurnoutEmails(["a@example.com"], turnoutElection, figures);
    expect(templateOf(batchSend.mock.calls[0][0][0]).id).toBe(
      "electius-admin-turnout-hr",
    );
  });

  it("bez primatelja ne šalje ništa", async () => {
    await sendTurnoutEmails([], turnoutElection, figures);
    expect(batchSend).not.toHaveBeenCalled();
  });
});
