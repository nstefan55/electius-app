# BetterAuth 1.7.2 — the missing `Account.issuer` column

**Branch:** `fix/better-auth-issuer-column` · **Version:** 0.9.36 (patch, 0.9.x lock)
**Migration:** `20260831124324_add_account_issuer` · **Date:** 2026-08-31
**Severity:** authentication was broken on `main` — sign-in, registration and Google OAuth.

---

## 1. Symptom

On `main`, with a correct password against a valid account:

| Path | Result |
| --- | --- |
| `POST /api/auth/sign-in/email` | **401** `{"code":"INVALID_EMAIL_OR_PASSWORD"}`, log line `[Better Auth]: User not found` |
| `POST /api/auth/register` | **500** `{"success":false,"error":"server_error"}` |
| Google OAuth | account creation at the callback hits the same failing write |

Only Google's *authorize redirect* still worked, which made it look narrower than it was.

## 2. Cause

`fb43c1a` ("fix: resolve npm audit vulnerabilities without --force") bumped **better-auth
1.6.26 → 1.7.2** and moved `package.json` to `^1.7.2`. Confirmed from the lockfile at `6639087`
(1.6.26) versus `fb43c1a` (1.7.2).

1.7.2 added a **required `issuer` field to the `account` model**. Our Prisma `Account` had no such
column, which breaks the library in two different directions:

**Reads** — `node_modules/better-auth/dist/api/routes/sign-in.mjs:320` selects the credential
account on **three** conditions:

```js
userRecord?.accounts.find((account) =>
  account.providerId === "credential" &&
  account.issuer === createLocalAccountIssuer("credential") &&   // → "local:credential"
  account.accountId === userRecord.user.id)
```

With no column, `account.issuer` is `undefined` on every row, so the match never succeeds and
BetterAuth reports "User not found". **This is a JS-side filter, not a database query** — which is
why there was no Prisma error, no 500 and nothing in the logs but an ordinary 401.

**Writes** — BetterAuth sends `issuer` on every account create (`sign-up.mjs:246`,
`oauth2/account-key.mjs:28`, `link-account.mjs:105`). Prisma rejects it:

```
Unknown argument `issuer`. Available options are marked with ?.
```

That is registration's 500, and Google OAuth's failure, from one seam.

### Why nothing caught it

`npm run lint`, `npx tsc --noEmit`, `npm run test` and `npm run build` were **all green** the whole
time, and CI runs exactly those. The schema drift lives between our Prisma model and a library's
runtime expectation; no static check in the project looked at that boundary. The only visible
symptom was a 401 — indistinguishable from a wrong password, which is why it was previously written
off as "the seeded demo password has drifted".

## 3. The fix

### Scope was measured, not guessed

Before touching anything, the 1.7.2 core schemas were dumped from `@better-auth/core/db` and
compared field-by-field against `prisma/schema.prisma`:

| Core model | Result |
| --- | --- |
| `account` | **`issuer` missing** — the only gap |
| `user`, `session`, `verification` | all declared fields already present |

This avoided `@better-auth/cli generate`, which **refuses any config that transitively imports
`server-only`** — `src/lib/auth/index.ts` does, via `@/lib/prisma` — and would have needed a
throwaway root config.

### Schema

```prisma
model Account {
  // …
  issuer String   // NOT NULL: 1.7.2 declares it required and writes it on every create
  // …
}
```

### Migration — three steps, hand-authored

`prisma migrate dev` refused to generate this automatically ("Added the required column `issuer` …
There are 2 rows in this table"), and a single default value cannot be correct for both local and
OAuth accounts. So:

```sql
ALTER TABLE "accounts" ADD COLUMN "issuer" TEXT;          -- 1. nullable, existing rows survive

UPDATE "accounts" SET "issuer" = CASE                      -- 2. backfill
  WHEN "providerId" IN ('credential', 'siwe') THEN 'local:' || "providerId"
  ELSE 'local:oauth:' || "providerId"
END WHERE "issuer" IS NULL;

ALTER TABLE "accounts" ALTER COLUMN "issuer" SET NOT NULL; -- 3. now constrain
```

The two forms come straight from the library:

- `createLocalAccountIssuer(id)` → `` `local:${encodeURIComponent(id)}` `` — in 1.7.2 the only local
  providers are **`credential`** and **`siwe`**
- `createOAuthAccountIssuer(id)` → `` `local:oauth:${encodeURIComponent(id)}` `` — everything else
  (`google`)

⚠ `encodeURIComponent` is an identity for our provider ids (`credential`, `google`). A provider whose
id contains special characters would need encoding in the SQL too.

## 4. Regression guard

`src/lib/auth/better-auth-schema.test.ts` — a **contract test** with no source module of its own. It
reads `prisma/schema.prisma` as **text** (Prisma 7 emits TypeScript source with no DMMF to
introspect) and asserts every field the four core schemas declare exists on our model.

```
Prisma schema covers better-auth's core models
  ✓ Account carries every field better-auth declares for account
  ✓ User / Session / VerificationToken …
  ✓ Account carries issuer — the field whose absence broke sign-in on 1.7.2
```

Mutation-checked: deleting `issuer` from the schema turns **exactly two** tests red (the `account`
table row and the named `issuer` assertion) while the other three models stay green.

**On the next `better-auth` bump, this is the test that speaks.** If it fails, add the column and a
migration — do not relax the expectation, because without the column authentication stops working
silently.

## 5. Knock-on

`tsc` caught one, which is worth noting because a runtime-only fix would have missed it:
`prisma/demo-user-seed.ts` creates the demo credential account and now must pass
`issuer: "local:credential"`. Without it the seeded admin cannot sign in — the same 401, on a fresh
database.

## 6. Verification

Same probe run before and after, against the dev server and the Neon **development** branch:

| | before | after |
| --- | --- | --- |
| `register` | 500 | **201** |
| `sign-in` (fresh account) | 401 `User not found` | **403 `EMAIL_NOT_VERIFIED`** → after verifying, **200 + session cookie** |

The intermediate 403 is itself evidence: it is a different code path from "User not found", so the
credential lookup had started succeeding. A newly registered account was inspected and carried
`issuer: "local:credential"`, written by BetterAuth itself.

Google OAuth was **not** driven end-to-end (that needs a real Google round trip); it is fixed at the
same Prisma write that registration proves.

Gate: `tsc --noEmit` clean · **701 tests** (40 files) · lint 0 errors · build compiled ·
`prisma migrate status` up to date. Dev DB returned to baseline; probe users and their verification
rows removed by exact match.

## 7. If you hit this again

A green test suite is **not** evidence that authentication works. When a `better-auth` bump lands:

1. Run `npm run test` — the contract test above is the cheap check.
2. If it passes but auth misbehaves, compare the core schemas directly:
   ```bash
   node --input-type=module -e "import {accountSchema} from '@better-auth/core/db'; console.log(Object.keys(accountSchema.def.shape))"
   ```
3. Re-verify the delete-account flow too — `DELETE_TOKEN_PREFIX` in
   `account-deletion.service.ts` is read off BetterAuth internals and has the same fragility.
