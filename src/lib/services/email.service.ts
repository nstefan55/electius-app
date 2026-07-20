import "server-only";

import { Resend } from "resend";
import hr from "../../../messages/hr.json";
import en from "../../../messages/en.json";

// Email transport (project-overview §Service Layer). First real sender:
// the BetterAuth verification email. Copy lives in the i18n catalogs
// (auth.verifyEmail) — emails run outside next-intl's request context, so the
// service reads the catalogs directly instead of useTranslations.
// ponytail: locale defaults to hr (MVP) — BetterAuth's sendVerificationEmail
// hook doesn't know the UI locale; thread it through when en ships.

const CATALOGS = { hr, en } as const;
type Locale = keyof typeof CATALOGS;

const resend = new Resend(process.env.RESEND_API_KEY);

// Resend requires a verified sender domain; onboarding@resend.dev works
// out of the box for dev. Set RESEND_FROM_EMAIL in prod (e.g.
// "Electius <noreply@electius.com>") once the domain is verified in Resend.
const FROM = process.env.RESEND_FROM_EMAIL ?? "Electius <onboarding@resend.dev>";

// Shared branded action-link template (verification + password reset use the
// same layout: heading, body, CTA button, plain-link fallback, expiry note).
interface ActionEmailCopy {
  subject: string;
  heading: string;
  body: string;
  cta: string;
  fallback: string;
  expiry: string;
}

async function sendActionEmail(to: string, url: string, t: ActionEmailCopy) {
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: t.subject,
    text: `${t.body}\n\n${url}\n\n${t.expiry}`,
    html: `
      <div style="font-family:'Noto Sans',system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0A0A0A">
        <h1 style="font-size:20px;color:#1F2937;margin:0 0 16px">${t.heading}</h1>
        <p style="font-size:16px;line-height:1.6;margin:0 0 24px">${t.body}</p>
        <a href="${url}" style="display:inline-block;background:#1D4ED8;color:#FFFFFF;text-decoration:none;font-weight:600;padding:14px 32px;border-radius:8px">${t.cta}</a>
        <p style="font-size:14px;line-height:1.5;color:#4B5563;margin:24px 0 0">${t.fallback}</p>
        <p style="font-size:12px;line-height:1.5;color:#4B5563;margin:8px 0 0;word-break:break-all">${url}</p>
        <p style="font-size:12px;line-height:1.5;color:#4B5563;margin:24px 0 0">${t.expiry}</p>
      </div>`,
  });

  if (error) {
    // Surface the failure — a silently unsent email strands the account
    // (unverifiable signup / a reset request the user is waiting on).
    throw new Error(`resend: ${error.message}`);
  }
}

export async function sendVerificationEmail(
  to: string,
  url: string,
  locale: Locale = "hr",
) {
  await sendActionEmail(to, url, CATALOGS[locale].auth.verifyEmail);
}

export async function sendResetPasswordEmail(
  to: string,
  url: string,
  locale: Locale = "hr",
) {
  await sendActionEmail(to, url, CATALOGS[locale].auth.resetEmail);
}
