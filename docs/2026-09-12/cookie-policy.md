# Cookie Policy — the cookie the policy said did not exist

**Branch** `feature/cookie-policy` · **Version** 0.9.68 · **Spec**
`context/features/cookie-policy-page-spec.md`

Four files, no new page, no new dependency, no migration. The work was a
correction to a document that already shipped — and the correction that mattered
was found by measuring, not by reading.

---

## The one sentence this feature turns on

A cookie disclosure is the one legal artifact whose entire function is being
**checkable**: the reader opens DevTools and compares. That makes "we believe the
app sets one cookie" worthless as a basis for publishing, and it is why the spec
made a live inventory a gate rather than a checklist item.

The gate paid for itself. The strongest sentence in the shipped policy was false.

---

## What was wrong before this branch

`/privacy` §F (`legal.privacy.s.cookies`) already carried a cookie table, a
no-banner rationale and a Do Not Track line. Three defects in it:

### 1. The table named no cookie

The single row was labelled **"Kolačić prijave" / "Sign-in cookie"** — a
description, not a name. Nobody could check it against a browser.

### 2. A second cookie was undisclosed, on the default path

`login-form.tsx:29` initialises `rememberMe` to **`false`** and sends it on every
sign-in. In `setSessionCookie`
(`node_modules/better-auth/dist/cookies/index.mjs:167-178`):

```js
const maxAge = dontRememberMe ? void 0 : ctx.context.sessionConfig.expiresIn;
await ctx.setSignedCookie(sessionToken.name, token, secret, { ...options, maxAge });
if (dontRememberMe) await ctx.setSignedCookie(dontRememberToken.name, "true", secret, ...);
```

So every admin who does not tick "Ostani prijavljen" — the default — gets a
second cookie the policy never listed.

### 3. The published duration was wrong on that same path

With `dontRememberMe` true, `maxAge` is `undefined`: the session **cookie** dies
when the browser closes. "7 days" is the life of the server-side session *row*, a
different fact. The policy printed the server number against the browser artifact.

---

## The finding the inventory produced

The spec predicted **"no `NEXT_LOCALE` — locale is in the URL path,
`localePrefix: 'always'`"**. Measured against live production, that was false:
`NEXT_LOCALE` was set on every page, **including the ballot**.

### Why, exactly

next-intl's `localeCookie` **defaults to on**
(`routing/config.js`: `localeCookie: !!(o ?? 1) && { name: "NEXT_LOCALE", … }`),
and `localeDetection: false` disables only the **read** (`resolveLocale.js`). The
**write** lives in `syncCookie.js` and is gated on `localeCookie` alone. It fires
on document navigations when the Accept-Language-derived locale differs from the
resolved one:

| Browser `Accept-Language` | `/hr/vote/<token>` |
| --- | --- |
| `hr-HR` | no cookie |
| **`en-US`** | **`NEXT_LOCALE=hr` set** |
| `de-DE` | no cookie — unmatched, falls back to `hr`, which matches |
| none sent | **set** |

Every invitation email links `/hr`. An English-locale browser is extremely
common. So the published promise — *"the voting flow sets no cookie at all"* —
was false for a large share of real voters.

### Why it was deleted rather than documented

**Nothing read it.** `localeDetection: false` gates every read, and `src/` has
zero `NEXT_LOCALE` references — locale is derived from the URL on every request.
The app was setting a cookie it never consulted.

So the fix is one line, and it makes the published claim *true* instead of
forcing it to be weakened:

```ts
// src/i18n/routing.ts
localePrefix: "always",
localeDetection: false,
localeCookie: false,   // ← this branch
```

**Carry-forward:** a config default you never wrote is still a decision you
shipped. "It is in the URL, so there is no cookie" was an inference from design
intent, not a reading of behaviour.

---

## What shipped

| File | Change |
| --- | --- |
| `src/i18n/routing.ts` | `localeCookie: false` |
| `src/lib/locale-cookie.test.ts` | **new** — contract test, 3 cases |
| `messages/hr.json` · `messages/en.json` | `legal.privacy.s.cookies` rewritten, 22-line diffs |

No page component changed: the new table reuses the existing four columns, so
`privacy/page.tsx` was untouched.

### The test, and why it exists

`localeCookie` is **on by default**, so deleting one line silently restores the
cookie — with no type error, no build failure, and no other test noticing. The
consequence is not cosmetic: it re-falsifies a published privacy claim.

`src/lib/locale-cookie.test.ts` follows the `static-route-boundaries.test.ts`
precedent — a contract test over a module that lives elsewhere, parked in
`src/lib/` to respect invariant #8. It also pins `localeDetection: false`,
because the two are coupled: the cookie exists so detection can read it, so
anyone enabling detection needs the cookie back — and that is a conversation
about §F, not a config tweak. **A failing test there is that conversation.**

Mutation-checked, after a green control run on unmutated source:

| Mutation | Caught by |
| --- | --- |
| `localeCookie` line removed | `no public surface writes NEXT_LOCALE` |
| `localeCookie: true` | `no public surface writes NEXT_LOCALE` |
| `localeDetection: true` | `stays disabled together with locale detection` |

---

## The measured inventory

This is what the app sets, as of 2026-09-12. It replaces the guesses.

### Public, marketing and voter surfaces: **zero cookies**

Measured on a production build under `Accept-Language: en-US` — the exact case
that used to trigger `NEXT_LOCALE`:

- `/hr`, `/en`, `/hr/privacy`
- `/hr/vote/<token>` and the QR form `/hr/vote/<electionId>`
- `/hr/results/<id>`
- `POST /api/vote`

A full five-screen ballot was then completed in a real browser: vote recorded,
verification hash issued, and `document.cookie`, `localStorage` and
`sessionStorage` all empty at **every** screen.

### Dashboard, signed in: exactly two, both strictly necessary

| Cookie (production) | Set when | Lifetime |
| --- | --- | --- |
| `__Secure-better-auth.session_token` | every sign-in | **browser session**; `Max-Age=604800` only if "Ostani prijavljen" is ticked |
| `__Secure-better-auth.dont_remember` | sign-in with the box **unticked** (the default) | browser session |

Attributes on both: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.

`session_data` / `account_data` are **never set** — `setCookieCache` returns
early unless `session.cookieCache.enabled`, and `auth/index.ts` has no `session`
block. They are only *expired* on sign-out.

### How the production names were obtained without touching production

The `__Secure-` prefix is **not** decided by `NODE_ENV`. `createCookieGetter`
(`cookies/index.mjs:22`) prefers `baseURL`'s protocol:

```js
const secureCookiePrefix = (options.advanced?.useSecureCookies !== undefined
  ? options.advanced.useSecureCookies
  : … baseURLString ? baseURLString.startsWith("https://") : isProduction)
    ? SECURE_COOKIE_PREFIX : "";
```

`BETTER_AUTH_URL` is `https://dashboard.electius.com` in `.env.production` and
`http://localhost:3000` in `.env.development`. So the production names were
derived by calling BetterAuth's own `getCookies({ baseURL })` with the real
production value — a pure config function: no database, no network, no
production request.

---

## Decisions taken

| # | Decision |
| --- | --- |
| **D1** | **Expand `/privacy` §F in place.** No standalone `/cookies` page — `privacy-policy-spec.md` D2 already ruled against one, and its stated trigger (a consent banner becoming necessary) has not fired. Two surfaces stating one claim drift by construction |
| **D2** | Publish the duration correction. It was wrong on the default path |
| **D3** | Name cookies exactly, `__Secure-` prefix included |
| **D4** | Attribute CSRF to the **mechanism**, not the cookie. BetterAuth 1.7.2 has no separate CSRF cookie — protection is `SameSite=Lax` plus the permitted-origin check, and the row now says only what the cookie does |
| **D5** | Nothing to disclose for Vercel — **measured** on live production, no platform cookie on any URL |
| **D6** | `NEXT_LOCALE` deleted, not documented |

### Still notice, not consent

Strictly-necessary cookies only, no analytics, no advertising, no third-party
tracking — so the ePrivacy Art. 5(3) exemption applies and no banner is needed.
`dont_remember` does not weaken that: it is how the product honours *"do not keep
me signed in"*.

**The trigger that would change this**, recorded so nobody re-derives it: adding
analytics of any kind, a Meta/Reddit/Google Ads pixel, or embedded media (a
YouTube iframe on the landing page counts) makes a consent banner mandatory and
falsifies §F's bullets, `/privacy` §2.3 and the "no cross-site tracking" line —
one product decision with four documents downstream.

---

## Verification

- `tsc --noEmit` clean · `eslint` **0 errors** (7 pre-existing `window.location.assign` warnings, none in touched files)
- **804 tests / 45 files** (from 801 / 44)
- `next build` clean, and **no Gate 13 regression**: `/hr`, `/en`, `/hr/privacy`, `/en/privacy`, `/hr/terms`, `/en/terms` all still prerendered (`●`)
- Browser pass both locales: §F renders two named rows, captioned table with `th[scope]`, five bullets, no Croatian leftovers in `/en`, no key-path leak, **0 console errors**
- Dev DB restored exactly: 2 orgs · 2 users · 18 elections · 3994 voters · 2087 votes · 3 tokens · 3 archives
- Probe rate-limit keys cleared by **exact match** on the fixture email, never a blind `ratelimit:*` flush. The cron sweep was never pinged, so no invitation email was sent

---

## ⚠ Two things found while measuring

### 1. A local production build talks to the PRODUCTION database

`npm run build && npm start` loads `.env.production`, so `DATABASE_URL` resolves
to `ep-calm-butterfly-…` (**production**) rather than `ep-restless-cell-…` (dev),
and `NEXT_PUBLIC_*` are inlined from production as well.

Found because a fixture sign-in failed with `INVALID_EMAIL_OR_PASSWORD` — the
account exists on the dev branch, and the app was looking at production. A *read*
already violates the standing Neon guardrail; a local production-mode run that
**writes** (a registration, a seed, a cast ballot) would write to production.
Every earlier "verified against a local production build" session has the same
property. Needs its own decision — out of scope here.

### 2. `https://electius.com/hr/terms` returns 404 on production

The Terms shipped locally as v0.9.65 and were never pushed, while the production
footer links to them. Not caused by this branch; noticed while probing.

---

## What this does NOT fix

- **No legal entity exists** to name as controller, so `/privacy` — this section
  included — remains **not publishable**. The page's own notice says so.
- **No qualified Croatian data-protection lawyer** has read any of the three legal
  documents.
- The Art. 28(3) **DPA**, the Art. 14 **voter notice** and the Art. 30 **ROPA**
  are all still open and all larger than this.

---

## Rules to carry forward

1. **Re-verify on every `better-auth` bump.** Cookie names, the `dont_remember`
   behaviour and the 7-day default are library defaults read from `node_modules`,
   not a public contract. `better-auth-schema.test.ts` compares *model fields* and
   cannot see any of this.
2. **Croatian is the operative text.** Change both locales or neither.
3. **Never enable Resend click tracking.** It rewrites the `href` that *is* the
   raw magic-link token; `/privacy` publishes that as a promise.
4. **Adding analytics re-opens the banner question** — see the trigger above.
5. **Before asserting a cookie claim, measure it.** Reading the framework config
   is not the same as reading what the framework does with its defaults.
