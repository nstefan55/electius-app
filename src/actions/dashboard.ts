"use server";

import { getElectionTurnout } from "@/lib/db/elections";
import { requireSession } from "@/lib/auth/require-session";

// Polled by the live-hero panel to refresh turnout without a full page reload.
// Org-scoped so a rogue client can't poll another org's election id.
export async function fetchTurnout(id: string) {
  const { organizationId } = await requireSession();
  return getElectionTurnout(id, organizationId);
}
