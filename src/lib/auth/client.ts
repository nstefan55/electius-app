"use client";

import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import { stripeClient } from "@better-auth/stripe/client";

// Browser-side auth client. Same-origin /api/auth on the dashboard host — no
// baseURL needed (defaults to the current origin). emailOTPClient exposes
// authClient.emailOtp.verifyEmail / sendVerificationOtp for the OTP panel.
//
// stripeClient({ subscription: true }) je ono što uopće stvara
// authClient.subscription.* — bez njega prostor imena ne postoji i kartica
// naplate se ne prevodi. Registrira se bezuvjetno: klijentski plugin ne čita
// nijedan ključ, samo dodaje pozive prema rutama koje poslužitelj montira ili ne.
export const authClient = createAuthClient({
  plugins: [emailOTPClient(), stripeClient({ subscription: true })],
});
