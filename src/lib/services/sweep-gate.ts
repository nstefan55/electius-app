import "server-only";

import { Redis } from "@upstash/redis";
import { REMINDER_LEAD_MS } from "@/lib/services/publication.service";
import { tokenExpiry } from "@/lib/services/token.service";

// Vrata metle (cron-sweep-gate-spec): ruta odgovara na većinu pingova iz samog
// Upstasha (HTTP — ne budi Neon) i pokreće Postgres prolaze tek kad spremljeni
// nextDue stigne, kad ključa nema ili kad je Redis nedostupan. Jedina
// invarijanta (D3): vrata smiju zakasniti najviše TTL, nikad zauvijek —
// svaka greška ovdje pada u smjeru "meti kao danas".

export const SWEEP_GATE_KEY = "sweep:nextDue";
// D5: 1 h — najgore kašnjenje svega što ne pokriva invalidacija, ujedno i
// ritam metle u praznom hodu (~24 buđenja dnevno). Jedna linija za prilagodbu.
export const SWEEP_GATE_TTL_SECONDS = 60 * 60;

// "Nema budućih događaja" — TTL je taj koji ponovno otvara vrata.
const SENTINEL = Number.MAX_SAFE_INTEGER;

export interface SweepScheduleInput {
  /** min startsAt preko SCHEDULED izbora */
  nextScheduledStart: Date | null;
  /** svi ACTIVE izbori — četiri skalarna stupca */
  active: {
    startsAt: Date;
    endsAt: Date;
    voterReminder24h: boolean;
    autoReminderSentAt: Date | null;
  }[];
  /** min budući expiresAt preko neobrezanih arhiva */
  nextArchiveExpiry: Date | null;
}

/**
 * Najraniji STROGO BUDUĆI trenutak u kojem neki prolaz metle ima posla (D7:
 * prošla-ali-zadržana vremena, npr. istekli biljeg Pro arhive, ne smiju držati
 * vrata trajno otvorenima). Slijepo na prava (D6) — prolaz ih ionako sam
 * provjerava. Prečke izlaznosti ne pridonose ništa (D9, jašu na TTL-u).
 */
export function computeSweepNextDue(
  input: SweepScheduleInput,
  now: Date,
): number | null {
  const t = now.getTime();
  const times: number[] = [];

  if (input.nextScheduledStart) times.push(input.nextScheduledStart.getTime());

  for (const e of input.active) {
    // Zatvaranje: ISTI sidreni rok koji čita windowOver — uvezen, nikad
    // prepisan kao "endsAt ili startsAt + 30 d" (invarijanta #5).
    times.push(tokenExpiry(e.startsAt, e.endsAt).getTime());

    // Podsjetnik: zrcali klauzule autoReminderDue — nezauzet biljeg i prozor
    // dulji od najave (ista klauzula izbacuje i rezervirani datum).
    if (
      e.voterReminder24h &&
      e.autoReminderSentAt === null &&
      e.endsAt.getTime() - e.startsAt.getTime() > REMINDER_LEAD_MS
    ) {
      times.push(e.endsAt.getTime() - REMINDER_LEAD_MS);
    }
  }

  if (input.nextArchiveExpiry) times.push(input.nextArchiveExpiry.getTime());

  const future = times.filter((x) => x > t);
  return future.length ? Math.min(...future) : null;
}

// ponytail: vlastita tri retka umjesto izvoza klijenta iz rate-limit.ts — taj
// modul je o ograničavanju; dijeljeni klijent bio bi apstrakcija bez potrebe.
// Konstrukcija po pozivu: Upstash klijent je goli HTTP omotač, nema veze koja
// bi se držala, a provjera env-a po pozivu drži testove bez resetModules plesa.
function redis(): Redis | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }
  return Redis.fromEnv();
}

/**
 * Treba li ovaj ping pokrenuti prolaze. `false` SAMO za prisutan, budući
 * zapis — jedina staza koja preskače bazu; sve ostalo (nekonfigurirano,
 * greška, ključa nema, vrijeme stiglo) otvara vrata.
 */
export async function sweepDue(now: Date = new Date()): Promise<boolean> {
  const r = redis();
  if (!r) return true;
  try {
    const stored = await r.get<number>(SWEEP_GATE_KEY);
    if (typeof stored !== "number") return true;
    return stored <= now.getTime();
  } catch {
    return true; // fail open — ispad Upstasha ne smije zaustaviti metlu (D3)
  }
}

/** Spremi sljedeći rok (null → stražar) s TTL-om; greške guta. */
export async function storeSweepNextDue(ts: number | null): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.set(SWEEP_GATE_KEY, ts ?? SENTINEL, {
      ex: SWEEP_GATE_TTL_SECONDS,
    });
  } catch {
    // Izgubljeni upis = otvorena vrata — D3 smjer, ništa za raditi.
  }
}

/**
 * Invalidacija za mutacije (createElection zakazani način, startElection).
 * Nikad ne baca: mutacija ne smije pasti jer je Redis štucnuo — izgubljena
 * invalidacija je D3-om omeđen slučaj (TTL).
 */
export async function clearSweepGate(): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.del(SWEEP_GATE_KEY);
  } catch {
    // Guta namjerno — vidi gore.
  }
}
