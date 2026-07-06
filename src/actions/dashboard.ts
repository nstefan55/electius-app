"use server";

import { getElectionTurnout } from "@/lib/db/elections";

// Polled by the live-hero panel to refresh turnout without a full page reload.
export async function fetchTurnout(id: string) {
  return getElectionTurnout(id);
}
