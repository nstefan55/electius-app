# Profile & Settings Phase 2 — Image Upload (Cloudflare R2)

**Branch:** `feature/profile-logo-upload` · **Version:** 0.9.8 → 0.9.9
**Specs:** `context/features/profile-settings-phase-2-spec.md` (page integration) ·
**`context/features/file-image-spec.md` (authority on everything R2)**
**Design:** `context/design/electius-profile-settings-page-design/project/Profile.dc.html` — Organization card logo row

`Organization.logoUrl` had been read in three places since settings phase 1 and written in none.
This ships the missing writer — and, added mid-build at the user's request, a second one for
`User.image`, a column that until now only ever held a Google OAuth URL.

**New dependency:** `aws4fetch` (~7 KB). **No schema change.** No new server action.

---

## What shipped

| File | Change |
| --- | --- |
| `src/lib/upload-validation.ts` + `.test.ts` | **new**, pure — size + **magic-byte** checks + the object-key builder |
| `src/lib/services/storage.service.ts` | **new**, `server-only` — `putObject` · `deleteObject` · `objectUrl` · `keyFromUrl`. The only file that knows R2 exists |
| `src/lib/services/image-upload.service.ts` | **new**, `server-only` — the shared store/clear flow both routes call |
| `src/app/api/organization/logo/route.ts` | **new** — POST/DELETE, writes `Organization.logoUrl` |
| `src/app/api/profile/avatar/route.ts` | **new** — POST/DELETE, writes `User.image` |
| `src/components/ui/image-upload.tsx` | **new** — `useImageUpload` hook + `ImageUploadSlot`, shared by both cards |
| `src/components/settings/logo-upload.tsx` | **new** — the organization logo row |
| `src/components/settings/organization-card.tsx` | display-only slot replaced by `LogoUpload` |
| `src/components/settings/profile-card.tsx` | identity row avatar is now an upload target |
| `src/components/elections/election-report.tsx` | branches on `logoUrl` — resolves its line-24 `ponytail:` |
| `src/components/dashboard/sidebar-nav.tsx` | account block shows the picture, initials when there is none |
| `src/components/dashboard/dashboard-shell.tsx` · `(app)/layout.tsx` | `ShellUser` gains `image`; the PII projection widens by one **named** field |
| `src/lib/auth/require-session.ts` | session gains `user.image` + `user.organizationLogo` |
| `src/components/ui/initials-avatar.tsx` | comment corrected — it is the fallback now, not a deferred decision |
| `messages/{hr,en}.json` | `dashboard.profile.organization.logo.*` · `dashboard.profile.account.avatar.*` |

**331 tests pass** (+16). `npm run lint` and `npm run build` clean. 0 console errors.

---

## Decisions taken at `start`

1. **`aws4fetch`, not `@aws-sdk/client-s3`.** R2 speaks S3, so the requests need SigV4 signing —
   but the whole surface here is `PUT` and `DELETE` on one object. The AWS SDK is ~3 MB of command
   classes and middleware that lands in every cold start; `aws4fetch` signs a plain `fetch` in
   ~7 KB and is what Cloudflare's own R2 docs reach for. **This is a deviation from
   `file-image-spec.md` §6, which names the SDK** — amend that spec or revisit if the private
   bucket later needs multipart or presigning.

2. **Env keys split per bucket.** `.env.development` and `.env.production` each declared
   `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` **twice with different values** (a private block and
   a public block), so one silently won and the two buckets could never both be addressed. Now:

   ```
   R2_ACCOUNT_ID              shared
   R2_ACCESS_KEY_ID           private bucket (election reports — not this phase)
   R2_SECRET_ACCESS_KEY
   R2_BUCKET_PRIVATE

   R2_LOGO_ACCESS_KEY_ID      public bucket (this phase)
   R2_LOGO_SECRET_ACCESS_KEY
   R2_BUCKET_PUBLIC
   R2_PUBLIC_URL
   ```

   **Production values must also be set in Vercel** — the app cannot verify they exist, and the
   same silent no-op already caught Upstash during rate-limiting.

3. **The 72 px slot *is* the button.** Spec §1 allows either a clickable slot or a button beside
   it; the design draws a 72 px slot, where a drop zone is a worse target than a click. The
   design-system §7.6 CSV drop zone is deliberately not reused.

---

## How it works

### The validation is the security boundary

`validateImage(bytes)` is the only thing that decides whether content reaches the bucket, and it
reads **magic bytes** — never the filename extension, never the browser-supplied `Content-Type`,
both of which the sender controls. The `Content-Type` that gets stored and served is derived from
the detected format.

| Format | Signature |
| --- | --- |
| PNG | `89 50 4E 47 0D 0A 1A 0A` |
| JPEG | `FF D8 FF` |
| WebP | `RIFF` + 4 length bytes + `WEBP` at offset 8 |

Order matters: **size is checked before type**, so a 3 MB PDF reports "too large" rather than the
less accurate "wrong type". Exactly 2 MB passes; 2 MB + 1 does not.

**SVG is excluded by decision, not deferred.** An SVG is a document that can carry `<script>`, so
serving one from your own origin is stored XSS. If vector is ever required the answer is
server-side sanitisation, not an allowlist entry.

The WebP check verifies `WEBP` at offset 8 and not just the `RIFF` container — WAV and AVI are also
RIFF files, and there is a test pinning that.

### The key builder makes a class of bug unrepresentable

```ts
imageKey(folder: string, ownerId: string, extension: string): string
//  → logos/{organizationId}/{uuid}.png
//  → avatars/{userId}/{uuid}.png
```

**The user's filename is not a parameter**, so the key cannot echo it. Path traversal, collisions
and PII-in-the-key (someone uploading `ivan-horvat.png`) are all impossible by construction rather
than by review — the same technique `VoterExportRow` uses to make exporting a magic-link token a
compile error.

A related trap avoided in the avatar route: the session carries `email`, not `id`. Keying on email
would have put a personal identifier straight into the object key, so the route resolves the cuid
first.

*`ponytail:` `randomUUID()` rather than a cuid — it is stdlib, and the key only needs uniqueness.*

### Ordering: DB first, R2 second, delete failures loud

Both routes go through `image-upload.service.ts` so this sequence has exactly one implementation:

```
store:  validate → PUT new object → write column → delete old object
clear:  null column → delete object
```

The old object is dropped **last**, once the new one exists and the column points at it. A failed
delete is logged and does not fail the request — the user's image did change, and a stale object is
wasted storage rather than a leak. A URL that is not ours (a Google avatar) is skipped rather than
attempted.

### Two routes, not one endpoint

`/api/organization/logo` and `/api/profile/avatar` are separate on purpose. A single endpoint
taking a "target" in the request body would put **user input back in charge of which row gets
written** — precisely what taking the owner id from the session avoids. Each route reads its owner
from `requireSession()` and nothing else; a cross-org or cross-account write is not a check that
could be dropped in a refactor, it is unexpressible.

### Client/server split

`components/ui/image-upload.tsx` exports **two** things rather than one component:

- `useImageUpload(endpoint, labels)` → `{ pending, upload, remove }` — fetch, toasts, `router.refresh()`
- `<ImageUploadSlot>` — the button, the hidden input, the hover overlay

The slot and the network work are genuinely shared; the layout around them is not (the logo has
helper text and Remove underneath, the avatar has a name and provider line beside it). One
component covering both would have degenerated into layout flags.

The client-side size check is **UX only** — it saves a round trip on an obviously oversized file.
Every real decision happens on the server.

---

## Two bugs found in the browser, not in the tests

**1. `MissingContentLength` (411).** R2 rejects a `PUT` without `Content-Length`, and Next's patched
`fetch` does not set it for a `Uint8Array` body. A Node smoke test had passed because undici *does*
set it — so this was only reachable through the real server. Fixed by setting the header explicitly;
it is on aws4fetch's unsignable-headers list, so the signature is unaffected.

**2. The hidden input was in the accessibility tree.** `className="sr-only"` left a second,
unnamed *"Choose File"* control next to the visible button. Screen-reader users would meet a
nameless duplicate. Fixed with the `hidden` attribute — a hidden input still opens the picker on
`.click()`.

---

## ⚠ This changes a load-bearing claim in `file-image-spec.md`

§2 states: *"the bucket holds no personal data at all — that is what makes the rest of this spec
small: no signed URLs, no download proxy, no transaction-spanning delete problem."*

**An avatar is a photo of a person, so that is no longer true.** What follows from it:

- **Settings phase 5 (account deletion, GDPR Art. 17) must delete the avatar object.** R2 does not
  participate in the Postgres transaction, so this needs an explicit `clearImage` call or the
  photo outlives the deleted account. Marked `ponytail:` at `api/profile/avatar/route.ts`.
- **Nothing prunes the bucket** → indefinite retention (Art. 5(1)(e)).
- **Public-read** → a permanent unauthenticated URL to the admin's face.

Judged acceptable: it is the admin's own picture, self-uploaded and removable in one click, and
Google OAuth avatars were already public URLs on `googleusercontent.com`. **`file-image-spec.md` §2
should be amended** to say the bucket holds one admin photo per account rather than no personal
data at all.

Everything §2 keeps out stays out: voter roster CSV, results CSV, the sealed-archive PDF. Nothing
in the bucket is keyed to an election, so `deleteElection` is still untouched.

---

## Behaviour worth knowing

- **Removing an avatar returns the initials, not the Google picture.** Only a fresh Google sign-in
  restores that.
- **Uploading over a Google avatar does not try to delete Google's object** — `keyFromUrl` returns
  null for a foreign host and the delete is skipped.
- **The sidebar syncs on the same `router.refresh()`** the card triggers; no manual reload. The
  `(app)` layout's PII projection was widened by one field listed **by name** — the projection
  exists because TS types do not strip runtime fields, so it must never become a spread.
- **The PDF report renders the organization logo when one exists**, otherwise the Electius mark,
  which is also the correct Free-tier behaviour. It reads `user.organizationLogo` off the session,
  which rides the org select that already runs — no extra query.
- **Uploading is ungated during the MVP** (spec D1). The **Pro** chip on the helper is
  informational and inherits whatever `isPro` gate billing (phase 3) introduces.

---

## Verification

**Unit (16 new, 331 total).** Each allowed format accepted; PDF renamed `.png` and SVG rejected; a
RIFF-but-not-WEBP file rejected; content shorter than a signature does not throw; the 2 MB boundary
both sides; size checked before type; key shape per folder, uniqueness, and no filename path.

**Live, against the real dev bucket:**

| Check | Result |
| --- | --- |
| Upload logo | byte-exact object, `image/png`, `logoUrl` set |
| Replace | **old object 404**, new one present |
| Remove | placeholder returns, column null, object gone |
| 3 MB file | error toast, **zero requests fired** |
| PDF renamed `.png` | **400 `badType`**, nothing persisted |
| Avatar upload | `avatars/{userId}/…` — separate keyspace from `logos/` |
| Avatar remove | back to initials, **logo untouched** |
| Sidebar | initials → picture on the same refresh, same URL as the card |
| PDF report | renders the logo; falls back to the Electius mark once removed |
| `/en` | fully English |
| Bucket after ~8 cycles | exactly the current objects — **no orphans** |

---

## Dev-environment notes

- **`npm run build` clobbers the `.next` a running dev server serves from** (recurring — fourth
  time in this project's history). Restart the dev server before browser-verifying.
- **Turbopack HMR can wedge the dev server**: the process stays alive and the port stays bound, but
  requests hang. Kill by PID (`Get-NetTCPConnection -LocalPort 3000`), `rm -rf .next`, restart.
- **Playwright's stability check flakes on this slot** even when the element is provably static
  (identical bounding box across 600 ms). `{ force: true }` or driving the input directly works.
- **`getByRole('button', { name: 'Ukloni' })` matches by substring**, so it also hits
  *"Ukloni sliku"*. Use `exact: true` now that both remove buttons exist on `/profile`.
- A throwaway script importing `server-only` modules needs `npx tsx --conditions react-server`, and
  `tsx` does not load `.env.development` the way `prisma.config.ts` does — load it explicitly.

---

## Open follow-ups

- **Amend `file-image-spec.md`** §2 (personal data) and §6 (`aws4fetch` vs the AWS SDK).
- **Settings phase 5** inherits the avatar-deletion obligation above.
- No image resizing or optimization — `ponytail:` if PDF weight becomes a problem.
- No cropping UI, no favicon/brand-colour extraction, nothing in the private `electius-files`
  bucket (`election-report-storage-spec.md`, which will import `storage.service.ts` unchanged).
