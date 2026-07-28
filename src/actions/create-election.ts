"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/require-session";
import { candidateRowSchema, voterRowSchema } from "@/lib/wizard-csv";

// Election creation wizard (all-elections phase 2). One action, two modes:
// full create (step 5 confirm) and draft save (top-bar link). Both are
// org-scoped through requireSession(); the client never supplies ids.
type CreateResult =
  | { success: true; data: { id: string } }
  | { success: false; error: string };

const wizardSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional(),
  electionType: z.enum(["STANDARD", "SURVEY", "POLL"]),
  votingType: z.enum(["SINGLE_CHOICE", "MULTI_CHOICE"]),
  allowAbstain: z.boolean(),
  candidates: z.array(candidateRowSchema).max(500),
  voters: z.array(voterRowSchema).max(10000),
  startMode: z.enum(["manual", "scheduled"]),
  // datetime-local strings ("YYYY-MM-DDTHH:mm"); empty string = not set
  startAt: z.string().max(30),
  closeAt: z.string().max(30),
  sealedResults: z.boolean(),
  quorumThreshold: z.number().int().min(1).max(100).nullable(),
  adminTurnoutReminder: z.boolean(),
  voterReminder24h: z.boolean(),
});
export type WizardPayload = z.infer<typeof wizardSchema>;

function parseLocalDate(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export async function createElection(
  input: unknown,
  draft = false,
): Promise<CreateResult> {
  const parsed = wizardSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "invalid" };
  const w = parsed.data;

  // Type/method coupling (spec: survey → multi only, quick poll → single only).
  // The UI enforces it too, but the action is the trust boundary.
  if (
    (w.electionType === "SURVEY" && w.votingType !== "MULTI_CHOICE") ||
    (w.electionType === "POLL" && w.votingType !== "SINGLE_CHOICE")
  ) {
    return { success: false, error: "coupling" };
  }

  const startAt = parseLocalDate(w.startAt);
  const closeAt = parseLocalDate(w.closeAt);

  if (!draft) {
    if (w.candidates.length < 2) return { success: false, error: "candidates" };
    if (w.startMode === "scheduled") {
      if (!startAt || !closeAt || closeAt <= startAt) {
        return { success: false, error: "schedule" };
      }
    } else if (closeAt && closeAt <= new Date()) {
      return { success: false, error: "schedule" };
    }
  }

  // Manual start stays DRAFT (admin opens voting later); a scheduled full
  // create is SCHEDULED. Drafts are always DRAFT regardless of start mode.
  const status = !draft && w.startMode === "scheduled" ? "SCHEDULED" : "DRAFT";

  // endsAt/startsAt are NOT NULL in the schema — DRAFT rows carry placeholder
  // dates and render "Not scheduled" (established phase-1 display rule).
  const now = new Date();
  const startsAt = w.startMode === "scheduled" ? (startAt ?? now) : now;
  const endsAt = closeAt ?? startsAt;

  // One row per unique email — @@unique([email, electionId]) would reject the
  // whole nested create on a duplicate.
  const seen = new Set<string>();
  const voters = w.voters.filter((v) => {
    const key = v.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  try {
    const { organizationId, user } = await requireSession();
    const admin = await prisma.user.findUnique({
      where: { email: user.email },
      select: { id: true },
    });
    if (!admin) return { success: false, error: "failed" };

    const election = await prisma.election.create({
      data: {
        title: w.title,
        description: w.description || null,
        electionType: w.electionType,
        votingType: w.votingType,
        status,
        startsAt,
        endsAt,
        sealedResults: w.sealedResults,
        allowAbstain: w.allowAbstain,
        quorumThreshold: w.quorumThreshold,
        adminTurnoutReminder: w.adminTurnoutReminder,
        voterReminder24h: w.voterReminder24h,
        organizationId,
        createdById: admin.id,
        options: {
          create: w.candidates.map((c, i) => ({
            text: c.name,
            description: c.role || null,
            orderIndex: i,
          })),
        },
        voters: {
          create: voters.map((v) => {
            const [firstName, ...rest] = v.name.split(" ");
            return {
              email: v.email,
              firstName,
              lastName: rest.join(" ") || null,
            };
          }),
        },
      },
      select: { id: true },
    });
    return { success: true, data: { id: election.id } };
  } catch {
    return { success: false, error: "failed" };
  }
}
