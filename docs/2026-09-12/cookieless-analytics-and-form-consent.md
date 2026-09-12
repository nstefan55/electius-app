# Cookieless Analytics + Form Consent — the consent that was not needed, and the leak that was

**Branch** `feature/analytics-and-form-consent` · **Version** 0.9.71 · **Spec** inline
(closes `mvp-launch.md` §2 "Cookie consent + form consent…" and most of §6)

Eight files, one dependency, no migration, **no consent banner**. The checklist line asked
for cookie consent. Measuring first turned it into a different feature: the consent is not
legally required, and installing analytics exposed a credential leak that the checklist
never mentioned.

---

## The one sentence this feature turns on

**A consent banner is only lawful theatre if there is nothing to consent to — and there
was nothing to gate.**

Measured before writing code: zero analytics packages in `package.json`, zero analytics /
`gtag` / `dataLayer` / external-script references in `src/`, zero consent code. A banner
built on its own would have been a control with no consumer — the failure class this
codebase has hit four times already (`resultsVisible`, `resultsMode`, `sealedResults`,
`adminTurnoutReminder`) — and worse, because a consent banner *asserts to a visitor that
tracking exists*.

So the two halves were one decision, not two branches.

---

## Decisions

### D1 — cookieless analytics, therefore no banner

`@vercel/analytics`, chosen over "install nothing" and over cookie-based analytics.

Verified against Vercel's own docs and then against the shipped package, not from memory:

- **No cookies.** `grep -rliE "document\.cookie|localStorage|sessionStorage|indexedDB"`
  over `node_modules/@vercel/analytics/dist/` returns **nothing**.
- A visitor is identified by a **server-side hash of the incoming request**, discarded
  after 24 h.

Nothing is stored on or read from the device, so **ePrivacy Art. 5(3) does not bite** and
consent is not required. That is what preserves `/privacy` §F verbatim — including the
paragraph that explains why no banner is shown, which survives this branch untouched.

Two further facts made it cheap:

- **Vercel is already a named processor** in `/privacy`, receiving "all traffic to the
  application and the corresponding access logs". Analytics adds **no new processor and no
  new DPA** — only a purpose.
- The production script is **first-party**, so the CSP does not move (below).

### D2 — "form consent" was already correct, except in one place

The current shape is deliberate and must not be "fixed" back:

- **signup** — the tick gates the **Terms alone**; the privacy notice sits beside it,
  **outside** the gate (v0.9.64). Bundling them is EDPB 05/2020-invalid consent and
  manufactures a consent record for processing whose real basis is Art. 6(1)(b) contract.
- **`/setup`** — Terms acceptance recorded on `Organization` (v0.9.65) and `User` (v0.9.69).

> ⚠ **Do not add a "privacy consent" checkbox to any form.** A privacy policy is an Art. 13
> *notice*, discharged by being readable. Generic cookie/consent generators will ask for
> that tick; this codebase removed it on purpose.

What genuinely remained: `request-link-form.tsx` — the QR/no-token voter entry, the only
public form that collects an address — linked to the policy **nowhere**. Its existing
`qr.privacy` key is misnamed: it reads *"The link is single-use and personal — don't share
it"*, a security warning, not a processing notice. It now has both.

Not folded in: the **Art. 14 voter notice**, still open from the privacy branch. It belongs
on the invitation email, not as consent on a form.

---

## ⚠ The defect installing analytics exposed

This is the part the checklist did not anticipate, and the reason this branch is a security
fix rather than a config change.

`@vercel/analytics/next` reports a pageview as `pageview({ route, path })`, where `route`
is the safe pattern (`/[locale]/vote/[token]`) but **`path` comes from `usePathname()` —
the resolved URL**. Three routes in this app carry a **live credential in the URL**:

| Route | Where the secret sits | What it is |
| --- | --- | --- |
| `/{locale}/vote/<token>` | path segment | single-use ballot credential |
| `/{locale}/reset-password?token=…` | query | account takeover |
| `/{locale}/confirm-deletion?token=…` | query | irreversible deletion |

A naive `<Analytics />` would have sent all three to an analytics dashboard. That breaks:

- **invariant #2** — raw tokens are never persisted or logged, only SHA-256;
- `/privacy` §collect — *"the link in readable form exists only in the email you received,
  and nowhere else"*;
- the same rule that already bans Resend click tracking, for the same reason.

And a ballot token in a dashboard is not a log entry, it is a **live credential**: until
it is used, anyone who can read the dashboard can cast that person's vote.

### The guard

`src/lib/analytics.ts` — pure, client-safe (it runs in the browser, so deliberately **not**
`server-only`), tested under invariant #8.

```ts
const VOTE_PATH = /(^|\/)vote(\/|$)/;   // drop the event entirely
const ALLOWED_QUERY = /^utm_[a-z]+$/;   // allowlist, not denylist
```

Two design choices worth keeping:

1. **`/vote/*` drops the whole event**, it is not redacted. The segment is a raw token *or*
   an election id (QR entry) and the client cannot tell them apart — so it must not try.
   `(\/|$)` is load-bearing: without it the admin route `/voters` would be dropped too.
2. **The query rule is an allowlist.** `utm_*` survives (attribution is the only reason
   analytics was installed at all); everything else is dropped. The *next* route that puts
   a token in a query string is therefore safe without anyone remembering it exists.

`src/components/web-analytics.tsx` is a client wrapper that exists for exactly one reason:
`beforeSend` is a function, and a server component cannot pass a function to a client
component. The rule lives in `lib/` so it is testable.

---

## CSP: production does not move

`getScriptSrc()` in the package resolves to `/_vercel/insights/script.js` in production —
**first-party** — and beacons to `/_vercel/insights/event`, also same-origin. So
`script-src 'self'` and `connect-src 'self'` already cover it.

Verified from the built artifact, not by reasoning: `.next/routes-manifest.json` carries
`script-src 'self' 'unsafe-inline'` and `connect-src 'self'`, with **no analytics origin**.

Only **development** pulls an external debug script
(`https://va.vercel-scripts.com/v1/script.debug.js`), so that origin was added to the
**dev-only branch** of the CSP, matching the existing `isDev ? …` idiom.

> Consequence for the launch checklist: §1's SRI box **stays a no-op** — there is still no
> external script in production.

---

## What shipped

| File | Purpose |
| --- | --- |
| `src/lib/analytics.ts` | `redactAnalyticsUrl()` — the guard above |
| `src/lib/analytics.test.ts` | 14 cases; also a contract test that `/privacy` no longer claims "no analytics" while the package is installed |
| `src/components/web-analytics.tsx` | client wrapper carrying `beforeSend` |
| `src/app/[locale]/layout.tsx` | single mount point |
| `next.config.ts` | dev-only script origin; corrected the now-false "no analytics" comment on `connect-src` |
| `messages/{hr,en}.json` | 4 privacy strings + the QR notice |
| `src/components/voter/request-link-form.tsx` | D2 privacy notice + `privacyUrl()` link |

### Privacy-policy edits (4 strings × 2 locales)

Applied behind the byte-identical round-trip guard → **13-line diffs**, not ~2600.

| Key | Change |
| --- | --- |
| `collect.not[0]` | claimed *"No analytics of any kind… no Vercel Analytics"* — now describes what runs and what it does not do |
| `processors.rows[0]` | Vercel purpose widened; data column states that voting links and tokens are removed **before** sending |
| `cookies.body` | last clause *"because the application contains no analytics tool"* was now false |
| `cookies.bullets[4]` | Do Not Track — *"we perform no tracking"* softened to "we do not track you across sites" |

**Deliberately unchanged, because still true:** the cookie table (no new cookie), the
"no provider sets a cookie on an Electius domain" bullet, the "we do not use browser local
storage" bullet, and the **no-banner paragraph**. Keeping that last one true was the point
of D1.

---

## Verification

- `tsc --noEmit` clean · `eslint` **0 errors** (7 pre-existing `window.location.assign`
  warnings, none in touched files) · `next build` clean
- **822 tests / 46 files** (from 808 / 45)
- **All six static prerenders intact** (`/hr`, `/en`, both `/privacy`, both `/terms`) and
  `/[locale]/results/[id]` still in `dynamicRoutes` — read from
  `.next/prerender-manifest.json`, **never the build table**. The package wraps its own
  `useSearchParams()` in `<Suspense>`, which is what preserves this.
- **Mutation-checked 6/6**, each caught by a *named* test, after a green control run.

> One mutation initially **survived** — and it was a missing test case, not a missing
> guard. The relative-URL return path is `pathname + search`, so `url.hash = ""` is only
> observable on an **absolute** URL, and no test used one. Added; now caught. *A surviving
> mutation is as often a missing test case as a missing guard.*

### Runtime proof (dev server, dev DB — never production)

Unit tests cannot prove the runtime **shape** of `event.url`, which is exactly where a
token would leak. In development the package logs events instead of sending them:

```
[Vercel Web Analytics]  Running queued event pageview
[Vercel Web Analytics]  Page view would be ignored by `beforeSend` because null was returned.
```

…on `/hr/vote/RAWT0KEN_leak_canary_abc123`, with 0 console errors. And the control, proving
the guard is not simply dropping everything:

```json
{ "before": { "url": ".../hr?utm_source=producthunt&token=SHOULD_BE_STRIPPED" },
  "after":  { "url": ".../hr?utm_source=producthunt" } }
```

That second result is also the evidence that the query allowlist is load-bearing:
**`event.url` carries the query string**, which `usePathname()` does not — so the injected
script builds the URL from `location.href`. Without the allowlist the reset-password and
confirm-deletion tokens would have gone out.

---

## Carry-forward

- **Never add a privacy-consent checkbox to a form.** See D2.
- **Never enable Resend click tracking**, and never add open/click tracking — it rewrites
  the href that *is* the voting token. `/privacy` states this as a promise.
- **A new route with a secret in its URL needs nothing** — the allowlist already drops
  unknown query params, and `/vote/*` is dropped whole. A secret in a new *path* segment
  would need a new rule; `analytics.test.ts` is where it goes.
- **Adding any cookie-setting analytics, ad pixel, or embedded media (a YouTube iframe
  counts) re-opens the banner decision** and falsifies `/privacy` §F, §2.3 and the
  no-cross-site-tracking line at once.
- Croatian is the **legally operative** text — change both locales or neither.

---

## Still open

- ⚠ **Web Analytics must be enabled in the Vercel project dashboard**, or
  `/_vercel/insights/script.js` 404s and the package logs an error. The app cannot detect
  this — the same silent-no-op class as Upstash, R2 and Resend. *(Enabled 2026-09-12.)*
- `mvp-launch.md` §6 is **not** fully closed: conversion events are still undefined, and
  the funnel (marketing → signup → first election) has not been joined up.
- The **Art. 14 voter notice** remains open, on the invitation email.
- `/privacy` is still **not publishable** for reasons unrelated to this branch: no legal
  entity, no Art. 28(3) DPA, and no lawyer has read it.
