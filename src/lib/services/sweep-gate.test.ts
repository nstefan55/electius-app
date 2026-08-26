import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Tranzitivni šav: modul uvozi REMINDER_LEAD_MS (publication.service) i
// tokenExpiry (token.service), a oba vuku prisma singleton — nikad prava baza.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
// email.service konstruira Resend klijent na razini modula i baca bez ključa —
// isti šav koji već reže publication.service.test.ts.
vi.mock("@/lib/services/email.service", () => ({
  sendInvitationEmails: vi.fn(),
  sendReminderEmails: vi.fn(),
  sendTurnoutEmails: vi.fn(),
}));
vi.mock("@upstash/redis", () => ({ Redis: { fromEnv: vi.fn() } }));

const { Redis } = await import("@upstash/redis");
const {
  SWEEP_GATE_KEY,
  SWEEP_GATE_TTL_SECONDS,
  computeSweepNextDue,
  sweepDue,
  storeSweepNextDue,
  clearSweepGate,
} = await import("@/lib/services/sweep-gate");
const { REMINDER_LEAD_MS } = await import("@/lib/services/publication.service");

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const now = new Date("2026-08-24T12:00:00Z");
const t = (offsetMs: number) => new Date(now.getTime() + offsetMs);
const HOUR = 60 * 60 * 1000;

const empty = {
  nextScheduledStart: null,
  active: [],
  nextArchiveExpiry: null,
};

// ACTIVE redak sa stvarnim rokom, bez podsjetnika — samo zatvaranje pridonosi.
const plainActive = (startsAt: Date, endsAt: Date) => ({
  startsAt,
  endsAt,
  voterReminder24h: false,
  autoReminderSentAt: null,
});

describe("computeSweepNextDue", () => {
  it("sam SCHEDULED start vraća taj trenutak", () => {
    const start = t(3 * HOUR);
    expect(
      computeSweepNextDue({ ...empty, nextScheduledStart: start }, now),
    ).toBe(start.getTime());
  });

  it("ACTIVE sa stvarnim rokom pridonosi endsAt (zatvaranje)", () => {
    const end = t(5 * HOUR);
    expect(
      computeSweepNextDue(
        { ...empty, active: [plainActive(t(-2 * HOUR), end)] },
        now,
      ),
    ).toBe(end.getTime());
  });

  it("rezervirani datum (endsAt <= startsAt) pridonosi startsAt + 30 d preko tokenExpiry, ne endsAt", () => {
    const startsAt = t(-2 * HOUR);
    expect(
      computeSweepNextDue(
        { ...empty, active: [plainActive(startsAt, startsAt)] },
        now,
      ),
    ).toBe(startsAt.getTime() + THIRTY_DAYS_MS);
  });

  it("podsjetnik pridonosi endsAt − LEAD kad je uključen, nezauzet i prozor dulji od najave", () => {
    const end = t(REMINDER_LEAD_MS + 2 * HOUR);
    const input = {
      ...empty,
      active: [
        {
          startsAt: t(-2 * REMINDER_LEAD_MS),
          endsAt: end,
          voterReminder24h: true,
          autoReminderSentAt: null,
        },
      ],
    };
    expect(computeSweepNextDue(input, now)).toBe(
      end.getTime() - REMINDER_LEAD_MS,
    );
  });

  it("zauzet biljeg izbacuje podsjetnik — ostaje samo zatvaranje", () => {
    const end = t(REMINDER_LEAD_MS + 2 * HOUR);
    const input = {
      ...empty,
      active: [
        {
          startsAt: t(-2 * REMINDER_LEAD_MS),
          endsAt: end,
          voterReminder24h: true,
          autoReminderSentAt: new Date(),
        },
      ],
    };
    expect(computeSweepNextDue(input, now)).toBe(end.getTime());
  });

  it("kratki izbori (prozor <= LEAD) nemaju trenutak podsjetnika — ostaje samo zatvaranje", () => {
    // Prozor od 4 h: podsjetnik bi pao PRIJE sada (end − 24 h u prošlosti),
    // ali klauzula prozora ga izbacuje prije filtra budućnosti.
    const input = {
      ...empty,
      active: [
        {
          startsAt: t(-1 * HOUR),
          endsAt: t(3 * HOUR),
          voterReminder24h: true,
          autoReminderSentAt: null,
        },
      ],
    };
    expect(computeSweepNextDue(input, now)).toBe(t(3 * HOUR).getTime());
  });

  it("klauzula prozora, ne filtar budućnosti, izbacuje kratke izbore (mutacijski diskriminant)", () => {
    // Za svaki STVARNO počeo izbor (startsAt <= now) "endsAt − LEAD u
    // budućnosti" već povlači "prozor > LEAD", pa D7 filtar maskira brisanje
    // klauzule i mutacija tiho preživi. Jedini ulaz koji razdvaja ta dva
    // mehanizma ima startsAt u budućnosti — u praksi nedostižan (SCHEDULED se
    // preklapa točno u startsAt), ali test mora prikovati klauzulu, ne filtar.
    // Prozor TOČNO = LEAD usput prikiva i strogu `>` granicu autoReminderDue.
    const end = t(2 * HOUR + REMINDER_LEAD_MS);
    const input = {
      ...empty,
      active: [
        {
          startsAt: t(2 * HOUR),
          endsAt: end,
          voterReminder24h: true,
          autoReminderSentAt: null,
        },
      ],
    };
    // Bez klauzule bi endsAt − LEAD = +2 h (budući) pridonio i pobijedio min;
    // s njom ostaje samo zatvaranje.
    expect(computeSweepNextDue(input, now)).toBe(end.getTime());
  });

  it("sama buduća arhiva vraća njezin expiresAt", () => {
    const exp = t(48 * HOUR);
    expect(
      computeSweepNextDue({ ...empty, nextArchiveExpiry: exp }, now),
    ).toBe(exp.getTime());
  });

  it("D7: prošla vremena su isključena — istekli-ali-zadržani biljeg arhive ne prikiva vrata", () => {
    // Pro organizacija s isteklim biljegom kojeg ništa ne briše: obrezivanje ga
    // namjerno čuva, a rok metle NE smije zbog njega ostati trajno u prošlosti.
    expect(
      computeSweepNextDue({ ...empty, nextArchiveExpiry: t(-24 * HOUR) }, now),
    ).toBeNull();
    expect(
      computeSweepNextDue({ ...empty, nextScheduledStart: t(-1 * HOUR) }, now),
    ).toBeNull();
  });

  it("minimum preko svih kategorija", () => {
    const input = {
      nextScheduledStart: t(6 * HOUR),
      active: [plainActive(t(-2 * HOUR), t(4 * HOUR))],
      nextArchiveExpiry: t(9 * HOUR),
    };
    expect(computeSweepNextDue(input, now)).toBe(t(4 * HOUR).getTime());
  });

  it("sve prazno → null", () => {
    expect(computeSweepNextDue(empty, now)).toBeNull();
  });
});

// ───────── Redis polovica ─────────

const client = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
};

function configureUpstash() {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
}

beforeEach(() => {
  client.get.mockReset().mockResolvedValue(null);
  client.set.mockReset().mockResolvedValue("OK");
  client.del.mockReset().mockResolvedValue(1);
  vi.mocked(Redis.fromEnv).mockReset().mockReturnValue(client as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sweepDue", () => {
  it("nekonfiguriran Upstash → true, bez ijednog Redis poziva", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    expect(await sweepDue(now)).toBe(true);
    expect(Redis.fromEnv).not.toHaveBeenCalled();
  });

  it("Redis baci → true (fail open, nikad fail closed)", async () => {
    configureUpstash();
    client.get.mockRejectedValue(new Error("upstash down"));
    expect(await sweepDue(now)).toBe(true);
  });

  it("ključa nema → true", async () => {
    configureUpstash();
    client.get.mockResolvedValue(null);
    expect(await sweepDue(now)).toBe(true);
    expect(client.get).toHaveBeenCalledWith(SWEEP_GATE_KEY);
  });

  it("budući zapis → false — jedina staza koja preskače bazu", async () => {
    configureUpstash();
    client.get.mockResolvedValue(now.getTime() + HOUR);
    expect(await sweepDue(now)).toBe(false);
  });

  it("prošli ili upravo stigli zapis → true", async () => {
    configureUpstash();
    client.get.mockResolvedValue(now.getTime() - 1);
    expect(await sweepDue(now)).toBe(true);
    client.get.mockResolvedValue(now.getTime());
    expect(await sweepDue(now)).toBe(true);
  });
});

describe("storeSweepNextDue", () => {
  it("sprema rok s TTL-om", async () => {
    configureUpstash();
    const ts = now.getTime() + HOUR;
    await storeSweepNextDue(ts);
    expect(client.set).toHaveBeenCalledWith(SWEEP_GATE_KEY, ts, {
      ex: SWEEP_GATE_TTL_SECONDS,
    });
  });

  it("null → stražar (MAX_SAFE_INTEGER); TTL je taj koji ponovno otvara vrata", async () => {
    configureUpstash();
    await storeSweepNextDue(null);
    expect(client.set).toHaveBeenCalledWith(
      SWEEP_GATE_KEY,
      Number.MAX_SAFE_INTEGER,
      { ex: SWEEP_GATE_TTL_SECONDS },
    );
  });

  it("odbijeni set svejedno razrješava", async () => {
    configureUpstash();
    client.set.mockRejectedValue(new Error("upstash down"));
    await expect(storeSweepNextDue(123)).resolves.toBeUndefined();
  });
});

describe("clearSweepGate", () => {
  it("briše ključ", async () => {
    configureUpstash();
    await clearSweepGate();
    expect(client.del).toHaveBeenCalledWith(SWEEP_GATE_KEY);
  });

  it("odbijeni del svejedno razrješava — gutanje je nosivo (mutacija ne smije pasti zbog Redisa)", async () => {
    configureUpstash();
    client.del.mockRejectedValue(new Error("upstash down"));
    await expect(clearSweepGate()).resolves.toBeUndefined();
  });

  it("nekonfiguriran Upstash → no-op koji razrješava", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    await expect(clearSweepGate()).resolves.toBeUndefined();
    expect(Redis.fromEnv).not.toHaveBeenCalled();
  });
});
