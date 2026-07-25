"use client";

import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

// Browser-side auth client. Same-origin /api/auth on the dashboard host — no
// baseURL needed (defaults to the current origin). emailOTPClient exposes
// authClient.emailOtp.verifyEmail / sendVerificationOtp for the OTP panel.
export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
});
