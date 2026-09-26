import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeReceipt, RECEIPT_PATTERN } from "@/lib/merkle-verify";
import {
  checkRateLimit,
  clientIp,
  retryAfterSeconds,
} from "@/lib/rate-limit";
import { verifyReceipt } from "@/lib/services/verification.service";

// POST /api/verify — javna provjera verifikacijskog koda. Kôd putuje u TIJELU,
// nikad u URL-u: tijela ne završavaju u dnevnicima, a Sentry ih ionako briše
// (sentry-scrub.ts). Oblik se provjerava OVDJE — verifyMerkleProof namjerno ne
// provjerava ništa, pa loš ulaz dobiva 400, a ne tihi "ne".

const BodySchema = z.object({
  electionId: z.string().min(1).max(64),
  code: z
    .string()
    .max(200)
    .transform(normalizeReceipt)
    .pipe(z.string().regex(RECEIPT_PATTERN)),
});

export async function POST(request: Request) {
  const limit = await checkRateLimit("verifyReceipt", clientIp(request.headers));
  if (!limit.success) {
    return NextResponse.json(
      { code: "RATE_LIMITED" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds(limit.reset)) },
      },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ code: "BAD_REQUEST" }, { status: 400 });
  }

  try {
    const result = await verifyReceipt(body.electionId, body.code);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ code: "FAILED" }, { status: 500 });
  }
}
