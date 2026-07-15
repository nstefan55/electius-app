"use client";

import { createAuthClient } from "better-auth/react";

// Browser-side auth client. Same-origin /api/auth on the dashboard host — no
// baseURL needed (defaults to the current origin).
export const authClient = createAuthClient();
