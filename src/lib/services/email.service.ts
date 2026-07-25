import "server-only";

import { Resend } from "resend";
import { voteUrl } from "@/lib/urls";
import hr from "../../../messages/hr.json";
import en from "../../../messages/en.json";

// Email transport (project-overview §Service Layer): verification OTP,
// password reset, voter invitations. Copy lives in the i18n catalogs
// (auth.otpEmail etc.) — emails run outside next-intl's request context, so
// the service reads the catalogs directly instead of useTranslations.
// ponytail: locale defaults to hr (MVP) — BetterAuth's send hooks don't know
// the UI locale; thread it through when en ships.

const CATALOGS = { hr, en } as const;
type Locale = keyof typeof CATALOGS;

const resend = new Resend(process.env.RESEND_API_KEY);

// Resend requires a verified sender domain; onboarding@resend.dev works
// out of the box for dev. Set RESEND_FROM_EMAIL in prod (e.g.
// "Electius <noreply@electius.com>") once the domain is verified in Resend.
const FROM = process.env.RESEND_FROM_EMAIL ?? "Electius <onboarding@resend.dev>";

// Shared branded action-link template (verification + password reset + voter
// invitations use the same layout: heading, body, CTA button, plain-link
// fallback, expiry note).
interface ActionEmailCopy {
  subject: string;
  heading: string;
  body: string;
  cta: string;
  fallback: string;
  expiry: string;
}

// ponytail: {name} placeholder interpolation by hand — these catalogs are read
// directly (outside next-intl's request context), so ICU formatting isn't available.
function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, key) => vars[key] ?? m);
}

// Admin-controlled values (election title, org name) get interpolated into the
// email HTML — escape them there. Subject + plain-text stay raw.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function actionEmailText(url: string, t: ActionEmailCopy): string {
  return `${t.body}\n\n${url}\n\n${t.expiry}`;
}

function actionEmailHtml(url: string, t: ActionEmailCopy): string {
  return `
      <div style="font-family:'Noto Sans',system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0A0A0A">
        <h1 style="font-size:20px;color:#1F2937;margin:0 0 16px">${t.heading}</h1>
        <p style="font-size:16px;line-height:1.6;margin:0 0 24px">${t.body}</p>
        <a href="${url}" style="display:inline-block;background:#1D4ED8;color:#FFFFFF;text-decoration:none;font-weight:600;padding:14px 32px;border-radius:8px">${t.cta}</a>
        <p style="font-size:14px;line-height:1.5;color:#4B5563;margin:24px 0 0">${t.fallback}</p>
        <p style="font-size:12px;line-height:1.5;color:#4B5563;margin:8px 0 0;word-break:break-all">${url}</p>
        <p style="font-size:12px;line-height:1.5;color:#4B5563;margin:24px 0 0">${t.expiry}</p>
      </div>`;
}

async function sendActionEmail(to: string, url: string, t: ActionEmailCopy) {
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: t.subject,
    text: actionEmailText(url, t),
    html: actionEmailHtml(url, t),
  });

  if (error) {
    // Surface the failure — a silently unsent email strands the account
    // (unverifiable signup / a reset request the user is waiting on).
    throw new Error(`resend: ${error.message}`);
  }
}

// ───────── Verification OTP (otp-implementation-auth-spec §3) ─────────

// The code IS the content — no link, no CTA button (the whole point is typing
// it). Plugin-generated digits only, so no HTML escaping needed.
interface OtpEmailCopy {
  subject: string;
  heading: string;
  body: string;
  expiry: string;
  ignore: string;
}

function otpEmailHtml(otp: string, t: OtpEmailCopy): string {
  return `
      <div style="font-family:'Noto Sans',system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0A0A0A">
        <h1 style="font-size:20px;color:#1F2937;margin:0 0 16px">${t.heading}</h1>
        <p style="font-size:16px;line-height:1.6;margin:0 0 24px">${t.body}</p>
        <p style="font-family:'Roboto Mono',ui-monospace,monospace;font-size:32px;letter-spacing:8px;font-weight:600;background:#F3F4F6;border-radius:8px;padding:16px 24px;text-align:center;margin:0 0 24px">${otp}</p>
        <p style="font-size:14px;line-height:1.5;color:#4B5563;margin:0 0 8px">${t.expiry}</p>
        <p style="font-size:12px;line-height:1.5;color:#4B5563;margin:0">${t.ignore}</p>
      </div>`;
}

export async function sendOtpEmail(
  to: string,
  otp: string,
  locale: Locale = "hr",
) {
  const t = CATALOGS[locale].auth.otpEmail;
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: t.subject,
    text: `${t.body}\n\n${otp}\n\n${t.expiry}\n${t.ignore}`,
    html: otpEmailHtml(otp, t),
  });

  if (error) {
    // Same fail-loudly policy as every sender — a silently unsent code
    // strands an unverifiable account.
    throw new Error(`resend: ${error.message}`);
  }
}

export async function sendResetPasswordEmail(
  to: string,
  url: string,
  locale: Locale = "hr",
) {
  await sendActionEmail(to, url, CATALOGS[locale].auth.resetEmail);
}

// ───────── Voter invitations (election-publication-spec §3) ─────────

// One entry per voter; rawToken becomes the magic-link URL and is never
// persisted or logged (only the email body carries it).
export interface InvitationRecipient {
  email: string;
  rawToken: string;
}

export interface InvitationElection {
  title: string;
  organizationName: string;
}

// Batched invitation send — ≤100 recipients per call (Resend batch limit,
// chunking is the publication service's job). A batch call is atomic:
// it succeeds or fails whole, which is exactly the spec's per-chunk
// failure granularity. Throws on failure so the caller can leave the
// chunk's voters PENDING (retryable).
export async function sendInvitationEmails(
  recipients: InvitationRecipient[],
  election: InvitationElection,
  locale: Locale = "hr",
) {
  if (recipients.length === 0) return;

  const raw = CATALOGS[locale].voter.inviteEmail;
  const vars = { title: election.title, org: election.organizationName };
  const copy = (v: Record<string, string>): ActionEmailCopy => ({
    subject: fill(raw.subject, v),
    heading: fill(raw.heading, v),
    body: fill(raw.body, v),
    cta: raw.cta,
    fallback: raw.fallback,
    expiry: raw.expiry,
  });
  const tText = copy(vars);
  const tHtml = copy({ title: escapeHtml(vars.title), org: escapeHtml(vars.org) });

  const { error } = await resend.batch.send(
    recipients.map((r) => {
      const url = voteUrl(r.rawToken);
      return {
        from: FROM,
        to: r.email,
        subject: tText.subject,
        text: actionEmailText(url, tText),
        html: actionEmailHtml(url, tHtml),
      };
    }),
  );

  if (error) {
    throw new Error(`resend: ${error.message}`);
  }
}
