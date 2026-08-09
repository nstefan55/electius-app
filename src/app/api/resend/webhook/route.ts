import { NextResponse } from "next/server";
import { Resend, type WebhookEventPayload } from "resend";
import { prisma } from "@/lib/prisma";
import {
  isDeliveryFailure,
  readDeliveryFailure,
  stampsVoters,
} from "@/lib/delivery-feedback";

// Resendove povratne informacije o dostavi (email-delivery-and-admin-turnout-spec
// §1.5–1.6). Do sada ih nije bilo: odbijena pozivnica bila je nevidljiva, a
// birač s mrtvom adresom ostajao je INVITED zauvijek i tiho vukao izlaznost
// prema dolje.
//
// Izvan [locale] segmenta — nema next-intl konteksta, a i ne treba ga: ovdje ne
// nastaje nijedan tekst za korisnika.
//
// NIJE pod ograničenjem brzine, namjerno. Odgovor 429 webhooku dostave je
// izgubljena činjenica koju nitko neće ponovno poslati — isti razlog zbog kojeg
// je i Stripeov webhook izvan limitera.

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    // Bez tajne se potpis ne može provjeriti. Prihvatiti tijelo bez provjere
    // značilo bi pustiti bilo koga da žigoše retke birača.
    console.error("[resend-webhook] RESEND_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  // SIROVO tijelo — potpis pokriva bajtove. Parsiranje pa ponovno
  // serijaliziranje mijenja razmake i redoslijed ključeva i ruši provjeru.
  const payload = await request.text();

  // SDK ne prima Headers iz zahtjeva: `VerifyWebhookOptions.headers` je vlastito
  // sučelje { id, timestamp, signature }, koje se interno preslikava na
  // webhook-id / webhook-timestamp / webhook-signature (standard-webhooks).
  // Provjereno u typings-ima i u implementaciji, ne pretpostavljeno.
  const id = request.headers.get("webhook-id");
  const timestamp = request.headers.get("webhook-timestamp");
  const signature = request.headers.get("webhook-signature");

  // Izričito, umjesto oslanjanja na to kako biblioteka reagira na undefined:
  // ovo je granica povjerenja i nepotpisano tijelo ne smije stići do baze.
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let event: WebhookEventPayload;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret,
    });
  } catch {
    // Bez pojedinosti u odgovoru — razlog odbijanja nije informacija za
    // pošiljatelja koji nema valjan potpis.
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  if (!isDeliveryFailure(event)) {
    // Uvijek 200 na prepoznato-ali-nezanimljivo, inače Resend ponavlja.
    return NextResponse.json({ ok: true, handled: false });
  }

  const failure = readDeliveryFailure(event);

  // Adresa primatelja se NE zapisuje: odbijanje se dijagnosticira preko
  // email_id-a u Resendovim zapisima, gdje adresa ionako legitimno živi.
  // Vercelovi zapisi nisu mjesto za popis glasača — isti razlog zbog kojeg
  // oznake nose cuid, a ne e-poštu.
  console.error("[resend-webhook] delivery failure", {
    event: failure.event,
    emailId: failure.emailId,
    type: failure.type,
    electionId: failure.electionId,
    recipients: failure.recipients.length,
  });

  if (!stampsVoters(failure)) {
    return NextResponse.json({ ok: true, handled: true, stamped: 0 });
  }

  // Točno podudaranje adrese je ispravno: `to` je adresa koju smo POSLALI, a nju
  // gradimo iz retka birača — ista vrijednost, bajt po bajt. Nema potrebe za
  // neosjetljivim podudaranjem.
  //
  // Nikad se ne briše birač i ne dira glas (§1.6): webhook je izvor činjenice o
  // dostavi, a ne o pravu glasa.
  const { count } = await prisma.voter.updateMany({
    where: {
      electionId: failure.electionId,
      email: { in: failure.recipients },
    },
    data: { deliveryFailedAt: failure.failedAt },
  });

  return NextResponse.json({ ok: true, handled: true, stamped: count });
}
