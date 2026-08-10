# The Language Preference That Persisted Nothing

**Branch** `fix/locale-not-persisted` · **Version** 0.9.28 → **0.9.29** (patch, 0.9.x lock)
**Spec** `context/fixes/locale-not-persisted.md`
**Supersedes** the *Locale threading* entry in `future-updates-spec.md` § Emails, which had framed
this as plumbing

`/profile`'s Language card rendered a radio group labelled as a per-admin language preference and
**wrote nothing** — it called `router.replace(pathname, { locale })` and stopped. Because no locale
was stored anywhere, no code path outside a request-with-a-URL could know what language anyone reads,
which is why **all six email senders were hard-Croatian at every one of their nine call sites** and
why the six `-en` Resend templates authored in v0.9.26/v0.9.27 were unreachable by any code path.

Same defect class as `sealedResults` (a wizard toggle writing a column nothing read, dropped in
v0.9.20) and the pre-v0.9.27 `adminTurnoutReminder` (written, never sent).

**One additive migration. No new route, no new dependency, no behaviour change for anyone today.**

---

## Findings index

| # | Finding | Where |
| --- | --- | --- |
| F1 | **Deleting the default parameter is the fix, not the column.** `locale: Locale = DEFAULT_LOCALE` is *why* nine call sites shipped Croatian: omission compiled. Removing it turns an inbox-only defect into a build failure | §3 |
| F2 | **The spec undercounted its own call sites** — eight listed, **nine** exist. `resendVoterLink` was found only because making `locale` a *required* field on `SendableElection` turned the omission into a compile error | §3 |
| F3 | **The card now writes, but nothing reads the column back for the UI.** Locale is still resolved from the URL. The column drives **outbound email only** — stated as scope, registered as the remaining precondition for un-gating `/en` | §6 |
| F4 | **`additionalFields` does not type `user` in the reset/delete hooks either** — proven by `tsc`, correcting the spec's §5 trap 1. All three admin senders therefore share one lookup | §4 |
| F5 | **Found at `review`: a comment asserted the opposite of its code.** The turnout dedup claimed *"first insert wins"*; `new Map(entries)` keeps the **last** | §5 |
| F6 | **Found at `review`: the function deciding the language of three emails had no test at all.** Mutating it to always return `hr` broke nothing. Extracted to `src/lib/db/user.ts` and covered | §5 |
| F7 | **A mutation harness reported four false SURVIVED verdicts.** `--reporter=basic` does not exist in vitest 4, so the runs crashed before executing a test — a harness failure reads exactly like "no test caught it" | §8 |
| F8 | **Unverified, and it is the load-bearing assumption of decision 2:** that `signUpEmail` creates the user row *before* invoking `sendOnSignUp`. Reasoned from the API, never observed | §7 |

---

## 1. Decisions taken at `start`

| # | Decision | Taken |
| --- | --- | --- |
| L-1 | **`String @default("hr")`**, not a Postgres enum | user (recommended) |
| L-2 | **Declare `user.additionalFields.locale`** so `/api/auth/register` can set the locale *at row creation* | user (recommended) |

**L-1** matches `Election.reportLocale`, and `LOCALES` in `src/i18n/config.ts` is already the single
source of truth. `z.enum(LOCALES)` guards the write, `resolveLocale` guards every read, and a third
locale needs no migration.

**L-2 is the subtle one.** The email-verification OTP is sent by `sendOnSignUp` from *inside*
`signUpEmail`, so a locale written by a follow-up `update` would arrive after the message had already
been sent. Without `additionalFields`, signing up on `/en/signup` would always have produced a
Croatian OTP — which is the one reachable-today write path. See F8 for what remains unproven about it.

**Ruled out of scope and stated up front:** `Organization.locale` (see §6), un-gating `en`, the
marketing locale toggle, per-voter locale, and Resend suppression-list sync (not a defect —
`resend@6.17.2` exposes no `suppressions` resource; it lives in § Emails of the roadmap).

---

## 2. The column

```prisma
// prisma/migrations/20260810124158_add_user_locale
ALTER TABLE "users" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'hr';
```

Additive, no backfill — the default covers every existing row, and every existing row *is* Croatian,
so the default is not a guess.

`src/i18n/config.ts` gains the one place an unknown locale becomes a known one:

```ts
export function resolveLocale(raw: string | null | undefined): Locale {
  return LOCALES.find((l) => l === raw) ?? DEFAULT_LOCALE;
}
```

The column is `TEXT` and is writable through BetterAuth's `/sign-up/email`, which can be hit
directly — so a value reaching a sender is **not** guaranteed to be a locale we know. Without this
guard `templateId()` would compose `electius-otp-xx`, Resend would not recognise it, and the send
would throw. `resolveExportLocale` in `voter-export.ts` now delegates here, so the CSV routes and the
mail share one normaliser (invariant #5) with zero call-site churn.

---

## 3. Threading — the mechanism is the deletion (F1, F2)

Every sender previously read:

```ts
export async function sendInvitationEmails(…, locale: Locale = DEFAULT_LOCALE)
```

That default is the entire bug. Nine call sites omitted the argument and **compiled**. The fix
removes it from all six senders, so an omission is now a build failure rather than a silently
Croatian email that nobody sees until it is in someone's inbox.

The same move one level up: `SendableElection` gained `locale: Locale` as a **required field**, not
an optional argument. That is what surfaced the ninth call site (`resendVoterLink`, the QR
"email me a link" path, which reaches a sender indirectly through `inviteVoter`) — the spec's §1.2
listed eight.

| Sender | Locale source |
| --- | --- |
| `sendOtpEmail` · `sendResetPasswordEmail` · `sendDeleteAccountEmail` | the recipient's own `User.locale` |
| `sendInvitationEmails` · `sendReminderEmails` | `election.createdBy.locale` (see §6) |
| `sendTurnoutEmails` | **per recipient** — each admin's own `User.locale` |

`sendTurnoutEmails` widened from `string[]` to `{ email, locale }[]`, so its variables are built
**per recipient** rather than once per batch. This is not cosmetic: `CLOSES` is our own `Intl`
output, so the language that picks the template must be the language that formats the date, or an
English message carries a Croatian date. `QUORUM` is word-free and stays hoisted as the one
locale-independent value. The batch was already per-recipient, so this costs nothing.

---

## 4. The two paths that cannot fall back to a request (F4)

These are why the fix needed persistence at all, and why it was mis-scoped as plumbing.

**The cron sweep** (`/api/cron/activate-elections`, passes 3 and 5) has no URL, no session and no
`getLocale()`. **BetterAuth's hooks** live under `/api/auth/*`, outside the `[locale]` segment, so
there is no next-intl request context there either — the same constraint that made `email.service.ts`
read catalogs directly before v0.9.26, and that makes every export route take `?locale=` as a query
param.

The spec expected only `sendVerificationOTP` to need a lookup, since it receives an address rather
than a user. **That was half right (F4):** `additionalFields` does not type `user` in
`sendResetPassword` or `sendDeleteAccountVerification` either — both are typed against the core user
shape, proven by `tsc`. The value *is* on the object at runtime, but reading it through a cast means
asserting what the types deny. So all three go through one lookup:

```ts
// src/lib/db/user.ts
export async function localeForEmail(email: string): Promise<Locale> {
  const user = await prisma.user.findUnique({ where: { email }, select: { locale: true } });
  return resolveLocale(user?.locale);
}
```

---

## 5. Found at `review`

**F5 — a comment asserting the opposite of its code.** `sendAdminTurnout` moved its admin dedup from
a `Set` to a `Map` (each admin now carries a locale), with a comment saying *"prvi upis pobjeđuje"* —
first insert wins. `new Map(entries)` keeps the **last**; verified rather than assumed. Behaviourally
this is reachable only when two admin rows hold the same address differing in case (`email` is
`@unique` but case-sensitive in Postgres), so the choice between them is arbitrary either way. The
**comment** was the defect, and it is exactly what this codebase's comment discipline exists to
prevent. Rewritten to state last-wins and why the difference is unreachable.

**F6 — the function deciding the language of three emails had no test.** Mutating `localeForEmail` to
return `DEFAULT_LOCALE` unconditionally — silently reverting OTP, password-reset and delete-account
mail to Croatian, three of the nine call sites — **broke nothing**, because it lived in
`src/lib/auth/index.ts` and no test file imports that module (booting BetterAuth in a test is the
thing `auth/rate-limit-rules.ts` was extracted to avoid).

Closed by the same move: the function now lives in **`src/lib/db/user.ts`** with a colocated
`user.test.ts`. `db/` is the consistent home — it is a single-column query keyed by email, beside
`db/organization.ts` and `db/voters.ts` — and invariant #8 keeps tests inside `src/lib`/`src/actions`.

> **Carry-forward:** when a module cannot be tested because of what it *imports*, move the decision
> out rather than mocking harder. This repo already had the precedent on file.

---

## 6. What was NOT built, and why it is filed rather than fixed (F3)

**Nothing reads `User.locale` back to decide the interface language.** The column drives **outbound
email only**.

- `src/i18n/request.ts` still derives locale from `requestLocale` — the URL
- `src/i18n/routing.ts` keeps `localeDetection: false`; nothing reads a locale cookie
- `src/proxy.ts` falls back to `routing.defaultLocale` on a bare root
- the card's `active` state comes from `useLocale()`, i.e. the URL, not the column

So an admin who signed up on `/en/signup` has `locale: "en"` stored, lands on `/hr/home`, and sees
**Croatian selected in the card while their email arrives in English.**

Latent today: the card gates English (`ENABLED = { hr: true, en: false }`), so its only reachable
write is `/en` → `hr`, which converges on the default anyway. The divergence becomes user-visible the
moment `en` is un-gated — which is why it is filed **with** that work.

It is not a line of code. `localeDetection: false` is deliberate, and `proxy.ts` checks cookie
*presence* only (invariant #4), so reading a DB column during routing would break the session seam
`requireSession()` owns. Two candidate designs, neither costed, are recorded in
`future-updates-spec.md` § Emails → *Locale threading*: a locale cookie written beside the `setLocale`
action and read by the proxy, or a redirect in `(app)/layout.tsx`, which already awaits the session.

The fix spec's §7 bar line *"choose English, sign out, sign back in, land in English"* was **amended
in place** rather than quietly failed — it asks for a read path §4 never scoped.

### The other deferral: voter mail has no locale of its own

Voter mail reads **`election.createdBy.locale`**. At 1 organization ↔ 1 admin that is exactly the
org's language, so it is correct today at half the schema cost of adding `Organization.locale`.

The day a second seat exists, **a voter's ballot language is decided by whichever colleague happened
to create the election**, and nothing in the UI surfaces it. Same class of mistake
`entitlement.service.ts` avoids out loud for retention ("must follow the record's owner, not whoever
clicked Archive") — accepted here because the cardinality makes it unreachable, not because the
reasoning is wrong.

**Registered, not floating:** `future-updates-spec.md` § Billing → *Extra admin seats* carries a ⚠️
requiring `Organization.locale` **in the seats migration**. Both reads of `createdBy.locale` carry a
`ponytail:` comment naming the ceiling, so the next reader meets it in the code.

**Accepted consequence:** an election has one language. A mixed-language electorate gets one language
for its ballots; per-voter locale is a different feature and must not be smuggled in.

---

## 7. Verification — and what it does not cover (F8)

`npm run lint` · `npx tsc --noEmit` · `npm run build` · `prisma migrate status` **all clean**.
**634 tests across 35 files** (from 620/34 on `main`).

Ten guards mutation-checked, each turning **exactly one named test** red — never the whole file:

| Mutation | Caught by |
| --- | --- |
| `setLocale` drops the write | the persist test |
| `publishElection` ignores the creator's locale | the non-default-locale test |
| turnout ignores per-admin locale | the two-admin test |
| `resendVoterInvite` ignores the creator's locale | the non-default-locale test |
| `sendOtpEmail` hardcodes the `hr` alias | the alias-selection test |
| turnout builds one variable set for the batch | the per-recipient date test |
| `localeForEmail` always returns the default | ✎ added at `review` |
| `localeForEmail` drops the `resolveLocale` guard | ✎ added at `review` |
| `localeForEmail` keys the lookup on another address | ✎ added at `review` |

Every new test deliberately uses a **non-default** locale. With an `hr` fixture, an implementation
that ignores the column entirely still passes — `hr` is the outcome either way.

`resolveLocale` has no test file of its own; its fallback is pinned twice indirectly (the `"klingon"`
cases in `publication.service.test.ts` and `db/user.test.ts`), which is enough for a one-line
`find ?? default`.

### Not verified — stated rather than implied

- **No email has been sent.** The `-en` aliases remain unreachable *in practice*, and the two cron
  paths are unproven end to end. This matters more here than usual: **a wrong locale is not a crash,
  it is a silently wrong language in someone's inbox**, so only reading a delivered message proves it.
- **F8 — the ordering assumption behind decision L-2 is unobserved.** The design assumes `signUpEmail`
  creates the user row *before* `sendOnSignUp` fires. If that is wrong, the first OTP falls back to
  `hr` even for an `/en` signup, and `additionalFields` bought nothing. Reasoned from the API and
  from the fact that the send needs a user, never watched happen. **Check this first** when the live
  pass is run.
- No browser pass. The card's write path is unit-tested; its rendered behaviour is not re-verified.

---

## 8. Environment and process notes

**A mutation harness can report convincing false results (F7).** The first run reported four guards
`SURVIVED`. All four were harness failures: `--reporter=basic` does not exist in vitest 4, so every
run crashed before executing a single test. A crashed run and an uncaught mutation are
indistinguishable unless you check.

> **Carry-forward:** a mutation runner must assert **two** things before believing a verdict — that
> the search string was found (this repo's CRLF files silently defeat multi-line `\n` patterns, twice
> recorded already) **and** that the suite actually executed. Run one unmutated baseline first.

**`git restore --source=HEAD` on uncommitted work destroys it.** During this session it was run on
three files carrying the whole fix, reverting them to the pre-fix commit. Recovered from diffs
captured earlier in the same session and re-verified from scratch. There is no stash and no reflog for
working-tree changes that were never staged.

---

## Files

| File | Change |
| --- | --- |
| `prisma/schema.prisma` + `migrations/20260810124158_add_user_locale/` | `User.locale String @default("hr")` |
| `src/i18n/config.ts` | `resolveLocale` — the one normaliser |
| `src/actions/settings.ts` | `setLocale` action beside `setAccessibilityPref` |
| `src/components/settings/language-card.tsx` | writes **before** navigating; `.catch()` → rollback toast |
| **`src/lib/db/user.ts`** + `user.test.ts` | **new** — `localeForEmail`, extracted at `review` |
| `src/lib/auth/index.ts` | `additionalFields.locale`; all three hooks pass a locale |
| `src/app/api/auth/register/route.ts` | passes its already-normalised `safeLocale` into `signUpEmail` |
| `src/lib/services/email.service.ts` | `locale` required on all six senders; `TurnoutRecipient` |
| `src/lib/services/publication.service.ts` | `SendableElection.locale`; four `createdBy.locale` reads |
| `src/actions/voters.ts` | the ninth call site |
| `src/lib/voter-export.ts` | `resolveExportLocale` delegates to `resolveLocale` |
| `messages/{hr,en}.json` | one key — the card's save-failure toast |

---

## Related

- `docs/2026-08-09/resend-templates.md` — why the **alias**, not the catalog, selects a language
- `docs/2026-08-10/per-recipient-delivery.md` §2 — where this was re-scoped from plumbing to a fix
- `future-updates-spec.md` § Emails → *Locale threading* — the interface read-back (§6)
- `future-updates-spec.md` § Billing → *Extra admin seats* — the `Organization.locale` obligation
