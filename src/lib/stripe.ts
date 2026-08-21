import "server-only";

import Stripe from "stripe";

// Faza 2: instanca se gradi na prvi poziv, ne pri učitavanju modula.
// Razlog nije stil. Plugin se montira u lib/auth/index.ts, koji preko
// require-session uvozi praktički cijela aplikacija — da provjere ostanu na
// vrhu datoteke, prazan STRIPE_SECRET_KEY bi rušio SVAKU prijavljenu stranicu,
// a produkcija ključeve nema i neće ih imati dok ne postoji pravni subjekt
// (pre-incorporation-billing-spec). U fazi 1 modul nitko nije uvozio, pa su
// "pri inicijalizaciji" i "pri prvom pozivu" bili isti trenutak; sad se
// razilaze, a ovo je sigurna strana. Provjere su nedirnute i dalje padaju
// glasno — samo u trenutku kad nešto stvarno poseže za Stripeom.

let client: Stripe | null = null;

export function stripeClient(): Stripe {
  if (client) return client;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY nije postavljen");

  // Bidirekcijska zaštita. Test ključ u produkciji zaustavlja deploy koji ne
  // naplaćuje ništa; live ključ izvan produkcije zaustavlja lokalni test koji
  // naplaćuje stvarni novac — gori kvar, i onaj koji jednosmjerna provjera propusti.
  //
  // Pitanje je "jesam li stvarno live", a NODE_ENV na njega ne odgovara: next build
  // ga postavlja na "production" na SVAKOM Vercel deployu, Preview uključen. VERCEL_ENV
  // razlikuje to dvoje, pa odlučuje kad postoji; NODE_ENV ostaje zamjena za lokalno i CI.
  // ponytail: lokalni next start s NODE_ENV=production i live ključem i dalje prolazi —
  // tražiti VERCEL_ENV === "production" za live ključ ako se ikad deploya izvan Vercela.
  const vercelEnv = process.env.VERCEL_ENV;
  const isProd = vercelEnv ? vercelEnv === "production" : process.env.NODE_ENV === "production";

  // Test ključ smeta samo kad korisnici stvarno mogu kupovati. Dok je naplata
  // ugašena nikoga ne zavarava, a produkcija je jedini deploy s pravim domenama.
  // Zastava se pali na lansiranju i tad se provjera sama vraća.
  // ⚠ Zamijeni ključeve PRIJE nego upališ zastavu — obrnutim redom throw pada pri
  // učitavanju modula i ruši svaku prijavljenu stranicu, ne samo naplatu.
  const billingLive = process.env.BILLING_ENABLED === "true";

  if (isProd && billingLive && key.startsWith("sk_test_")) throw new Error("Test ključ u produkciji");
  if (!isProd && key.startsWith("sk_live_")) throw new Error("Live ključ izvan produkcije");

  // ponytail: bez pina API verzije — SDK prati verziju s računa, što je ono što
  // projekt s jednom integracijom želi. Pinirati kad se verzija plugina i naša raziđu.
  client = new Stripe(key);
  return client;
}

// Je li naplatu uopće moguće montirati. Oba ključa moraju postojati: bez tajne
// webhooka plugin ne odbija montažu, nego tiho odbacuje svaki dolazni potpis —
// webhook koji 100 % vremena pada s uvjerljivim 400.
export const stripeConfigured = Boolean(
  process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET,
);
