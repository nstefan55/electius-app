# Signup Terms Acceptance — asking once, at the right moment, and recording it

**Branch** `feature/signup-terms-acceptance` · **Version** 0.9.69 · Inline
request, no spec file

The Terms checkbox returns to the signup form. One migration (two nullable
columns on `User`), no new dependency, no new route.

---

## The one sentence this feature turns on

v0.9.65 moved acceptance to `/setup` for two reasons, and only **one** of them was
about *where*. The other was that the signup checkbox **recorded nothing**. This
branch brings the checkbox back while keeping the recording — which means it is
not a revert.

---

## What v0.9.65 was actually fixing

Read this before touching any of it, because two of the three defects can come
straight back:

1. **The tick was never sent.** `terms` was validated in the browser and dropped
   — absent from the request body, absent from `registerSchema`, absent from every
   column. A click-wrap whose only evidence is "our form had a required checkbox."
2. **⚠ Google bypassed it entirely.** The Google button sits **above** the form
   (`signup-form.tsx:135`) and reads no form state. The one gate the product had
   was skippable by clicking the more prominent button.
3. The party to the contract is the **organization**, which does not exist until
   `/setup` creates it.

Point 3 still holds and is unchanged: `Organization.termsAcceptedAt` remains the
binding record. Points 1 and 2 are what this branch had to keep closed.

---

## The shape

```
signup (email/password)          Google
  [x] Slažem se ...                │
  gate: zod + server               │  (button reads no form state)
        ↓                          │
  User.termsAcceptedAt  ───────────┼──────────┐
  User.termsVersion                │          │
        ↓                          ↓          ↓
/setup:  user HAS record      user has NO record
         → no checkbox        → checkbox shown  ← the only gate Google meets
         → COPY user's        → stamp user AND
           date to the org      the org, now
```

Three cases in `completeSetup`, not two:

| Org record | User record | Behaviour |
| --- | --- | --- |
| present | — | nothing; a return visit is profile editing, not a new contract |
| absent | present | **copy** the user's original date + version to the org |
| absent | absent | **ask** — this is the Google path, and legacy orgs |

**The copy carries the original date, not today's.** The record has to say *when*
acceptance happened; re-stamping would lose the moment and make the version
column meaningless.

---

## Where acceptance is recorded, and why not via `additionalFields`

`locale` rides `user.additionalFields` into `signUpEmail`. Terms deliberately do
**not**: `additionalFields` is writable by a direct `POST /api/auth/sign-up/email`,
so a client could self-certify an earlier date or an older Terms version.

Instead `api/auth/register` writes the row **after** `signUpEmail` returns, with a
server-generated `new Date()` and `TERMS_VERSION` from `lib/legal.ts`. The client
sends only a boolean.

Consequence, and it fails in the safe direction: an account created by hitting
`/sign-up/email` directly has **no** acceptance record, so `/setup` asks — exactly
like a Google account.

The gate itself runs **before** `signUpEmail`, so a request without `terms` never
creates a user:

```ts
if (terms !== true) {
  return NextResponse.json({ success: false, error: "terms_required" }, { status: 400 });
}
```

A failed write is logged and swallowed — the account exists, and `/setup` will ask
again. Losing the account over a failed audit row would be the worse trade.

---

## Files

| File | Change |
| --- | --- |
| `prisma/schema.prisma` + migration `20260912165240_add_user_terms_acceptance` | `User.termsAcceptedAt`, `User.termsVersion`, both nullable |
| `src/components/auth/signup-form.tsx` | checkbox + `z.literal(true)` gate, sends `terms`, Terms linked |
| `src/app/api/auth/register/route.ts` | server gate + records acceptance |
| `src/actions/setup.ts` | the three-case logic above |
| `src/app/[locale]/(auth)/setup/page.tsx` | `termsAccepted` now reads **both** records |
| `messages/{hr,en}.json` | `form.terms`, `errors.terms`; `termsNote` deleted |

`termsNote` had to go: it said *"you will confirm them in the next step"*, which is
no longer true for the email/password path.

**Nullable on purpose.** An empty column means *"never asked"* — the signal
`/setup` reads to decide whether to gate. It is not a defect to backfill.

---

## Verification

Live, against the dev branch:

| Case | Result |
| --- | --- |
| `POST /register` with no `terms` field | **400 `terms_required`**, no user created |
| `terms: false` | **400 `terms_required`** |
| `terms: true` | **201**, and `termsAcceptedAt` + `termsVersion` written |
| Signup form, fields filled, box unticked | toast *"Morate prihvatiti Uvjete korištenja."*, no request sent |
| `/setup`, user **has** acceptance | **no checkbox** — asked once, at signup |
| `/setup`, user **has no** acceptance (Google) | **checkbox shown** — still gated |

Browser: label reads exactly *"Slažem se da sam ovim putem upoznat s **Uvjetima
korištenja** te ih ovim putem prihvaćam."*, Terms link opens the apex `/terms` in a
new tab, privacy notice stays **below** the checkbox and outside the gate (EDPB
05/2020 — bundling a notice into a mandatory consent tick invalidates it), zero
`href="#"`, 0 console errors.

Gates: `tsc --noEmit` clean · `eslint` 0 errors (7 pre-existing warnings) ·
**808 tests / 45 files** (from 804).

Four mutations, each caught by a **named** test after a green control run:

| Mutation | Caught by |
| --- | --- |
| `acceptsNow` ignores the user record (Google stops being gated) | *"i dalje traži kvačicu … (Google)"* |
| copies today's date instead of the original | *"PREPISUJE izvorni datum"* |
| user no longer stamped when accepting at `/setup` | *"i na povratku … korisnik dobiva zapis"* |
| `?? null` normalisation dropped | the suite |

⚠ That third mutation **survived the first run** — the test only covered the
org-*create* path while the mutated line lives in the *revisit* path. The extra
test exists because of that, not in spite of it. A mutation run is only as good as
the branch coverage underneath it.

---

## Rules to carry forward

1. **Never move the Terms gate without checking Google.** That button reads no
   form state. Any gate on the signup form covers email/password only.
2. **A tick that records nothing is evidence of nothing.** The copy says
   *"prihvaćam"*; if it stops being recorded, change the copy or restore the write.
3. **Do not put acceptance on `additionalFields`** — it is client-writable through
   the direct BetterAuth endpoint.
4. **Bump `TERMS_VERSION` for any change of obligation**, never for a typo, or the
   acceptance record starts pointing at the wrong document.
5. The organization stays the contracting party. `User.termsAcceptedAt` records
   *who clicked*; `Organization.termsAcceptedAt` is what binds.
