import { NextResponse, type NextRequest } from "next/server";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";

// Registration endpoint (auth-phase-3-spec). A thin wrapper over BetterAuth's
// signUpEmail so one engine owns the whole flow: it rejects existing users,
// enforces email format + password length (8–128), salts + hashes with scrypt
// (the configured default in lib/auth), creates the user, and — autoSignIn —
// opens a session whose Set-Cookie we forward. The only check BetterAuth
// doesn't do is the confirmPassword match, added here.
// ponytail: field checks are plain guards, not zod — zod isn't installed yet;
// adopt it here when it lands per coding-standards.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "invalid_input" },
      { status: 400 },
    );
  }

  const { name, email, password, confirmPassword } = (body ?? {}) as Record<
    string,
    unknown
  >;
  if (
    typeof name !== "string" ||
    name.trim() === "" ||
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof confirmPassword !== "string"
  ) {
    return NextResponse.json(
      { success: false, error: "invalid_input" },
      { status: 400 },
    );
  }
  if (password !== confirmPassword) {
    return NextResponse.json(
      { success: false, error: "password_mismatch" },
      { status: 400 },
    );
  }

  try {
    const { headers, response } = await auth.api.signUpEmail({
      body: { name: name.trim(), email, password },
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
        },
      },
      { status: 201 },
    );
    // Forward the autoSignIn session cookie(s) from BetterAuth's response.
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
