import "server-only";

import type { VoterStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  mintTokenForVoter,
  mintTokensForPendingVoters,
  mintTokensForVoters,
  windowOver,
  type MintedToken,
} from "./token.service";
import {
  sendInvitationEmails,
  sendReminderEmails,
  sendTurnoutEmails,
  type InvitationElection,
  type RejectedIndices,
} from "./email.service";
import { turnoutPct } from "@/lib/elections-view";

// Publication pipeline (election-publication-spec §2): tokens → chunked Resend
// batch sends → per-voter INVITED tracking. Runs synchronously in-request
// (decision: sync now, chunked) — a timeout mid-send is self-consistent: sent
// chunks are INVITED, the rest PENDING, so a retry resumes where it stopped.
// No rollback is attempted; emails cannot be unsent.

// Resend's batch endpoint takes ≤100 emails per call.
export const CHUNK_SIZE = 100;

export function chunk<T>(items: T[], size: number = CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export interface PublishResult {
  sent: number;
  failed: number;
  // Zašto je poslano 0: "nitko nije trebao pozivnicu" i "nitko nije dostupan
  // jer je glasanje gotovo" su različite činjenice. Jedan diskriminator za sve
  // tri površine koje prikazuju rezultat slanja.
  blocked?: "windowOver";
}

// Izbori s podacima koje slanje treba: tekst e-pošte + rok za provjeru prozora.
export type SendableElection = InvitationElection & {
  startsAt: Date;
  endsAt: Date;
};

// Slanje odbijeno u trenutku poziva — Resend je poziv primio i OVOG primatelja
// odbio (§Faza 4). Druga polovica istog stupca koji webhook žigoše kad dostava
// padne poslije prihvaćanja: administratora zanima "tko ovo nije dobio", a ne
// kojim je od dva puta ta činjenica stigla.
//
// Status se NE dira. Birač ostaje PENDING, dakle u redu za ponavljanje
// (invarijanta #7) — stupac red samo označava, ne vadi ga iz njega.
//
// Vrijeme je `new Date()`, za razliku od webhooka koji uzima vrijeme DOGAĐAJA:
// odbijanje pri slanju vidimo dok se događa, a webhook kasni i ponavlja se.
async function stampDeliveryFailure(voterIds: string[]) {
  await prisma.voter.updateMany({
    where: { id: { in: voterIds } },
    data: { deliveryFailedAt: new Date() },
  });
}

// Sequential, not parallel — respects Resend's 2 req/s rate limit.
//
// Zrnatost kvara je PO PRIMATELJU (§Faza 4), ne više po komadu: batchValidation
// "permissive" vraća indekse odbijenih, pa prihvaćeni prelaze u INVITED, a
// odbijeni ostaju PENDING → i dalje ih hvata resendInvitations. Prije ovoga je
// jedna mrtva adresa vraćala svih 100 birača u PENDING, a ponovni pokušaj kovao
// 100 novih poveznica da bi popravio jednu.
//
// Poziv koji padne CIJELI i dalje pada cijeli — bacanje znači da Resend poziv
// nije ni primio, pa se o pojedinim primateljima ne zna ništa.
//
// Pošiljatelj je parametar, a ne grana: pozivnica i podsjetnik dijele komadanje,
// prijelaz u INVITED i brojanje neuspjelih, a razlikuju se samo tekstom.
async function sendInChunks(
  minted: MintedToken[],
  send: (batch: MintedToken[]) => Promise<RejectedIndices>,
): Promise<PublishResult> {
  let sent = 0;
  let failed = 0;

  for (const batch of chunk(minted)) {
    try {
      const rejected = new Set(await send(batch));
      // Podjela po indeksu, pa je zbroj po konstrukciji točan i onda kad bi
      // Resend vratio indeks izvan polja — takav se ni s jednom stranom ne
      // poklopi, a obje strane i dalje čine cijeli komad.
      const accepted = batch.filter((_, i) => !rejected.has(i));
      const refused = batch.filter((_, i) => rejected.has(i));

      if (accepted.length > 0) {
        await prisma.voter.updateMany({
          where: { id: { in: accepted.map((m) => m.voterId) } },
          // Briše raniju oznaku kvara: prihvaćanje NIJE dostava, ali ako ova
          // poruka opet odbije, webhook je ponovno žigoše za nekoliko sekundi.
          // Oznaka time odgovara na pitanje "je li adresa sada pokvarena", a ne
          // "je li ikad bila" — drugo ostaje istinito zauvijek i beskorisno.
          data: { status: "INVITED", deliveryFailedAt: null },
        });
      }
      // Vlastiti catch: žig je BILJEŠKA uz red za ponavljanje, a ne slanje.
      // Unutar zajedničkog try-a neuspio upis oznake pao bi u granu ispod i
      // prijavio cijeli komad kao neposlan — uključujući primatelje koji su
      // maloprije prešli u INVITED. Isti stav kao brisanje R2 objekata u
      // sealElection/deleteElection: propali čišćenje ne obara posao koji je
      // već obavljen.
      if (refused.length > 0) {
        await stampDeliveryFailure(refused.map((m) => m.voterId)).catch(
          (error) => console.error("[publication] stamp failed", error),
        );
      }

      sent += accepted.length;
      failed += refused.length;
    } catch {
      failed += batch.length;
    }
  }

  return { sent, failed };
}

// Idempotent: only PENDING voters get tokens + emails, so calling this on an
// already-published election is a no-op — which is exactly what the Retry
// button and the scheduled sweep rely on.
export async function publishElection(
  electionId: string,
): Promise<PublishResult> {
  const election = await prisma.election.findUnique({
    where: { id: electionId },
    select: {
      title: true,
      startsAt: true,
      endsAt: true,
      organization: { select: { name: true } },
    },
  });
  if (!election) return { sent: 0, failed: 0 };

  // Prije kovanja: mrtva poveznica ne smije nikad otići.
  if (windowOver(election)) {
    return { sent: 0, failed: 0, blocked: "windowOver" };
  }

  const minted = await mintTokensForPendingVoters(electionId);
  if (minted.length === 0) return { sent: 0, failed: 0 };

  const invitation: InvitationElection = {
    id: electionId,
    title: election.title,
    organizationName: election.organization.name,
  };
  return sendInChunks(minted, (batch) => sendInvitationEmails(batch, invitation));
}

// Jedan birač, jedna poveznica — dijele je resend iz glasačkog toka i redak u
// popisu birača. Re-mint poništava prethodno poslanu poveznicu.
// Baca ako slanje padne CIJELO; pozivatelj odlučuje što s tim.
export type InviteResult = "sent" | "notFound" | "windowOver" | "rejected";

export async function inviteVoter(
  voterId: string,
  currentStatus: VoterStatus,
  election: SendableElection,
): Promise<InviteResult> {
  if (windowOver(election)) return "windowOver";

  const minted = await mintTokenForVoter(voterId);
  if (!minted) return "notFound";

  const rejected = await sendInvitationEmails([minted], election);

  // Odbijanje pri slanju više NIJE bacanje (permissive), pa se mora pročitati.
  // Bez ove grane bi jedini primatelj bio odbijen, a birač svejedno prešao u
  // INVITED — status bi tvrdio da je pozivnica poslana, a nije.
  if (rejected.length > 0) {
    await stampDeliveryFailure([voterId]);
    return "rejected";
  }

  // PENDING birač je sad stvarno dobio e-poštu — ista semantika kao skupni
  // prijelaz po komadu. INVITED ostaje INVITED, ali oznaka kvara pada i njemu:
  // uspješan ponovni pokušaj mora očistiti raniju.
  await prisma.voter.updateMany({
    where: { id: voterId },
    data: {
      deliveryFailedAt: null,
      ...(currentStatus === "PENDING" ? { status: "INVITED" as const } : {}),
    },
  });
  return "sent";
}

// Voter-initiated resend (voter-flow spec §4: QR entry + the expired-link CTA).
// Serves PENDING and INVITED voters of an ACTIVE election; anything else —
// unknown email, already voted, wrong election status — is a silent no-op so
// the caller can return an identical enumeration-safe response either way.
export async function resendVoterLink(
  electionId: string,
  email: string,
): Promise<void> {
  const election = await prisma.election.findUnique({
    where: { id: electionId },
    select: {
      status: true,
      title: true,
      startsAt: true,
      endsAt: true,
      organization: { select: { name: true } },
    },
  });
  // Prozor se provjerava PRIJE traženja birača — grana ovisi o izborima, ne o
  // tome je li adresa na popisu, pa nabrajanje ostaje nemoguće.
  // Nedostižno kroz UI otkako votingOver zatvara zaslon, ali endpoint je javan.
  if (!election || election.status !== "ACTIVE" || windowOver(election)) return;

  const voter = await prisma.voter.findFirst({
    where: {
      electionId,
      email: { equals: email.trim(), mode: "insensitive" },
      status: { not: "VOTED" },
    },
    select: { id: true, status: true },
  });
  if (!voter) return;

  await inviteVoter(voter.id, voter.status, {
    id: electionId,
    title: election.title,
    organizationName: election.organization.name,
    startsAt: election.startsAt,
    endsAt: election.endsAt,
  });
}

// ───────── Reminders (election-overview-phase-3-spec) ─────────

// Koliko prije zatvaranja ide automatski podsjetnik. Oglašeno je "24 sata", pa
// je konstanta i tekst e-pošte ista činjenica na dva mjesta — mijenja se oboje
// ili nijedno.
export const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

/**
 * Treba li ovim izborima SADA poslati automatski podsjetnik (pro-features §2).
 *
 * Čisto pravilo, odvojeno od metle, jer upit u metli je samo predfilter — isto
 * kao kod zatvaranja. Sve tri odluke koje ovo pravilo nosi donesene su na
 * /feature start:
 *
 * 1. Glasanje još traje. Podsjetnik nakon roka kovao bi tokene koji se rađaju
 *    istekli (vidi windowOver) — nitko nije dostupan, a svima bi umrla veza.
 * 2. Rok je unutar REMINDER_LEAD_MS. Ranije nije podsjetnik, nego druga
 *    pozivnica.
 * 3. Prozor glasanja je DULJI od REMINDER_LEAD_MS. Izbori otvoreni četiri sata
 *    nikad nisu imali trenutak "24 sata prije zatvaranja" dok su bili otvoreni,
 *    pa im podsjetnik ne pripada; bez ove klauzule takvi izbori rotiraju svaku
 *    poveznicu nekoliko minuta nakon što je pozivnica stigla. Ista klauzula
 *    usput izbacuje i čarobnjakov rezervirani datum (endsAt <= startsAt), gdje
 *    rok uopće nije stvaran — jedno pravilo, tri posla.
 *
 * @param election prozor glasanja izbora
 * @param now trenutak prolaza metle (ubrizgava se radi determinizma testova)
 */
export function autoReminderDue(
  election: { startsAt: Date; endsAt: Date },
  now: Date,
): boolean {
  const start = election.startsAt.getTime();
  const end = election.endsAt.getTime();
  const t = now.getTime();

  const stillOpen = end > t;
  const withinLead = end - t <= REMINDER_LEAD_MS;
  const longEnough = end - start > REMINDER_LEAD_MS;

  return stillOpen && withinLead && longEnough;
}

export interface ReminderTargets {
  recipients: string[]; // voter ids
  alreadyVoted: number;
  expired: number;
}

interface ReminderVoter {
  id: string;
  status: VoterStatus;
  token: { expiresAt: Date } | null;
}

// The one rule that decides who gets a reminder — the modal's preview counts and
// the actual send both go through it, so the button cannot promise "Send to 42"
// and deliver 39.
//
// `windowOver` means a freshly minted token would be born expired (expiry is
// derived from the election, not the voter), so nobody is reachable at all.
export function partitionReminderTargets(
  voters: ReminderVoter[],
  now: Date,
  windowOver: boolean,
): ReminderTargets {
  const recipients: string[] = [];
  let alreadyVoted = 0;
  let expired = 0;

  for (const voter of voters) {
    if (voter.status === "VOTED") {
      alreadyVoted++;
    } else if (windowOver || (voter.token != null && voter.token.expiresAt <= now)) {
      // An expired link can't be revived by re-minting — the replacement
      // inherits the same election-derived expiry.
      expired++;
    } else {
      // PENDING (never successfully emailed) and INVITED (emailed, hasn't
      // voted) both qualify — decision 2026-07-25.
      recipients.push(voter.id);
    }
  }

  return { recipients, alreadyVoted, expired };
}

export async function getReminderTargets(
  electionId: string,
): Promise<ReminderTargets> {
  const empty: ReminderTargets = { recipients: [], alreadyVoted: 0, expired: 0 };

  const election = await prisma.election.findUnique({
    where: { id: electionId },
    select: { startsAt: true, endsAt: true },
  });
  if (!election) return empty;

  const now = new Date();
  const voters = await prisma.voter.findMany({
    where: { electionId },
    select: { id: true, status: true, token: { select: { expiresAt: true } } },
  });

  // Isto pravilo koje čuva pet ostalih staza — ovdje je i nastalo.
  return partitionReminderTargets(voters, now, windowOver(election, now));
}

// Re-mints on the way out: the raw token is unrecoverable by design, so a
// reminder necessarily carries a NEW link and the original invitation's link
// stops working. A voter who clicks the older email lands on the voter-flow's
// invalid-link screen, which offers them a fresh one. Tekst podsjetnika to sada
// i kaže naglas (voter.reminderEmail), umjesto da birač s dvije poruke pogađa
// koja poveznica radi.
//
// Dijele je obje staze — ručni gumb i metla — pa se tekst ne može razići po
// tome tko je podsjetnik pokrenuo. Ovdje NEMA čitanja ni pisanja
// autoReminderSentAt: taj stupac pripada samo automatskom prolazu (odluka na
// /feature start), inače bi jedno ručno podsjećanje ugasilo oglašeni automatski
// podsjetnik.
export async function sendReminders(
  electionId: string,
): Promise<PublishResult> {
  const election = await prisma.election.findUnique({
    where: { id: electionId },
    select: {
      title: true,
      endsAt: true,
      organization: { select: { name: true } },
    },
  });
  if (!election) return { sent: 0, failed: 0 };

  const { recipients } = await getReminderTargets(electionId);
  const minted = await mintTokensForVoters(electionId, recipients);
  if (minted.length === 0) return { sent: 0, failed: 0 };

  const reminder = {
    id: electionId,
    title: election.title,
    organizationName: election.organization.name,
    endsAt: election.endsAt,
  };
  return sendInChunks(minted, (batch) => sendReminderEmails(batch, reminder));
}

// ───────── Obavijesti o izlaznosti (email-delivery §4) ─────────

/**
 * Javi administratorima organizacije da je izlaznost prešla prečku (§4.2, §4.3).
 *
 * Primatelji su SVI administratori organizacije, ne election.createdBy. Danas je
 * to isto (shema je 1 organizacija ↔ 1 administrator), ali izlaznost je činjenica
 * o organizaciji, a pravo se već razrješava po organizaciji, ne po sesiji. Čitanje
 * relacije košta isti upit i ne traži prepravku kad stignu dodatna mjesta.
 *
 * Bez filtriranja po emailVerified: nepotvrđen administrator je onaj koji se ne
 * može prijaviti, a ne onaj koji ne može primiti poštu — tiho ga izbaciti značilo
 * bi da značajka izgleda pokvareno.
 *
 * Sve brojke dolaze iz postojećih derivacija (invarijanta #5): _count je isti
 * izvor koji čita getElectionTurnout, a postotak računa turnoutPct.
 *
 * @param electionId izbori kojima je prečka upravo prijeđena
 * @param milestone prijeđena prečka (25 | 50 | 75) — već zauzeta u bazi
 */
export async function sendAdminTurnout(
  electionId: string,
  milestone: number,
): Promise<{ sent: number }> {
  const election = await prisma.election.findUnique({
    where: { id: electionId },
    select: {
      title: true,
      endsAt: true,
      quorumThreshold: true,
      _count: { select: { voters: true, votes: true } },
      organization: {
        select: { name: true, admins: { select: { email: true } } },
      },
    },
  });
  if (!election) return { sent: 0 };

  // Dedup po malim slovima: ista adresa upisana različitim slovima je jedan
  // sandučić, a dvije poruke o istoj prečki su kvar.
  const recipients = [
    ...new Set(election.organization.admins.map((a) => a.email.toLowerCase())),
  ];
  if (recipients.length === 0) return { sent: 0 };

  const votersTotal = election._count.voters;
  const votesCast = election._count.votes;

  const rejected = await sendTurnoutEmails(
    recipients,
    {
      id: electionId,
      title: election.title,
      organizationName: election.organization.name,
      endsAt: election.endsAt,
      quorumThreshold: election.quorumThreshold,
    },
    {
      milestone,
      // Stvarna izlaznost, ne prečka: skok s 10 % na 80 % javlja prijelaz preko
      // 75 %, ali u tablici stoji 80 % jer je to istina u trenutku slanja.
      turnoutPct: turnoutPct(votesCast, votersTotal),
      votesCast,
      votersTotal,
    },
  );

  // Broj koji metla objavljuje mora biti stvarno poslano, ne namjeravano:
  // administrator s neispravnom adresom se pod permissive slanjem odbija
  // pojedinačno, dok ostali dobiju poruku. Ovdje se ništa ne žigoše — nema
  // retka birača, administrator nije birač.
  return { sent: recipients.length - rejected.length };
}
