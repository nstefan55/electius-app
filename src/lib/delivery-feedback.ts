import type { WebhookEventPayload } from "resend";

// Čista polovica Resendovog webhooka za dostavu
// (email-delivery-and-admin-turnout-spec §1.6). Ruta provjerava potpis i piše;
// KOJA je činjenica stigla i SMIJE li dirati retke birača, odlučuje se ovdje.
// Isti rez kao archive-prune.ts prema metli, i isti razlog: pravilo se tako da
// testirati bez rute, baze i mreže (invarijanta #8 — testovi pokrivaju
// src/actions i src/lib).
//
// Bez ijednog uvoza koji nešto pokreće — `type` uvoz iz `resend` briše se pri
// prevođenju, pa ovaj modul ne povlači ni SDK ni prisma singleton. Isti razlog
// zbog kojeg dashboard-paths.ts stoji sam.

// Događaji koji znače "poruka nije stigla i neće".
//
// email.opened i email.clicked namjerno NISU ovdje i ne smiju se pretplatiti:
// praćenje je isključeno na domeni jer poveznica u pozivnici JEST sirovi token
// (§3.1, invarijanta #2). Popis je i pretplata na Resendu i grana ovdje — ako
// se raziđu, stigne događaj koji nitko ne obrađuje.
export const DELIVERY_FAILURE_EVENTS = [
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
] as const;

export type DeliveryFailureEvent = Extract<
  WebhookEventPayload,
  { type: (typeof DELIVERY_FAILURE_EVENTS)[number] }
>;

// Izričito sužavanje tipa, a ne Set.has(): `data.to` postoji samo na događajima
// o e-pošti — kontakt i domena ga nemaju — pa provjera mora suziti tip, inače
// ruta čita polje koje na nekim granama ne postoji.
export function isDeliveryFailure(
  event: WebhookEventPayload,
): event is DeliveryFailureEvent {
  return (DELIVERY_FAILURE_EVENTS as readonly string[]).includes(event.type);
}

export interface DeliveryFailure {
  event: DeliveryFailureEvent["type"];
  emailId: string;
  // Oznake stižu natrag kao Record<string, string> s vodova, pa su to obični
  // nizovi — ne EmailType. Tipizirati ih strože značilo bi tvrditi o tuđem
  // ulazu nešto što se ne provjerava.
  type?: string;
  electionId?: string;
  recipients: string[];
  failedAt: Date;
}

export function readDeliveryFailure(
  event: DeliveryFailureEvent,
): DeliveryFailure {
  const tags = event.data.tags ?? {};

  return {
    event: event.type,
    emailId: event.data.email_id,
    type: tags.type,
    electionId: tags.electionId,
    recipients: event.data.to,
    failedAt: parseEventTime(event.created_at),
  };
}

// Vrijeme DOGAĐAJA, ne trenutak obrade: webhook se ponavlja i kasni, pa bi
// `new Date()` bilježio kad smo poruku pročitali, a ne kad je dostava pala.
// Neispravan datum ne smije srušiti obradu — činjenica o odbijanju vrijedi i
// bez točnog vremena.
export function parseEventTime(value: string): Date {
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? new Date() : at;
}

// Smije li ovo odbijanje žigosati retke birača.
//
// Samo pozivnica i podsjetnik idu biračima; otp, reset i potvrda brisanja idu
// administratorima, koji nemaju redak u `voters` — i njihove poruke zato ne nose
// oznaku electionId. Bez ovog uvjeta odbijena administratorska poruka pokrenula
// bi upit bez ikakvog izbora u WHERE klauzuli.
export function stampsVoters(
  failure: DeliveryFailure,
): failure is DeliveryFailure & { electionId: string } {
  return Boolean(failure.electionId) && failure.recipients.length > 0;
}
