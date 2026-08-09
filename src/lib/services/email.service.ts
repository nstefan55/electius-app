import "server-only";

import { createHash } from "crypto";
import { Resend, type Tag } from "resend";
import { formatVotingDateTime } from "@/lib/elections-view";
import { voteUrl } from "@/lib/urls";
import { hashToken } from "./token.service";
import hr from "../../../messages/hr.json";
import en from "../../../messages/en.json";

// Email transport (project-overview §Service Layer): verification OTP,
// password reset, voter invitations. Copy lives in the i18n catalogs
// (auth.otpEmail etc.) — emails run outside next-intl's request context, so
// the service reads the catalogs directly instead of useTranslations.
// ponytail: locale defaults to hr (MVP) — BetterAuth's send hooks don't know
// the UI locale; thread it through when en ships.

const CATALOGS = { hr, en } as const;
type Locale = keyof typeof CATALOGS;

const resend = new Resend(process.env.RESEND_API_KEY);

// ───────── Prijenosni sloj (email-delivery-and-admin-turnout-spec §Faza 1) ────
//
// Svako slanje ide kroz send() ili sendBatch(). To je jedino mjesto gdje žive
// pošiljatelj, oznake i ključevi idempotentnosti — pet staza koje su ih same
// slagale značilo je pet prilika da se raziđu.

// Vrsta poruke. Ide u oznaku `type` na svakom slanju i jedino je po čemu se
// Resendovi zapisi mogu filtrirati; isti niz webhook čita natrag kad stigne
// odbijanje. `turnout` još nema pošiljatelja — dolazi u fazi 3.
export type EmailType =
  | "otp"
  | "reset"
  | "delete-account"
  | "invite"
  | "reminder"
  | "turnout";

// Pošiljatelj se razrješava pri PRVOM slanju, ne pri učitavanju modula — isti
// stav kao stripeClient(). Ovaj modul visi o BetterAuthu, a njega uvozi svaka
// prijavljena stranica: bacanje na vrhu modula srušilo bi cijelu aplikaciju
// kojoj varijabla nedostaje, umjesto samo slanja koje je stvarno traži.
//
// Zamjenske vrijednosti nema namjerno (2.4). Stari `onboarding@resend.dev`
// isporučivao je poštu s Resendove pješčane domene — dostavljivo, pogrešno i
// aplikaciji nevidljivo. Ista tiha klasa kvara kao Upstash i R2.
function sender(): string {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    throw new Error(
      "RESEND_FROM_EMAIL is not set — refusing to send from a fallback domain",
    );
  }
  return from;
}

// cuid nije osobni podatak, a jedini je trag po kojem se odbijena poruka vraća
// do retka birača (webhook dobiva oznake natrag). Adresa birača NIKAD ne ulazi
// u oznaku — Resendovi zapisi nisu mjesto za popis glasača.
function tagsFor(type: EmailType, electionId?: string): Tag[] {
  const tags: Tag[] = [{ name: "type", value: type }];
  if (electionId) tags.push({ name: "electionId", value: electionId });
  return tags;
}

// Ono što se stvarno šalje danas. Faza 2 ovo zamjenjuje s `template` + varijable
// (SDK ih tipizira kao isključive grane), pa je izdvojeno da promjena bude na
// jednom mjestu.
interface EmailBody {
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface SendMeta {
  type: EmailType;
  electionId?: string;
  // Samo za slanja koja se smiju ponoviti bez namjere (metla, ponovni poziv
  // funkcije). Poruke koje korisnik sam traži — OTP, reset, potvrda brisanja —
  // ključ NE nose: ondje je ponovni zahtjev zahtjev za NOVOM porukom.
  idempotencyKey?: string;
}

function requestOptions(meta: SendMeta) {
  return meta.idempotencyKey
    ? { idempotencyKey: meta.idempotencyKey }
    : undefined;
}

async function send(body: EmailBody, meta: SendMeta): Promise<void> {
  const { error } = await resend.emails.send(
    { ...body, from: sender(), tags: tagsFor(meta.type, meta.electionId) },
    requestOptions(meta),
  );

  // Tiho neposlana poruka ostavlja račun neupotrebljivim (nepotvrđena prijava,
  // reset koji korisnik čeka) ili birača bez glasačkog listića.
  if (error) throw new Error(`resend: ${error.message}`);
}

async function sendBatch(bodies: EmailBody[], meta: SendMeta): Promise<void> {
  const from = sender();
  const tags = tagsFor(meta.type, meta.electionId);

  const { error } = await resend.batch.send(
    bodies.map((body) => ({ ...body, from, tags })),
    requestOptions(meta),
  );

  if (error) throw new Error(`resend: ${error.message}`);
}

// Ključ se mora promijeniti kad se promijene tokeni (§1.4).
//
// Obje staze s čarobnom poveznicom ponovno kuju tokene pri svakom pozivu
// (delete + create), pa ponovni pokušaj neuspjelog komada legitimno nosi DRUGE
// poveznice. Ključ izveden iz birača bio bi stabilan preko ponovnog kovanja i
// tiho ugušio upravo taj pokušaj — a na njemu počiva invarijanta #7 ("slanje se
// ne poništava, status je red za ponavljanje"). Tiho, i samo na stazi kvara.
//
// Otisak skupa tokena ima točno traženo svojstvo: token je 256 nasumičnih bitova,
// pa novo kovanje daje novi ključ (ponovni pokušaj prolazi), dok istinski
// dvostruki zahtjev — ponovni poziv iste invokacije, s istim skovanim tokenima —
// daje isti ključ i biva odbačen.
//
// Uzima se POHRANJENI otisak (hashToken), ne sirovi token: to je ista vrijednost
// koju baza već drži, pa u izvod ne ulazi ništa tajno (invarijanta #2). Otisci se
// sortiraju jer poredak primatelja ovisi o upitu, a skup tokena ne.
//
// Specifikacija je tražila id-eve tokena; oni ne postoje — mintTokensFor piše
// kroz createMany, koji vraća broj, a ne retke. Otisak je ista tvrdnja bez
// dodatnog upita.
function ballotIdempotencyKey(
  kind: Extract<EmailType, "invite" | "reminder">,
  electionId: string,
  recipients: InvitationRecipient[],
): string {
  const digest = createHash("sha256")
    .update(
      recipients
        .map((r) => hashToken(r.rawToken))
        .sort()
        .join(":"),
    )
    .digest("hex")
    .slice(0, 16);

  return `${kind}:${electionId}:${digest}`;
}

// Shared branded action-link template (verification + password reset + voter
// invitations use the same layout: heading, body, CTA button, plain-link
// fallback, expiry note).
interface ActionEmailCopy {
  subject: string;
  heading: string;
  body: string;
  cta: string;
  fallback: string;
  expiry: string;
}

// ponytail: {name} placeholder interpolation by hand — these catalogs are read
// directly (outside next-intl's request context), so ICU formatting isn't available.
function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, key) => vars[key] ?? m);
}

// Admin-controlled values (election title, org name) get interpolated into the
// email HTML — escape them there. Subject + plain-text stay raw.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function actionEmailText(url: string, t: ActionEmailCopy): string {
  return `${t.body}\n\n${url}\n\n${t.expiry}`;
}

function actionEmailHtml(url: string, t: ActionEmailCopy): string {
  return `
      <div style="font-family:'Noto Sans',system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0A0A0A">
        <h1 style="font-size:20px;color:#1F2937;margin:0 0 16px">${t.heading}</h1>
        <p style="font-size:16px;line-height:1.6;margin:0 0 24px">${t.body}</p>
        <a href="${url}" style="display:inline-block;background:#1D4ED8;color:#FFFFFF;text-decoration:none;font-weight:600;padding:14px 32px;border-radius:8px">${t.cta}</a>
        <p style="font-size:14px;line-height:1.5;color:#4B5563;margin:24px 0 0">${t.fallback}</p>
        <p style="font-size:12px;line-height:1.5;color:#4B5563;margin:8px 0 0;word-break:break-all">${url}</p>
        <p style="font-size:12px;line-height:1.5;color:#4B5563;margin:24px 0 0">${t.expiry}</p>
      </div>`;
}

async function sendActionEmail(
  to: string,
  url: string,
  t: ActionEmailCopy,
  type: EmailType,
) {
  await send(
    {
      to,
      subject: t.subject,
      text: actionEmailText(url, t),
      html: actionEmailHtml(url, t),
    },
    { type },
  );
}

// ───────── Verification OTP (otp-implementation-auth-spec §3) ─────────

// The code IS the content — no link, no CTA button (the whole point is typing
// it). Plugin-generated digits only, so no HTML escaping needed.
interface OtpEmailCopy {
  subject: string;
  heading: string;
  body: string;
  expiry: string;
  ignore: string;
}

function otpEmailHtml(otp: string, t: OtpEmailCopy): string {
  return `
      <div style="font-family:'Noto Sans',system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0A0A0A">
        <h1 style="font-size:20px;color:#1F2937;margin:0 0 16px">${t.heading}</h1>
        <p style="font-size:16px;line-height:1.6;margin:0 0 24px">${t.body}</p>
        <p style="font-family:'Roboto Mono',ui-monospace,monospace;font-size:32px;letter-spacing:8px;font-weight:600;background:#F3F4F6;border-radius:8px;padding:16px 24px;text-align:center;margin:0 0 24px">${otp}</p>
        <p style="font-size:14px;line-height:1.5;color:#4B5563;margin:0 0 8px">${t.expiry}</p>
        <p style="font-size:12px;line-height:1.5;color:#4B5563;margin:0">${t.ignore}</p>
      </div>`;
}

export async function sendOtpEmail(
  to: string,
  otp: string,
  locale: Locale = "hr",
) {
  const t = CATALOGS[locale].auth.otpEmail;

  // Bez ključa idempotentnosti: svaki poziv nosi NOVU šifru, a "pošalji
  // ponovno" je zahtjev za novom porukom. Ključ bi ovdje ugušio upravo ono
  // što korisnik traži.
  await send(
    {
      to,
      subject: t.subject,
      text: `${t.body}\n\n${otp}\n\n${t.expiry}\n${t.ignore}`,
      html: otpEmailHtml(otp, t),
    },
    { type: "otp" },
  );
}

export async function sendResetPasswordEmail(
  to: string,
  url: string,
  locale: Locale = "hr",
) {
  await sendActionEmail(to, url, CATALOGS[locale].auth.resetEmail, "reset");
}

// Potvrda brisanja računa (profile-settings-phase-4-spec §2). Poveznica JE drugi
// faktor — bez nje se račun ne može obrisati ni iz prijavljene sesije.
export async function sendDeleteAccountEmail(
  to: string,
  url: string,
  locale: Locale = "hr",
) {
  await sendActionEmail(
    to,
    url,
    CATALOGS[locale].auth.deleteAccountEmail,
    "delete-account",
  );
}

// ───────── Voter invitations (election-publication-spec §3) ─────────

// One entry per voter; rawToken becomes the magic-link URL and is never
// persisted or logged (only the email body carries it).
export interface InvitationRecipient {
  email: string;
  rawToken: string;
}

export interface InvitationElection {
  // Nosi ga oznaka `electionId` i prefiks ključa idempotentnosti — jedini put
  // kojim se odbijena poruka vraća do izbora.
  id: string;
  title: string;
  organizationName: string;
}

// Batched invitation send — ≤100 recipients per call (Resend batch limit,
// chunking is the publication service's job). A batch call is atomic:
// it succeeds or fails whole, which is exactly the spec's per-chunk
// failure granularity. Throws on failure so the caller can leave the
// chunk's voters PENDING (retryable).
// Jedna staza slanja za oba teksta — razlikuje se samo blok kataloga i skup
// varijabli. Vrijednosti pod kontrolom administratora (naslov, ime
// organizacije) interpoliraju se u HTML, pa se ondje bježe; subject i čisti
// tekst ostaju sirovi.
async function sendBallotLinkEmails(
  kind: Extract<EmailType, "invite" | "reminder">,
  electionId: string,
  recipients: InvitationRecipient[],
  raw: ActionEmailCopy,
  vars: Record<string, string>,
  escaped: Record<string, string>,
) {
  const copy = (v: Record<string, string>): ActionEmailCopy => ({
    subject: fill(raw.subject, v),
    heading: fill(raw.heading, v),
    body: fill(raw.body, v),
    cta: raw.cta,
    fallback: raw.fallback,
    expiry: fill(raw.expiry, v),
  });
  const tText = copy(vars);
  const tHtml = copy(escaped);

  await sendBatch(
    recipients.map((r) => {
      const url = voteUrl(r.rawToken);
      return {
        to: r.email,
        subject: tText.subject,
        text: actionEmailText(url, tText),
        html: actionEmailHtml(url, tHtml),
      };
    }),
    {
      type: kind,
      electionId,
      idempotencyKey: ballotIdempotencyKey(kind, electionId, recipients),
    },
  );
}

export async function sendInvitationEmails(
  recipients: InvitationRecipient[],
  election: InvitationElection,
  locale: Locale = "hr",
) {
  if (recipients.length === 0) return;

  await sendBallotLinkEmails(
    "invite",
    election.id,
    recipients,
    CATALOGS[locale].voter.inviteEmail,
    { title: election.title, org: election.organizationName },
    {
      title: escapeHtml(election.title),
      org: escapeHtml(election.organizationName),
    },
  );
}

// ───────── Podsjetnici (pro-features §2) ─────────

// Podsjetnik je do sada doslovno ponavljao pozivnicu, pa je birač dobivao ono
// što se čita kao duplikat poziva — a automatski podsjetnik stiže nepozvan, pa
// je to gore. Vlastiti tekst navodi rok i, važnije, kaže istinu o rotaciji
// poveznice: svako podsjećanje ponovno kuje token, pa vrijedi samo posljednja
// primljena veza. Bez te rečenice birač s dvije poruke ne zna koja radi.
export interface ReminderElection extends InvitationElection {
  endsAt: Date;
}

export async function sendReminderEmails(
  recipients: InvitationRecipient[],
  election: ReminderElection,
  locale: Locale = "hr",
) {
  if (recipients.length === 0) return;

  // Datum se oblikuje ovdje, uz tekst: locale koji bira katalog isti je onaj
  // koji oblikuje rok, pa se format i jezik ne mogu razići. Isti UTC formatter
  // koji koriste zaslon i izvještaj (invarijanta #5).
  const closes = formatVotingDateTime(election.endsAt.toISOString(), locale);

  await sendBallotLinkEmails(
    "reminder",
    election.id,
    recipients,
    CATALOGS[locale].voter.reminderEmail,
    { title: election.title, org: election.organizationName, closes },
    {
      title: escapeHtml(election.title),
      org: escapeHtml(election.organizationName),
      closes: escapeHtml(closes),
    },
  );
}
