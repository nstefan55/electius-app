# Fix: Demo seed organization logo — the branded-PDF gate becomes visible in dev (v0.9.51)

**Branch:** `fix/demo-seed-org-logo` · inline request (`final-checklist.md` line 6, carried from production readiness) · reverses D7 of the demo-seed spec

## The gap

`Organization.logoUrl` has exactly one consumer that changes behaviour: the report page's gate, `orgLogoUrl={canBrandReports(entitlement) ? user.organizationLogo : null}`. `npm run db:seed` never wrote the column, so that expression was `null` on both tiers and `election-report.tsx` drew the Electius mark for Free *and* Pro. The gate shipped on 2026-08-07 with "branded vs Electius mark on a rendered report — not verified live" and stayed that way for a structural reason: the fixture gave it nothing to show.

The demo-seed spec's D7 left the logo null on purpose, arguing that "writing it from the seed means putting a real object in the R2 public bucket". That premise is false. `logoUrl` is only ever *displayed* (a plain `<img>` in the report header and in the `/profile` upload slot) and only ever *parsed* by `keyFromUrl`, which returns null for anything outside `R2_PUBLIC_URL`. A non-R2 value is display-only and inert on replace, remove and account purge.

## The fix

- `public/demo/org-logo.png` (new, 5.4 KB, 256×256): a navy tile with a white "UZ" monogram and a gold bar, rasterized once from an inline SVG through the same local Chrome the PDF route uses (`puppeteer-core` + `CHROME_EXECUTABLE_PATH`; `sharp` is not resolvable in this repo). Visibly unlike the Electius checkmark, which is the whole point of a fixture for this gate.
- `prisma/demo-user-seed.ts`: `DEMO.logoUrl = "/demo/org-logo.png"`, written into `organization.create` on **both** variants. The closing report gains one line saying the logo is seeded and that only Pro renders it. A same-host relative path, so it resolves on whatever host the seeded app runs on and needs no env var.

The fixture is deliberately tier-independent: the **tier** decides what the report shows. `db:seed` (Free) with `BILLING_ENABLED=true` → Electius mark plus the branded-reports upsell banner; `db:seed:pro` → the organization logo and no banner. With the flag off (today's `.env.development`) the resolver returns Pro for everyone and the logo shows on both variants, which the seed's existing warning already covers.

Decisions at start: a PNG under `public/` over an SVG data URI (user's call) and over a real R2 upload (the seed would need credentials, fail offline, and orphan an object on every re-seed, since the wipe deletes no R2 objects). "Fixture testing" means the seed is the fixture and the live matrix below is the test; no new unit test, because `canBrandReports` is already pinned in `entitlements.test.ts` and the page ternary sits outside invariant #8's scope.

## Verification

- `npm run typecheck` clean (the only gate that compiles `prisma/`) · `npm run lint` 0 errors (7 pre-existing warnings) · `npm run test` **748/748** · `npm run build` clean
- Live with `BILLING_ENABLED=true` (restored byte-identical afterwards, sha256 compared), own dev server, real sign-in through the loopback credentials helper, Neon development branch:

| Surface | Free (`db:seed`) | Pro (`db:seed:pro`) |
| --- | --- | --- |
| `/elections/[id]/results/report` header, CLOSED election | Electius mark via `next/image` + "Electius" wordmark | `<img src="/demo/org-logo.png">` at 256×256, no wordmark |
| Branded-reports upsell banner | `display:block` on screen, `display:none` under `emulateMedia({ media: "print" })` | absent |
| `/profile` organization card | one `<img src="/demo/org-logo.png">`, loaded at 256×256 | same |
| `GET /api/elections/[id]/report/pdf`, LIVE referendum | not run (Free has no LIVE election) | 200 · `application/pdf` · 136 315 bytes · `%PDF-` · `FontFile` present · `/Width 256` + `/Height 256` present · `reportKey` still null afterwards |

- SQL on the development branch: `logoUrl = '/demo/org-logo.png'` on the demo organization after each seed, `isPro` false/true per variant.
- Teardown: signed out, browser closed, dev server and credentials helper stopped with both ports confirmed free, dev DB re-seeded on Free, Playwright artifacts removed.

## Gotchas

- The PDF route was exercised on the **LIVE** election on purpose: a preliminary report renders fresh and stores nothing, so the check leaves no object in the private R2 bucket. On a CLOSED election the same call would have stored a report that the seed's wipe never deletes.
- `page.request.get()` inside the Playwright MCP runs in Node and cannot resolve `*.localhost`. Fetch authenticated API routes from inside the page (`page.evaluate` + `fetch`) and inspect the bytes there.
- The seed's closing template literal carries a literal `\n`. A heredoc-written edit script turned the double-backslash escape into a real newline on the first attempt; re-read the touched line after any scripted edit.
- The Pro PDF holds two image objects for one logo: the tile and its alpha channel as a soft mask, both `/Subtype /Image`.

## Files

- `prisma/demo-user-seed.ts` · `public/demo/org-logo.png` (new) · `package.json` · `package-lock.json` · this document
