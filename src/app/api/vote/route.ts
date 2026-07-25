import { NextResponse } from "next/server";
import { z } from "zod";
import {
  checkRateLimit,
  clientIp,
  retryAfterSeconds,
} from "@/lib/rate-limit";
import { castVote, VoteError } from "@/lib/services/vote.service";

// POST /api/vote — the vote-cast boundary (voter-flow spec §5). An API route,
// not a server action: voters have no session, per-IP rate limiting wants a
// real request, and the architecture table reserves /api/vote for future
// non-Next clients. The raw token is hashed inside vote.service and never
// logged or echoed.

const BodySchema = z.object({
  token: z.string().min(1).max(200),
  optionIds: z.array(z.string().min(1).max(64)).min(1).max(100),
});

const STATUS_BY_CODE = { selection: 400, used: 409, invalid: 410 } as const;

export async function POST(request: Request) {
  const limit = await checkRateLimit("vote", clientIp(request.headers));
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
    const { voteHash } = await castVote(body.token, body.optionIds);
    return NextResponse.json({ voteHash });
  } catch (err) {
    if (err instanceof VoteError) {
      return NextResponse.json(
        { code: err.code },
        { status: STATUS_BY_CODE[err.code] },
      );
    }
    return NextResponse.json({ code: "FAILED" }, { status: 500 });
  }
}
