"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/require-session";

// Election row-management mutations behind the dashboard three-dot menu.
// Each action verifies the target election belongs to the session's org before
// mutating — otherwise any authed user could rename/duplicate/archive/delete
// another org's elections by ID (finding #1). ponytail: manual validation, no Zod.
type ActionResult = { success: boolean; error?: string };

const MAX_TITLE = 255;

// Cheap shared ownership check — one indexed `findFirst` per mutation.
async function assertOwned(
  id: string,
  organizationId: string,
): Promise<boolean> {
  const owned = await prisma.election.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  return owned !== null;
}

// Rename — the only field the inline editor touches.
export async function renameElection(
  id: string,
  title: string,
): Promise<ActionResult> {
  const name = title.trim();
  if (!id || !name) return { success: false, error: "invalid" };

  try {
    const { organizationId } = await requireSession();
    if (!(await assertOwned(id, organizationId))) {
      return { success: false, error: "forbidden" };
    }
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
    const { organizationId } = await requireSession();
    const src = await prisma.election.findFirst({
      where: { id, organizationId },
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
    const { organizationId } = await requireSession();
    if (!(await assertOwned(id, organizationId))) {
      return { success: false, error: "forbidden" };
    }
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
    const { organizationId } = await requireSession();
    if (!(await assertOwned(id, organizationId))) {
      return { success: false, error: "forbidden" };
    }
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
