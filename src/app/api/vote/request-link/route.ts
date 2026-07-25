import { NextResponse } from "next/server";
import { z } from "zod";
import {
  checkRateLimit,
  clientIp,
  retryAfterSeconds,
} from "@/lib/rate-limit";
import { resendVoterLink } from "@/lib/services/publication.service";

// POST /api/vote/request-link — QR / no-token entry + the expired-link CTA
// (voter-flow spec §4). ALWAYS 200 for a well-formed request: unknown email,
// already-voted voter, send failure — all identical, so the response can't be
// used to enumerate the voter list (same convention as forgot-password). Only
// 400 (malformed) and 429 (rate limit) differ.

const BodySchema = z.object({
  electionId: z.string().min(1).max(64),
  email: z.email().max(255),
});

export async function POST(request: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ code: "BAD_REQUEST" }, { status: 400 });
  }

  const identifier = `${clientIp(request.headers)}:${body.email.toLowerCase()}`;
  const limit = await checkRateLimit("resendVoteLink", identifier);
  if (!limit.success) {
    return NextResponse.json(
      { code: "RATE_LIMITED" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds(limit.reset)) },
      },
    );
  }

  try {
    await resendVoterLink(body.electionId, body.email);
  } catch {
    // Swallowed on purpose: a send failure only happens for on-list voters —
    // surfacing it would be an enumeration oracle.
  }
  return NextResponse.json({ success: true });
}
