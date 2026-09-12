# Terms of Service — `/terms`, and the contract nobody recorded

**Branch** `feature/terms-of-service` · **Version** 0.9.65 · **Spec**
`context/features/terms-of-service-spec.md`

A public, statically-rendered terms of service at `/hr/terms` and `/en/terms`,
the five surfaces that link to it, and — the half that is code rather than copy —
moving acceptance to `/setup` and recording it. One migration, no new dependency.

---

## The one sentence this feature turns on

A privacy policy is a **notice**: it is discharged by being readable. Terms of
service are a **contract**: they are discharged by being *agreed*. Everything
hard here follows from that difference, and before this branch the product got
the second half wrong in three separate places.

---

## Why this shipped now

### 1. The checkbox recorded nothing

`signup-form.tsx` made the terms checkbox a hard zod gate (`z.literal(true)`),
and since v0.9.64 its label gated the Terms alone. That much was right.

What happened to the tick was not. `terms` was validated in the browser and then
**dropped**: the request body was `{ name, email, password, confirmPassword,
locale }`, and `registerSchema` in `api/auth/register/route.ts` never declared a
`terms` field. No column held it. No timestamp, no version, no IP.

So the checkbox was **an obstacle in the interface, not a record of assent** — a
click-wrap whose only evidence is "our form had a required checkbox at the time",
which is the weakest version of the argument. The code said so itself, at the
call site, in a comment that has now been replaced by the fix.

### 2. Google sign-up never saw it

The Google button sits **above** the form and calls `authClient.signIn.social`
directly. It reads no state. A visitor could create a working account, an
organization and a live election without the tick ever being true — so the one
acceptance gate the product had was bypassable by clicking the more prominent
button.

### 3. The document was named on three surfaces and published on none

| Surface | Before |
|---|---|
| Signup checkbox label | Bold text, **not a link** |
| Shared auth footer | Privacy a link; **Terms a `<span>`** |
| `/setup` footer | **Two `href="#"`**, one of them Privacy — a page that already existed |

All three are closed. Zero `href="#"` remain on any auth surface.

---

## Decisions taken at `start`

| # | Decision |
|---|---|
| Scope | Page + copy + links **+ D2**. The marketing-claims rewrite is its own branch. |
| E2E-V | "END-TO-END VERIFIABLE VOTING" → **"tamper-evident"**, on the marketing branch. |
| Support | The channel is **support@electius.com**, now `SUPPORT_EMAIL` in `lib/urls.ts`. |

Everything else followed the spec's own recommendations (§15 D1, D3–D9).

---

## D2 — where acceptance belongs, and why not the signup form

Both signup paths converge on **`/setup`**: the Google callback lands there, the
email path lands there after OTP, and `requireSession()` bounces any org-less
account there. It is also where the **organization is created** — that is, where
the actual contracting party comes into existence.

That last point is the argument, and it is why the columns went on
`Organization` and not on `User`:

> The admin signs up as a person. The **customer is the organization**. Record
> the acceptance on the user and you have recorded the wrong party signing.

**Migration `20260912155245_add_organization_terms_acceptance`** — two additive
nullable columns, `termsAcceptedAt` + `termsVersion`. The version is not
decoration: §17 of the Terms promises notice before a change and a right to
cancel before it takes effect, and that promise is only provable if the record
says *what* was accepted. Without it, "which terms bound this organization in
March" has no answer however well the clause is drafted.

### The revisit rule — the non-obvious half

`terms` is **optional in the zod schema** and required by the *action* only when
`Organization.termsAcceptedAt` is null:

```ts
const accepted = admin.organization?.termsAcceptedAt ?? null;
const acceptsNow = accepted === null;
if (acceptsNow && terms !== true) return { success: false, error: "terms" };
const acceptance = acceptsNow
  ? { termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION }
  : {};
```

Three consequences, each deliberate:

- **`z.literal(true)` in the schema would have been wrong.** `/setup` is also the
  profile-edit screen; a hard schema gate would break every return visit.
- **A revisit neither re-asks nor re-dates.** Re-asking is friction that produces
  no new record; re-dating would destroy the moment of actual assent.
- **An organization created before the column existed still has to accept.**
  Every existing org has `termsAcceptedAt = null`, and `/setup` is the only place
  that record can be made up. A test pins this case by name.

The form matches: the checkbox renders only when `termsAccepted` is false, so a
returning admin never sees it.

---

## The page

`/[locale]/terms` in `(marketing)`, apex host, **prerendered static on both
locales**, self-canonical with `hreflang`, indexable. Modelled on
`privacy/page.tsx`, with one structural improvement.

### One const drives the table of contents *and* the body

```ts
const SECTIONS = [
  { id: "agreement", party: true },
  { id: "service", table: true, after: true },
  ...
  { id: "use", bullets: true, after: true },
  { id: "voters", boxed: true },
] as const;
```

Nineteen sections rendered from one list, so the TOC and the body cannot drift —
and the optional parts (`bullets`, `after`, the party block, the limits table)
are declared in **code**, not inferred from whether a catalog key happens to
exist. That is what makes the guard below possible in both directions.

### ⚠ The guard is load-bearing, and it is mutation-checked

**next-intl does not throw on a missing key.** It logs `MISSING_MESSAGE`,
renders the **key path**, and the build exits 0. Measured on the privacy page;
re-confirmed here. Without a guard, a liability clause could publish reading
`legal.terms.s.liability.body`.

The reverse direction is worse for a contract: a section present in the catalog
but absent from `SECTIONS` renders **nowhere**, silently — an obligation that
exists in the translation and not on the published page.

So the page compares **both key sets**, then checks each declared field, and
because the route prerenders statically, any divergence **fails the build**:

| Mutation | Result |
|---|---|
| Section removed from the catalog | ✅ caught at build (exit 1) |
| Section added to the catalog only | ✅ caught at build (exit 1) |
| A declared `bullets` list missing | ✅ caught at build (exit 1) |

Catalog restored byte-identical after each.

---

## What the page refuses to claim

As with the privacy policy, the refusals are the most deliberate part.

- **§1 names no party.** Two catalog values are placeholders and a notice at the
  top says the entity is not registered yet. A privacy policy with an unnamed
  controller is a defective notice; **a contract with an unnamed party is not a
  contract**, so this is sharper here.
- **§7 "The election is yours"** draws the line the whole audit story depends on:
  the seal evidences that *the recorded result has not been altered since
  sealing*. It does **not** evidence that the election was properly convened,
  that the electorate was correct, or that the outcome is binding. *Integrity of
  the record* and *legitimacy of the election* are different things and we
  guarantee only the first.
- **§8 payment opens by saying billing is not switched on.** Describing a payment
  relationship that cannot exist would be the document's first false statement.
- **§11 states today's deletion behaviour** — deleting the account destroys every
  election, roster, ballot and sealed archive — rather than the retention version
  nobody has built (spec D4). Writing the kinder version into a contract before
  the code does it is exactly the failure this document exists to avoid.
- **§12 promises sending, not delivery**, and names email deliverability as an
  exclusion, because it is the single dependency most likely to cost an election
  and it is not fully in our control.
- **§13 says out loud that a Free organization's capped surface is €0**, so the
  carve-outs are the entire liability surface. Flagged for the lawyer rather than
  defended.
- **§19 "For voters" is notice, not terms.** A voter is not a party, accepts
  nothing, and must never be asked to — a consent gate between a voter and a
  two-minute ballot is coercive in the one place coercion matters most, and buys
  an "agreement" worth nothing while costing turnout.

---

## Deviations kept from the generic framework

Recorded so nobody "fixes" them back. Full reasoning in spec §19.

| Generic guidance | Here | Why |
|---|---|---|
| AI disclaimer sections are **mandatory** | **Four sections dropped** | No AI feature, no AI subprocessor. The only AI line kept is the prohibition: we do not train on customer data. |
| An all-caps `AS IS` block | Substance kept, **capitals dropped**, exclusions made specific | The all-caps form is a US conspicuousness artifact (UCC §2-316). Croatian law reviews standard terms for *fairness* and does not bind surprising clauses that were not drawn to attention — a wall of capitals argues against us. |
| Cap at "USD $100" | **Fees paid in the preceding twelve months**, quoted verbatim, carve-outs enumerated | A dollar figure in a EUR contract, and the number is the least important part of a cap. |
| "**Always** include a DMCA contact" | **No DMCA.** A DSA-shaped notice-and-action clause instead | A Croatian operator serving EU organizations. A designated agent registered with the US Copyright Office is cargo-cult compliance. |
| "No accounts (if applicable)" | **Inverted and kept** | Admins hold accounts; **voters never do**. It is the hinge of the whole document. |
| Canonicalise translations to the primary language | **Self-canonical + `hreflang`** | The Croatian text is legally operative; canonicalising it to English de-indexes the version that governs. |

**Adopted, with a required addition:** "continued use constitutes acceptance" —
correct for a contract, and correctly *refused* by the privacy policy, which is a
notice. Shipped alone it is the clause a purchasing-side reviewer flags first, so
§17 wraps it in three commitments: advance notice by email, continued use is
acceptance, and **cancel before it takes effect and it does not bind you**.

---

## Files

**New** — `src/app/[locale]/(marketing)/terms/page.tsx` ·
`src/lib/legal.ts` (`TERMS_VERSION`) · `src/actions/setup.test.ts` ·
`prisma/migrations/20260912155245_add_organization_terms_acceptance/`

**Changed** — `prisma/schema.prisma` · `src/actions/setup.ts` ·
`(auth)/setup/page.tsx` · `setup-form.tsx` · `signup-form.tsx` ·
`auth-split-layout.tsx` · `dashboard-footer.tsx` · `(marketing)/page.tsx` ·
`src/lib/urls.ts` + `urls.test.ts` · `messages/{hr,en}.json`

Catalogs injected behind the **byte-identical round-trip guard** — the script
refuses to write unless parse then serialise reproduces the file exactly first,
so the diff is 263 lines per catalog instead of the ~2 400-line whole-file
rewrite a stray LF produces. CRLF preserved throughout.

### Link surfaces

Five, as the spec asked, but one reaches further than it asked: `DashboardFooter`
is shared by `/settings`, `/profile` and `/elections`. Worth noting because **the
app had no link to either legal document anywhere after sign-in** — they existed
only on marketing and auth screens an admin stops seeing.

`termsUrl()` is **absolute and points at the apex**, for the reason already
written at `privacyUrl()`: a relative `/terms` from the dashboard host 307s to
`/login`, and the route **cannot** be added to `PUBLIC_AUTH_PATHS` to fix that,
because that list is spread into `DASHBOARD_ONLY_PATHS` — listing it would make
the apex redirect its own page away. One line of coupling, invisible unless you
read both lists, so a mutation-checked test pins it.

`SUPPORT_EMAIL` is separate from `CONTACT_EMAIL` on purpose: the latter is the
legal and audit address (the PDF report, the archive audit modal and the Terms'
notice-and-action clause all print it), and a report of unlawful content should
not share an inbox with "how do I import a roster".

---

## Verification

| Gate | Result |
|---|---|
| `tsc --noEmit` · `eslint` | 0 errors (7 pre-existing warnings, none in touched files) |
| `vitest` | **801 passing, 44 files** (from 796 / 43) |
| `next build` | clean; `● /hr/terms` + `● /en/terms`; `/hr` and `/en` still prerendered — **no Gate 13 regression** |
| Mutations | 4/4 caught by **named** tests, after a green control run |
| Catalog guard | 3/3 caught **at build** |
| Browser, hr + en | 1 `h1`, 19 TOC anchors all resolve, **0** `href="#"`, table captioned + `th[scope]`, no sideways scroll at 390px, `/en` free of Croatian, **0 console errors** |

**Live, against the dev branch**, on a throwaway org-less admin (the seeded demo
password has drifted from the DB — recorded 2026-08-08, still true):

- every field filled and **no tick → Continue still disabled**, which is the gate
- tick → submit → `termsAcceptedAt: 2026-09-12T16:05:46.440Z`,
  `termsVersion: "2026-09-12"` in the database
- revisit → **checkbox absent**, form prefilled, Continue enabled
- the auth footer on `dashboard.localhost` links Terms at `localhost:3000/terms`
  — the apex — which is the coupling `termsUrl()` exists for
- signup: **0 checkboxes**, privacy notice retained, both documents linked

Fixture destroyed; dev DB confirmed clean (2 orgs · 2 users · 0 fixture rows ·
0 acceptance rows).

| Mutation | Caught by |
|---|---|
| Acceptance never required | *odbija prvo postavljanje bez kvačice…* + the pre-existing-org test |
| Version not recorded | *…s vremenom I inačicom pristanka* + the same |
| Revisit re-dates acceptance | *…niti ga predatira* |
| `termsUrl()` to the dashboard host | *points the terms at the APEX too…* |

---

## What this does **not** fix

The page exists. It is **not publishable**, and it says so at the top.

- **No legal entity to be a party.** Blocks publication, not drafting.
- **No Art. 28(3) DPA** for voter data — the document we owe customer
  organizations, and the largest legal gap in the product.
- **No enforcement mechanism.** §5 and §11 reserve rights exercisable only by
  hand-written SQL — no `banned` column, no role model, no back office — which is
  why they are written as reserved rights with **no promised process**.
- **The consumer withdrawal waiver** is not implemented at Stripe checkout.
  Blocks `BILLING_ENABLED=true`.
- **The marketing claims still contradict it.** The homepage says **"END-TO-END
  VERIFIABLE VOTING"** while `merkleProof`/`verifyMerkleProof` have zero callers
  outside the service. Decided (to "tamper-evident") and scoped to its own
  branch; the Terms cannot publish before it lands. The sweep is **12 strings
  across two locales**, not the spec's five.
- **No qualified Croatian lawyer has read §12, §13 or §16**, and every regulatory
  citation in the spec is AI-produced and marked unverified.

## Carry-forward

- Croatian is the **operative** text — change both locales or neither.
- Bump `TERMS_VERSION` for any change of obligation, never for a typo.
- Adding a subprocessor means editing the **privacy** page; §10 links it rather
  than restating the list, so the two cannot drift.
- A new section means adding it to `SECTIONS` **and** both catalogs — the build
  refuses either half alone, in both directions.
