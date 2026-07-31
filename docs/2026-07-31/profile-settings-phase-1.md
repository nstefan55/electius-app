# Profile & Settings Phase 1 — Route Split

**Branch:** `feature/profile-settings-split` · **Version:** stays 0.9.8 (bump skipped at user request)
**Specs:** `context/features/profile-settings-spec.md` (master index) ·
`profile-settings-phase-1-spec.md` · `sidebar-account-menu-spec.md` (same branch)
**Design:** `context/design/electius-profile-settings-page-design/project/Profile.dc.html` (whole file) ·
`Settings.dc.html` (page header + trust footer only)

The single `/settings` page shipped 2026-07-21 becomes two. **`/profile`** holds everything an admin
*is* — account, organization, language — and is finished apart from logo upload (phase 2).
**`/settings`** becomes a shell for the controls phases 3–7 will fill.

This phase **moves working code**. The mutations were not rewritten; everything `/settings` did on
2026-07-30 still works. The only behavioural additions are the Language card and the
unverified-email banner.

No new dependency. No schema change. No new server action.

---

## What shipped

| File | Change |
| --- | --- |
| `src/app/[locale]/(app)/profile/page.tsx` | **new** — one `Promise.all`; the two `election.count` queries are gone with the usage stats (D2) |
| `src/app/[locale]/(app)/settings/page.tsx` | rewritten to a shell — header + trust line, still a server component |
| `src/components/settings/profile-card.tsx` | identity row + provider line, unverified banner → reused `OtpVerifyPanel`, member-since row; stats removed |
| `src/components/settings/organization-card.tsx` | language row removed; logo helper no longer says SVG |
| `src/components/settings/language-card.tsx` | **new** — locale radio group |
| `src/components/dashboard/language-switcher.tsx` | **deleted** — its navigation lives in the Language card |
| `src/components/dashboard/sidebar-nav.tsx` | account menu gains **Profil**, first |
| `src/components/dashboard/dashboard-shell.tsx` | breadcrumb for `/profile` |
| `src/lib/dashboard-paths.ts` + `.test.ts` | **new** — the proxy's path lists, extracted so they can be tested (see [below](#the-one-test-this-feature-earned)) |
| `src/proxy.ts` | imports those lists; `/profile` added to `DASHBOARD_ONLY_PATHS` |
| `messages/{hr,en}.json` | new `dashboard.profile` namespace; `dashboard.settings` shrinks to its header |

**315 tests pass** (+4). `npm run lint` and `npm run build` clean. 0 console errors.

---

## Decisions taken at `start`

1. **Migration copy skipped.** The design's `/settings` subtitle ends *"Looking for your name or
   organization? They moved to Profile."* Nothing is in production, so there are no admins to
   migrate — the spec itself marks the sentence `ponytail:` temporary. Shipped subtitle is just
   *"Accessibility, plan, data and account controls."* One fewer key per catalog and no later
   cleanup pass.
2. **Provider line: Google wins.** Any `google` account row renders *"Signed in with Google"*.
   The **password sub-form stays keyed on the `credential` row independently**, so an account with
   both linked still gets the change-password affordance. They answer different questions — "how did
   you get here?" vs "do you have a password to change?" — and collapsing them would silently remove
   a working control.
3. **Phase 4 stays its own branch.** `/settings` lands as a header + trust line. Build the static
   customizations card next so it does not stay that way.

---

## `/profile`

One `requireSession()` (already `cache()`d by the layout) plus one `Promise.all` for the user row
and the org row. **The two `election.count` queries are deleted** along with the usage stats the
final design drops (D2) — `/home` already carries those numbers as stat cards.

### Account information

The identity row branches on the `accounts` rows the page already fetches. The design hardcodes
the Google variant; the seeded admin is credential-only, so both branches exist.

**The unverified-email banner reuses `OtpVerifyPanel` unmodified.** The panel already owns the
input, the 60-second resend cooldown (starting hot — a code was just sent), and the
`INVALID_OTP` / `OTP_EXPIRED` / `TOO_MANY_ATTEMPTS` / `429` error map. Building a second code-entry
UI would mean two implementations of a security-relevant flow.

```tsx
// The shared panel hard-navigates on success, so pointing it at the current
// page produces the router.refresh() end state the spec asks for — banner
// gone, Verified badge on, from the same server read.
<OtpVerifyPanel email={email} redirectTo={`/${locale}/profile`} />
```

Rate limiting needed no work: the send shares the `resendVerification` window (3 / 15 min per
IP + email) and verification uses `verifyOtp` (10 / 15 min). **No new limiter.**

The design's *"Resend email"* label is a prototype leftover — the flow is OTP and there is no link
to click, so the copy says **code**.

`memberSince` became a rich-text message (`Član od <b>{date}</b>`) so the date can be bold without
a second key or a fixed word order:

```tsx
t.rich("memberSince", { date: memberSince, b: (c) => <span className="font-semibold">{c}</span> })
```

### Organization

Moved as-is: logo display only (no upload affordance — phase 2), name, contact email, and the
P2002 → *"That contact email is already in use"* mapping intact.

**The helper copy says PNG / JPG / WebP, never SVG.** The design says "PNG or SVG";
`file-image-spec.md` §4 excludes SVG (a document that can carry `<script>`, so serving one from
your own origin is stored XSS). Shipping the drawn copy would promise a format the phase-2 uploader
rejects.

### Language

Two option cards, exposed as a **radio group** (`role="radiogroup"` + `role="radio"`), replacing the
old `<select>`. `language-switcher.tsx` is deleted and its locale navigation lives here — two
locale-switching implementations is exactly the drift this codebase designs against.

The selected state reads the **active locale**, never a hardcoded `hr`, so the card works the day
`messages/en.json` is translated. `common.language.{label,hr,en}` are still consumed, so the
deletion orphaned no keys.

---

## Two defects the browser pass caught

Both were in the Language card, and both are worth reading as patterns rather than one-offs.

### 1. `aria-disabled` made the gated locale unreachable

Playwright refused to click the English option — correctly. `aria-disabled="true"` announces a
control as inoperable, but the design requires clicking it to learn *why* English is unavailable.
A screen-reader user would be told the control is dead and never hear the explanation.

Removed. The option is not disabled, it is **unavailable with an explanation** — and the "Soon"
chip and helper text are already in its accessible name, so the state is announced either way.

```tsx
// NOT aria-disabled: a gated locale must stay operable, or the toast
// explaining why it is gated never reaches a screen reader.
```

### 2. On `/en`, English rendered as "Soon" while the interface was in English

`ENABLED` was answering two different questions:

- *may a user switch to this locale?* → correct answer: `en: false`
- *is this locale usable?* → wrong answer on `/en`, where you are demonstrably using it

The selected state read the active locale (as the spec requires) while the styling read the gate,
so the two disagreed the moment they could. Split:

```ts
// The locale you are IN is available whatever the gate says.
const available = ENABLED[code] || selected;
const helper = code === DEFAULT_LOCALE ? t("defaultOption")
             : available               ? null
             : t("soonOption");
```

`/hr` → *Croatian — default* / *English — Ships post-launch — Soon*.
`/en` → *Croatian — default* / *English* (no chip, no grey).

> **Carry-forward:** when one boolean drives both behaviour and presentation, check whether it is
> really answering one question.

---

## The one test this feature earned

No new server action or utility landed, and `settings.test.ts` still covers the untouched
mutations. Component tests are out of scope by invariant #8.

But the feature touched something with a **silent** failure mode: the proxy's admin-path list.
Route folders exist once in the tree, so a surface missing from `DASHBOARD_ONLY_PATHS` is served by
the **apex host** as well. No build, type check or existing test notices — you find it by curling
the apex, or you don't. `/settings` shipped with that bug once; `/profile` would have.

`PUBLIC_AUTH_PATHS` and `DASHBOARD_ONLY_PATHS` moved into **`src/lib/dashboard-paths.ts`** —
dependency-free, so the test reads them without booting next-intl or BetterAuth. Same extraction,
for the same reason, as `auth/rate-limit-rules.ts`; it also keeps the test inside `src/lib/`.

**The test derives one side of the assertion from the filesystem**, so it fails for the *next*
forgotten route too, not just this one:

```ts
readdirSync("src/app/[locale]/(app)", { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  // /results excepted: the proxy matches it EXACTLY, because the apex must
  // keep serving public /results/[id].
```

**Mutation-checked before being believed:** deleting `/profile` from the list fails 2 of the 4
cases (`expected [ 'profile' ] to deeply equal []`). A green test that cannot fail proves nothing.

---

## i18n

New `dashboard.profile` namespace (hr + en) with `account` / `organization` / `language` blocks;
`dashboard.settings` shrinks to `title` + `subtitle` and phases 3–7 re-grow it. OTP copy is reused
from `auth.signup.form.otp` — not duplicated.

Both catalogs are CRLF. The injection script **refused to write unless a parse → serialise
round-trip reproduced the file byte-for-byte first**:

```js
if (serialize(JSON.parse(raw), fmt) !== raw) throw new Error("ROUND-TRIP NOT BYTE-IDENTICAL");
```

Result: a 40-line diff instead of the ~900-line one a stray LF rewrite produces. Reuse that guard
for any catalog edit.

---

## Verification

Browser pass on the seeded dev DB (hr + en), **0 console errors**:

- Profile save → sidebar and card subtitle update via `router.refresh()`; reverted afterwards
- Organization save → sidebar org name updates; reverted afterwards
- Dirty-tracking gates both Save buttons
- Password change with a wrong current password → *"Trenutačna lozinka nije točna."* + `aria-invalid`
  (proves the moved namespace resolves)
- Verified badge · member-since bold and locale-formatted · usage stats gone
- Language card toast · `/en/profile` fully English, and its Croatian option navigates to `/hr/profile`
- `/hr/settings` renders the header and trust line and nothing else
- Sidebar menu **Profil · Postavke · Odjava** in order — keyboard-activated from the mobile Sheet
  (drawer closes) and from the 64 px collapsed rail
- Apex 307 matrix for `/profile`: locale and query preserved, bare path → `hr`

**Unverified banner**, via a temporary fixture that flipped the seeded admin to
`emailVerified: false`: banner renders and the badge disappears → **Resend sent a real code** →
the shared OTP panel expanded inline → flag restored → badge back, banner gone. Fixture script
deleted, DB restored.

### Not exercised live — recorded, not assumed

- **A successful password change.** It would rotate the seeded demo password. The error path proves
  the wiring; the success path is unchanged code.
- **BetterAuth accepting an OTP from this surface.** `demo@electius.com` is not a readable mailbox.
  The send is real and succeeded; the code path is the OTP feature's own tested one; and the
  post-verify end state was proven by restoring the flag.

---

## Gotchas for the next person

- **`npm run build` clobbers the `.next` a running dev server is serving from.** Symptom is a
  `ChunkLoadError` or a reload loop with steady `200`s and no client console errors — it looks like
  an app bug and is not. Kill the server, `rm -rf .next`, restart. A second `npm run dev` may
  silently take port 3001 while a zombie holds 3000; check with
  `Get-NetTCPConnection -LocalPort 3000`.
- **Do not grep `document.body.textContent` to assert a conditional block is absent.** next-intl
  serialises the *entire* message catalog into the RSC payload, so every string in
  `dashboard.profile` is present in the DOM as script content whether or not it rendered. Use the
  accessibility snapshot.
- A throwaway Prisma script needs the **driver adapter** (`new PrismaClient({ adapter: new PrismaNeon(...) })`);
  Prisma 7 rejects the `datasources` option. `tsx` also does not load `.env.development` the way
  `prisma.config.ts` does for the Prisma CLI.

---

## Out of scope

Logo upload (phase 2) · plan & billing (3) · dashboard customizations (4) · account deletion (5) ·
accessibility (6) · data export (7) · changing the sign-in email · setting a password on an
OAuth-only account.

**Next:** phase 4, immediately — a ~30-line static card so `/settings` is not a bare header.
