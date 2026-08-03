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

// Dashboard-host auth pages → apex marketing landing (logo click-through).
export const marketingHomeUrl = () => `${APEX}/`;

// Goli apex origin za Next metadataBase (og:image, canonical). Prazan string
// ako varijabla nije postavljena — pozivatelj tada preskace metadataBase.
export const APEX_ORIGIN = APEX;

// Voter magic link AND the QR payload — one identical apex URL, no token variant (decision D).
export const voteUrl = (token: string) => `${APEX}/vote/${token}`;

// Wizard-confirmation QR payload — election-level ballot entry. Lands on the
// /vote/[segment] QR branch (voter-flow spec §4): email in → personal magic link out.
export const electionVoteUrl = (electionId: string) => `${APEX}/vote/${electionId}`;

// "Share public results" — apex public results page (resultsVisible-gated).
export const publicResultsUrl = (id: string) => `${APEX}/results/${id}`;

// Odredište poveznice za brisanje računa. NAMJERNO naša stranica, a ne
// BetterAuthova /api/auth/delete-user/callback ruta: taj je poziv GET koji traži
// sesiju, pa svaki neuspjeh (otvoreno na mobitelu, istekla sesija, iskorištena
// poveznica) završi kao goli JSON na praznoj stranici. Stranica vlada svakim
// ishodom i sama zove callback.
export const confirmDeletionUrl = (token: string) =>
  `${APP}/confirm-deletion?token=${encodeURIComponent(token)}`;

// Kontakt za pitanja o integritetu zapisa. Ispisuju ga PDF izvještaj i modal
// revizije u arhivi — jedna definicija, da se dvije adrese ne raziđu.
export const CONTACT_EMAIL = "contact@electius.com";
