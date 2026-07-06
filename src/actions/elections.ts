"use server";

import { prisma } from "@/lib/prisma";

// Election row-management mutations behind the dashboard three-dot menu.
// No auth yet (MVP) — scoping to the signed-in org lands with BetterAuth.
// ponytail: manual validation, not Zod (not a dependency); inputs are trivial.
type ActionResult = { success: boolean; error?: string };

const MAX_TITLE = 255;

// Rename — the only field the inline editor touches.
export async function renameElection(
  id: string,
  title: string,
): Promise<ActionResult> {
  const name = title.trim();
  if (!id || !name) return { success: false, error: "invalid" };

  try {
    await prisma.election.update({
      where: { id },
      data: { title: name.slice(0, MAX_TITLE) },
    });
    return { success: true };
  } catch {
    return { success: false, error: "failed" };
  }
}

// Duplicate — a fresh DRAFT copy: same config + options, no voters/votes.
export async function duplicateElection(id: string): Promise<ActionResult> {
  if (!id) return { success: false, error: "invalid" };

  try {
    const src = await prisma.election.findUnique({
      where: { id },
      include: { options: { orderBy: { orderIndex: "asc" } } },
    });
    if (!src) return { success: false, error: "notfound" };

    await prisma.election.create({
      data: {
        title: `${src.title} (Copy)`.slice(0, MAX_TITLE),
        description: src.description,
        electionType: src.electionType,
        votingType: src.votingType,
        status: "DRAFT",
        startsAt: src.startsAt,
        endsAt: src.endsAt,
        resultsVisible: src.resultsVisible,
        resultsMode: src.resultsMode,
        allowAbstain: src.allowAbstain,
        quorumThreshold: src.quorumThreshold,
        autoCloseOnDeadline: src.autoCloseOnDeadline,
        voterReminder24h: src.voterReminder24h,
        organizationId: src.organizationId,
        createdById: src.createdById,
        options: {
          create: src.options.map((o) => ({
            text: o.text,
            orderIndex: o.orderIndex,
          })),
        },
      },
    });
    return { success: true };
  } catch {
    return { success: false, error: "failed" };
  }
}

// Archive — soft close into the read-only Archive tab (drops off the dashboard).
export async function archiveElection(id: string): Promise<ActionResult> {
  if (!id) return { success: false, error: "invalid" };

  try {
    await prisma.election.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });
    return { success: true };
  } catch {
    return { success: false, error: "failed" };
  }
}

// Delete — permanent. Vote and Archive have no onDelete cascade (anonymity /
// integrity are deliberate), so clear them first, then let the election cascade
// remove voters, tokens and options. All-or-nothing in one transaction.
export async function deleteElection(id: string): Promise<ActionResult> {
  if (!id) return { success: false, error: "invalid" };

  try {
    await prisma.$transaction([
      prisma.archive.deleteMany({ where: { electionId: id } }),
      prisma.vote.deleteMany({ where: { electionId: id } }),
      prisma.election.delete({ where: { id } }),
    ]);
    return { success: true };
  } catch {
    return { success: false, error: "failed" };
  }
}
