import "server-only";

import { currentUser, type MockUser } from "@/lib/mock-data";

// Auth guard seam — the single authorization choke point for the (app) shell.
// See domain-architecture-spec.md §5 (decision B): full session + org authz belongs here.
//
// ponytail: no-op passthrough this phase. TODO(auth-spec): validate the BetterAuth
// session + organization membership here, redirect to /login when unauthenticated,
// and replace the currentUser mock with the real session user. Async now so the call
// site (an `await`) is already the right shape when real auth drops in.
export async function requireSession(): Promise<MockUser> {
  return currentUser;
}
