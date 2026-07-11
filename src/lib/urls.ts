// Client-safe cross-host URL builder — the single seam for every apex↔dashboard link
// (marketing CTAs, voter magic links, QR payload, share-results). Never hardcode a host
// (domain-architecture-spec §5 decision C). NEXT_PUBLIC_* are inlined at build time, so
// this module is safe in both client and server components (no `server-only`).
//
//   APP  = dashboard host (auth funnel + app) — NEXT_PUBLIC_APP_URL
//   APEX = public host (marketing + voter)     — NEXT_PUBLIC_MARKETING_URL
//
// ponytail: the apex reuses the existing NEXT_PUBLIC_MARKETING_URL rather than adding the
// spec's NEXT_PUBLIC_PUBLIC_URL — same host, same value; one env var, not two.
// These paths are unprefixed; under localePrefix: "always" the target host 307-redirects
// them to the default locale (/login → /hr/login, /vote/x → /hr/vote/x). Correct for the
// hr-only MVP.
// TODO(i18n): cross-host locale hand-off (en → /en/login) lands with the en catalog + auth spec.
const APP = process.env.NEXT_PUBLIC_APP_URL ?? "";
const APEX = process.env.NEXT_PUBLIC_MARKETING_URL ?? "";

// Marketing → dashboard-host auth funnel (Phase 2 pages), outbound links only.
export const signInUrl = () => `${APP}/login`;
export const signUpUrl = () => `${APP}/signup`;

// Voter magic link AND the QR payload — one identical apex URL, no token variant (decision D).
export const voteUrl = (token: string) => `${APEX}/vote/${token}`;

// "Share public results" — apex public results page (resultsVisible-gated).
export const publicResultsUrl = (id: string) => `${APEX}/results/${id}`;
