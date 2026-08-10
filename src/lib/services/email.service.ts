import "server-only";

import { createHash } from "crypto";
import { Resend, type Tag } from "resend";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import {
  formatVotingDateTime,
  quorumRequiredVoters,
} from "@/lib/elections-view";
import { electionOverviewUrl, voteUrl } from "@/lib/urls";
import { hashToken } from "./token.service";

// Email transport (project-overview §Service Layer): verification OTP, password
// reset, account deletion, voter invitations and reminders.
//
// Tekst više NIJE ovdje (faza 2). Svih pet poruka živi kao objavljen predložak u
// Resendu, a kod šalje samo alias i varijable — ispravak teksta je uređivanje u
// nadzornoj ploči, ne promjena koda, novi build i podizanje verzije.
// ponytail: locale i dalje pada na hr — nijedan pozivatelj ga ne prosljeđuje;
// provlačenje jezika je faza 4.

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

// Alias predloška u Resendu. Stabilan je i čitljiv, pa u kodu stoji on, a ne id.
// Jezik je DIO aliasa: predložak nosi tekst, pa je odabir jezika odabir
// predloška — nema drugog mjesta na kojem se jezik poruke odlučuje.
//
// Popis je potpun: faza 2 ga je držala na Exclude<EmailType, "turnout"> upravo
// zato da dodavanje pošiljatelja izlaznosti bez predloška bude pogreška
// prevođenja, a ne slanje na alias koji Resend ne poznaje. Predlošci
// electius-admin-turnout-{hr,en} sada postoje i objavljeni su.
const TEMPLATE: Record<EmailType, string> = {
  otp: "otp",
  reset: "reset",
  "delete-account": "delete-account",
  invite: "voter-invite",
  reminder: "voter-reminder",
  turnout: "admin-turnout",
};

function templateId(type: EmailType, locale: Locale): string {
  return `electius-${TEMPLATE[type]}-${locale}`;
}

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

// Tema pretplate (email-delivery §4.4). Nosi je SAMO poruka o izlaznosti — ona
// je jedina obavijest; ostalih pet su transakcijske i moraju stići i biraču koji
// je jednom kliknuo "odjava", inače im je tiho oduzeto pravo glasa (§3.2).
//
// Baca ako varijabla nedostaje, po uzoru na requiredPriceId: sigurne zamjenske
// vrijednosti nema. Slanje bez topicId-a prolazi, ali IGNORIRA odjavu — a tema
// postoji točno zato da je poštuje. Bolje nijedna poruka nego poruka koja gazi
// preferenciju primatelja.
function turnoutTopicId(): string {
  const id = process.env.RESEND_TURNOUT_TOPIC_ID;
  if (!id) {
    throw new Error(
      "RESEND_TURNOUT_TOPIC_ID is not set — refusing to send a notification that ignores unsubscribes",
    );
  }
  return id;
}

// SDK tipizira predložak i sirovi sadržaj kao isključive grane (`html?: never`
// uz `template`), pa je zamjena jednog drugim pogreška prevođenja.
//
// Brojevi su dopušteni jer ih Resend prima (`Record<string, string | number>`) i
// jer poruka o izlaznosti šalje same brojke; nizovi i objekti nisu — što je §3.3
// koji provodi sam prijenos, a ne komentar.
interface EmailBody {
  to: string;
  template: { id: string; variables: Record<string, string | number> };
  // Samo obavijesti (§3.2). Transakcijske poruke ga NE nose.
  topicId?: string;
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

// `{{{trostruka vitičasta}}}` u predlošku NE bježi (provjereno slanjem), a jedan
// predložak istim skupom varijabli puni i naslov i čisti tekst i HTML. Zato
// svaka vrijednost pod kontrolom administratora ide u PARU: sirova za naslov i
// tekst, pobjegla za HTML. Jedna varijabla ne može biti oboje — pobjegla bi u
// čistom tekstu ispisala `&#39;`, a sirova bi pustila `<b>` u sandučić birača.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ───────── Verification OTP (otp-implementation-auth-spec §3) ─────────

export async function sendOtpEmail(
  to: string,
  otp: string,
  locale: Locale = DEFAULT_LOCALE,
) {
  // Šifra JE sadržaj — predložak nema ni CTA gumb ni poveznicu, i jedina mu je
  // varijabla CODE, pa se poveznica ovdje ne može ni proslijediti.
  // Bez ključa idempotentnosti: svaki poziv nosi NOVU šifru, a "pošalji
  // ponovno" je zahtjev za novom porukom.
  await send(
    { to, template: { id: templateId("otp", locale), variables: { CODE: otp } } },
    { type: "otp" },
  );
}

async function sendActionLinkEmail(
  to: string,
  url: string,
  type: Extract<EmailType, "reset" | "delete-account">,
  locale: Locale,
) {
  await send(
    { to, template: { id: templateId(type, locale), variables: { URL: url } } },
    { type },
  );
}

export async function sendResetPasswordEmail(
  to: string,
  url: string,
  locale: Locale = DEFAULT_LOCALE,
) {
  await sendActionLinkEmail(to, url, "reset", locale);
}

// Potvrda brisanja računa (profile-settings-phase-4-spec §2). Poveznica JE drugi
// faktor — bez nje se račun ne može obrisati ni iz prijavljene sesije.
export async function sendDeleteAccountEmail(
  to: string,
  url: string,
  locale: Locale = DEFAULT_LOCALE,
) {
  await sendActionLinkEmail(to, url, "delete-account", locale);
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

// Batched send — ≤100 recipients per call (Resend batch limit, chunking is the
// publication service's job). A batch call is atomic: it succeeds or fails
// whole, which is exactly the spec's per-chunk failure granularity. Throws on
// failure so the caller can leave the chunk's voters PENDING (retryable).
//
// Jedna staza slanja za oba teksta — razlikuju se samo predloškom i skupom
// varijabli. Svaki element serije nosi VLASTITE varijable, pa je osobna
// poveznica po biraču izraziva kao varijabla; bez toga se ove dvije poruke ne bi
// mogle preseliti na predloške.
async function sendBallotLinkEmails(
  kind: Extract<EmailType, "invite" | "reminder">,
  election: InvitationElection,
  recipients: InvitationRecipient[],
  locale: Locale,
  extra: Record<string, string> = {},
) {
  const id = templateId(kind, locale);
  const shared = {
    TITLE: election.title,
    TITLE_HTML: escapeHtml(election.title),
    ORG: election.organizationName,
    ORG_HTML: escapeHtml(election.organizationName),
    ...extra,
  };

  await sendBatch(
    recipients.map((r) => ({
      to: r.email,
      template: { id, variables: { ...shared, URL: voteUrl(r.rawToken) } },
    })),
    {
      type: kind,
      electionId: election.id,
      idempotencyKey: ballotIdempotencyKey(kind, election.id, recipients),
    },
  );
}

export async function sendInvitationEmails(
  recipients: InvitationRecipient[],
  election: InvitationElection,
  locale: Locale = DEFAULT_LOCALE,
) {
  if (recipients.length === 0) return;

  await sendBallotLinkEmails("invite", election, recipients, locale);
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
  locale: Locale = DEFAULT_LOCALE,
) {
  if (recipients.length === 0) return;

  // Datum se oblikuje ovdje, uz odabir predloška: jezik koji bira tekst isti je
  // onaj koji oblikuje rok, pa se format i jezik ne mogu razići. Isti UTC
  // formatter koji koriste zaslon i izvještaj (invarijanta #5).
  //
  // CLOSES nema pobjeglog blizanca jer nije pod kontrolom administratora — to je
  // izlaz našeg formattera (Intl), bez znakova koje bi trebalo bježati.
  const closes = formatVotingDateTime(election.endsAt.toISOString(), locale);

  await sendBallotLinkEmails("reminder", election, recipients, locale, {
    CLOSES: closes,
  });
}

// ───────── Obavijesti o izlaznosti administratoru (email-delivery §4) ─────────

// Varijable poruke o izlaznosti. Tip JE zaštita (§3.3): NIJEDNO polje ne nosi
// zbroj po kandidatima, pa je dodavanje takvog podatka pogreška prevođenja, a ne
// stvar pregleda koda. Isti postupak kao VoterExportRow (bez tokena) i
// ElectionSnapshot (bez osobnih podataka birača).
//
// Zašto je to pravilo, a ne opreznost: za izbore s AFTER_CLOSE rezultatima zbroj
// je zapečaćen i od administratora (resultsAccess vraća "sealed"), pa bi poruka
// s brojkama po kandidatu isporučila u sandučić upravo ono što svaki zaslon
// odbija pokazati. Resendove varijable su usto samo string|number, pa popis
// kandidata ovdje nije ni izraziv.
interface TurnoutEmailVars {
  [key: string]: string | number;
  TITLE: string;
  TITLE_HTML: string;
  ORG: string;
  ORG_HTML: string;
  MILESTONE: number;
  TURNOUT_PCT: number;
  VOTES_CAST: number;
  VOTERS_TOTAL: number;
  CLOSES: string;
  QUORUM: string;
  URL: string;
}

export interface TurnoutElection extends InvitationElection {
  endsAt: Date;
  quorumThreshold: number | null;
}

export interface TurnoutFigures {
  milestone: number;
  turnoutPct: number;
  votesCast: number;
  votersTotal: number;
}

/**
 * Obavijest administratorima da je izlaznost prešla prečku (§4.3).
 *
 * Serija s jednim unosom po administratoru, a ne jedna poruka s više primatelja:
 * RESEND_UNSUBSCRIBE_URL je po primatelju, pa bi zajednički To: dao svima istu
 * poveznicu za odjavu — i usput otkrio adrese administratora jednu drugoj.
 *
 * Ključ idempotentnosti je `turnout:{izbori}:{prečka}`. Za razliku od staza s
 * čarobnom poveznicom ovdje nema ponovnog kovanja tokena, pa je ključ stabilan
 * po svojoj prirodi: isti izbori i ista prečka su ista poruka, koliko god puta
 * metla ponovno krenula.
 */
export async function sendTurnoutEmails(
  recipients: string[],
  election: TurnoutElection,
  figures: TurnoutFigures,
  locale: Locale = DEFAULT_LOCALE,
) {
  if (recipients.length === 0) return;

  // Datum se oblikuje ovdje, uz odabir predloška — isti razlog kao kod
  // podsjetnika: jezik koji bira tekst isti je onaj koji oblikuje datum.
  //
  // Rok, a ne odbrojavanje: "još 2 dana" je netočno čim se poruka otvori sat
  // vremena kasnije, a datum ostaje istinit. Isto obrazloženje po kojem
  // podsjetnik navodi rok umjesto preostalog vremena.
  const closes = formatVotingDateTime(election.endsAt.toISOString(), locale);

  // Bez riječi, pa ne treba ni prijevod ni pobjegli blizanac: koliko birača
  // treba (dijeljena derivacija quorumRequiredVoters) od koliko ih ima. Redak
  // iznad već pokazuje koliko ih je glasalo, pa je usporedba izravna.
  // Crtica kad kvorum nije postavljen — predložak nema uvjete, a prazna
  // vrijednost izgledala bi kao kvar prikaza.
  const quorum =
    election.quorumThreshold == null
      ? "—"
      : `${quorumRequiredVoters(figures.votersTotal, election.quorumThreshold)}/${figures.votersTotal}`;

  const variables: TurnoutEmailVars = {
    TITLE: election.title,
    TITLE_HTML: escapeHtml(election.title),
    ORG: election.organizationName,
    ORG_HTML: escapeHtml(election.organizationName),
    MILESTONE: figures.milestone,
    TURNOUT_PCT: figures.turnoutPct,
    VOTES_CAST: figures.votesCast,
    VOTERS_TOTAL: figures.votersTotal,
    CLOSES: closes,
    QUORUM: quorum,
    // Pregled izbora, nikad stranica rezultata (D6): zapečaćeni izbori je nemaju,
    // a poveznica koja na nekim izborima vodi u 404 gora je od one koja nikad ne
    // vodi.
    URL: electionOverviewUrl(election.id),
  };

  await sendBatch(
    recipients.map((to) => ({
      to,
      template: { id: templateId("turnout", locale), variables },
      topicId: turnoutTopicId(),
    })),
    {
      type: "turnout",
      electionId: election.id,
      idempotencyKey: `turnout:${election.id}:${figures.milestone}`,
    },
  );
}
