import "server-only";

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error("STRIPE_SECRET_KEY nije postavljen");

// Bidirekcijska zaštita. Test ključ u produkciji zaustavlja deploy koji ne
// naplaćuje ništa; live ključ izvan produkcije zaustavlja lokalni test koji
// naplaćuje stvarni novac — gori kvar, i onaj koji jednosmjerna provjera propusti.
const isProd = process.env.NODE_ENV === "production";
if (isProd && key.startsWith("sk_test_")) throw new Error("Test ključ u produkciji");
if (!isProd && key.startsWith("sk_live_")) throw new Error("Live ključ izvan produkcije");

// ponytail: bez pina API verzije — SDK prati verziju s računa, što je ono što
// projekt s jednom integracijom želi. Pinirati kad se verzija plugina i naša raziđu.
export const stripe = new Stripe(key);
