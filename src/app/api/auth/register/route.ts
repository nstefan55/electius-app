import { NextResponse, type NextRequest } from "next/server";
import { APIError } from "better-auth/api";
import * as z from "zod";
import { auth, emailVerificationEnabled } from "@/lib/auth";
import { checkRateLimit, clientIp, retryAfterSeconds } from "@/lib/rate-limit";
import { routing } from "@/i18n/routing";

// Length caps only — email format and password policy (8–128) are BetterAuth's
// job downstream; the caps stop unbounded strings reaching the DB (2026-07-21
// audit, LOW: name had no upper bound and is rendered in the sidebar/settings).
const registerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().max(255),
  password: z.string().max(128),
  confirmPassword: z.string().max(128),
  locale: z.unknown().optional(),
});

// Registration endpoint (auth-phase-3-spec). A thin wrapper over BetterAuth's
// signUpEmail so one engine owns the whole flow: it rejects existing users,
// enforces email format + password length (8–128), salts + hashes with scrypt
// (the configured default in lib/auth), creates the user, and sends the
// verification email (sendOnSignUp) — with requireEmailVerification on, no
// session opens until the link is clicked; the emailed link's callbackURL
// lands the verified (and auto-signed-in) user on /{locale}/setup. The only
// check BetterAuth doesn't do is the confirmPassword match, added here.
export async function POST(request: NextRequest) {
  // Rate limit BEFORE parsing — registration is email-sending, keyed by IP
  // only (rate-limiting-spec: 3/h). The BetterAuth paths get the same
  // treatment via the hook in lib/auth; this route limits itself because its
  // server-side signUpEmail call carries no client IP for that hook to read.
  const limit = await checkRateLimit("register", clientIp(request.headers));
  if (!limit.success) {
    const seconds = retryAfterSeconds(limit.reset);
    return NextResponse.json(
      {
        success: false,
        error: "rate_limited",
        message: `Too many attempts. Please try again in ${Math.ceil(seconds / 60)} minutes.`,
      },
      { status: 429, headers: { "Retry-After": String(seconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "invalid_input" },
      { status: 400 },
    );
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "invalid_input" },
      { status: 400 },
    );
  }
  const { name, email, password, confirmPassword, locale } = parsed.data;
  const safeLocale =
    routing.locales.find((l) => l === locale) ?? routing.defaultLocale;
  if (password !== confirmPassword) {
    return NextResponse.json(
      { success: false, error: "password_mismatch" },
      { status: 400 },
    );
  }

  try {
    const { headers, response } = await auth.api.signUpEmail({
      body: {
        name,
        email,
        password,
        // Isti već normalizirani jezik koji ide u callbackURL sada i ostaje na
        // retku. Mora se postaviti OVDJE, a ne poslije: OTP šalje sendOnSignUp
        // iz same signUpEmail, pa bi naknadni update stigao nakon poruke i prva
        // bi uvijek bila hr. Prima ga user.additionalFields u lib/auth.
        locale: safeLocale,
        callbackURL: `/${safeLocale}/setup`,
      },
      returnHeaders: true,
    });

    const res = NextResponse.json(
      {
        success: true,
        data: {
          user: {
            id: response.user.id,
            name: response.user.name,
            email: response.user.email,
          },
          // The form branches on this: true → "check your inbox" panel,
          // false → straight into the /setup funnel (autoSignIn cookie below).
          verificationRequired: emailVerificationEnabled,
        },
      },
      { status: 201 },
    );
    // With requireEmailVerification there's no autoSignIn cookie to forward;
    // with verification disabled this loop forwards the autoSignIn cookie.
    for (const cookie of headers.getSetCookie()) {
      res.headers.append("set-cookie", cookie);
    }
    return res;
  } catch (error) {
    if (error instanceof APIError) {
      // e.g. USER_ALREADY_EXISTS (422), PASSWORD_TOO_SHORT, INVALID_EMAIL —
      // pass the code through for the form to localize.
      return NextResponse.json(
        { success: false, error: error.body?.code ?? "server_error" },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { success: false, error: "server_error" },
      { status: 500 },
    );
  }
}
