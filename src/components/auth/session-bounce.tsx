import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { auth } from "@/lib/auth";

// Server-side signed-in bounce for /login + /signup, replacing the proxy's
// cookie-PRESENCE bounce. The proxy can't tell a stale cookie from a live
// session, and a stale one (e.g. sessions revoked by a password reset)
// redirect-looped: proxy /login → /home → requireSession → /login → …
// Validating against the DB here breaks the loop — stale cookies render the
// page (user just signs in again), real sessions bounce to the home overview.
export async function SessionBounce() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    redirect(`/${await getLocale()}/home`);
  }
  return null;
}
