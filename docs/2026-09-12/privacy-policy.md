# Privacy Policy — `/privacy`

**Branch** `feature/privacy-policy` · **Version** 0.9.64 · **Spec**
`context/features/privacy-policy-spec.md`

A public, statically-rendered privacy policy at `/hr/privacy` and `/en/privacy`,
plus the three places that link to it and the consent defect that linking it
exposed. No migration, no new dependency, no server action, no schema change.

---

## Why this shipped now

Not "the site should have a privacy policy". Three concrete defects:

1. **The app collected consent for a document that did not exist.**
   `signup-form.tsx` made the terms checkbox a hard zod gate
   (`z.literal(true)`), the label read *"I agree to the Terms of service and
   Privacy policy"*, and **both links were `href="#"`**. Every admin who signed
   up agreed to a policy the product did not publish.
2. **Google OAuth caps an app with no privacy policy URL at 100 users** and shows
   an "unverified app" warning. Electius already ships Google sign-in, so this
   was a live ceiling on sign-ups, not a future dependency.
3. **Four dead `href="#"` links** across the signup form and the auth chrome.

All three are closed. **Publication is still blocked** — see *What this does not
fix*.

---

## What was built

| Area | Change |
|---|---|
| Page | `src/app/[locale]/(marketing)/privacy/page.tsx` — 15 sections, apex host, static |
| Copy | New `legal.privacy` namespace in `messages/{hr,en}.json` (~380 lines each) |
| URL helper | `privacyUrl()` in `src/lib/urls.ts` + a mutation-checked test |
| Marketing footer | The trust column's *Privacy* entry becomes the column's one real link |
| Auth chrome | `auth-split-layout.tsx` — privacy links cross-host; **Terms stays plain text** |
| Signup | Consent checkbox split (below); privacy linked outside the gate |
| Settings | One link in the Data export card, beside the other GDPR controls |

### The page

Route: `/[locale]/privacy` in the `(marketing)` group. Build output confirms
**`● /hr/privacy` and `● /en/privacy`** — both prerendered static, and `/hr` +
`/en` (the landing) still prerender, so Gate 13 did not regress.

Indexed, unlike every other public page in this product. A legal page is the
artifact Google and Stripe check when approving an app, and the one AZOP would
read. **Canonical is self-referential with `hreflang` to the other locale** — not
the SEO-conventional "canonicalise to the primary language", because the Croatian
text is the legally operative version for Croatian data subjects and
canonicalising it away would de-index it.

All content lives in the catalogs; tables come through `t.raw()`, the same
pattern the marketing pricing table uses. The 15-item table of contents is
rendered from one `SECTIONS` array that also orders the body, so the two cannot
drift apart.

### The consent split — the finding that came from method, not from reading code

The spec's §0.4 was produced by sweeping the **in-product consent surface**
rather than the document, and it is the sharpest item in this branch:

> A privacy policy is **not a thing a data subject agrees to.** It is an Art. 13
> *notice* — a disclosure the controller owes, discharged by being read, not by
> being accepted.

Bundling a notice with a contract into one mandatory tick is the pattern EDPB
Guidelines 05/2020 treat as invalid consent: it is not granular, and it
manufactures a consent record for processing whose real basis is Art. 6(1)(b)
contract. **If the basis is ever challenged, having collected a consent that was
never needed and was never freely given makes the position worse, not better.**

Shipped:

```
☑ I agree to the Terms of service.
   We handle your data as described in our Privacy policy.
```

The zod gate stays — it now gates the one thing it should. The label contains
**zero links** (verified: `linksInsideLabel: 0`), which also keeps the
checkbox's accessible name clean, the same rule this codebase already applies to
the password helper and the org-name helper.

### `privacyUrl()` — and why a relative link does not work

The page lives on the **apex**; most links to it start on the **dashboard host**
(signup, login, settings). A relative `/privacy` from there 307s to `/login`,
because the route is not in `PUBLIC_AUTH_PATHS`.

**And it cannot simply be added to that list.** `PUBLIC_AUTH_PATHS` is spread
into `DASHBOARD_ONLY_PATHS`, so listing `/privacy` there would make the **apex**
307 its own page away to the dashboard host. That coupling is one line and is
invisible unless you read both lists.

So the helper is an absolute cross-host URL, like `marketingHomeUrl()` beside it.
A test pins the host and a mutation (`APEX` → `APP`) fails it by name.

| Request | Result |
|---|---|
| apex `/hr/privacy`, signed out | **200** |
| apex `/en/privacy`, signed out | **200** |
| apex `/privacy` | 307 → `/hr/privacy` |
| dashboard host `/hr/privacy` | 307 → `/hr/login` (why links are absolute) |

### Terms of service stays unlinked, deliberately

Terms is out of scope (its own spec). The marketing footer already carries the
rule in a comment — *a link that goes nowhere is a link that lies* — so the
Terms label renders as plain text in the auth footer and inside the checkbox
label. Verified: 2 spans, 0 links.

---

## What is claimed, and what is deliberately not

Section E states four claims and marks two of them **false about Electius**,
which is the point:

| Claim | Holds |
|---|---|
| We cannot find out **how** anyone voted | **Yes** — `Vote` has no `voterId` and no relation to `Voter`; the join does not exist in the database |
| Record order does not reveal voting order | **Yes** — random `batchOrder`, lexicographic Merkle leaves |
| We do not know **whether** you voted | **No** — `voters.status` flips to VOTED; the organization sees it, and must |
| We do not store your identity at all | **No** — the voter's email is stored; it is how the ballot is delivered |

A policy that overstates a security property is a false statement about the
product, made in writing, to regulators. The two "No" rows are what keep this
document honest, and a browser assertion pins them.

Other places the page refuses to inflate:

- **No AI disclosure block.** The generic framework calls one mandatory;
  Electius has no AI feature and no AI provider touches personal data, so the
  section would describe processing that does not occur.
- **No California/CCPA supplement.** No US entity, no US marketing, no US
  customers — a supplement would describe a compliance posture that does not
  exist.
- **No "continued use constitutes acceptance".** That is a Terms construction.
  Section L says the opposite, explicitly, and Art. 13(3) requires informing the
  data subject *before* further processing for a new purpose.
- **No ISO 27001 / SOC 2 claim**, because there is none — the page says so.
- **No cookie banner.** One strictly-necessary session cookie is the textbook
  ePrivacy exemption, and the voter flow sets **no cookie at all**. ⚠ That
  exemption holds only while there is no analytics: adding Plausible or anything
  like it re-opens this.

Every retention period is a real constant read off the code — OTP 10 minutes,
reset 1 hour, deletion token 24 hours, session 7 days (BetterAuth default, no
override in our config), Free archive payload one calendar year — never "as long
as necessary".

---

## Decisions taken at load

| Decision | Choice |
|---|---|
| Controller identity (**B1**) | **Visible placeholder** + a pre-launch notice at the top of the page. No entity exists; naming one would be the exact class of falsehood the document exists to avoid. Two catalog values finish it. |
| Sealed archives on account deletion (**D4**) | **State today's behaviour**: deletion destroys them. Copy only — no change to `account-deletion.service.ts`. The page also tells you to download the record first. |
| Consent checkbox (**§0.4**) | **Split it.** |
| Terms links | **Plain text** until Terms exists. |

---

## What this does **not** fix

The page cannot discharge these by existing. All five remain open:

| # | Blocker |
|---|---|
| **B1** | No legal entity to name as controller. Blocks *publication*, not drafting. |
| **B2** | **No Art. 28(3) Data Processing Agreement** offered to organizations. A policy is a notice, not a contract. Largest legal gap in the product; needs its own spec and its own document. |
| **B3** | Voters receive no Art. 14 notice. The controller is the organization, but Electius is the only party that knows what it stores — it should supply ready notice text. |
| **B4** | Processor regions unconfirmed for Neon, Vercel, R2 and Upstash. §J currently states the SCC basis honestly and says regions will be listed individually before publication. |
| **B6** | Google OAuth consent screen still needs the live URL and re-submission. |

Also still owed, from the spec's review log: an **Art. 30 records of
processing** register (mandatory — the under-250-employee exemption lifts when
processing is "not occasional", and running elections is the core purpose), and
a **breach runbook**, because §11 commits to Art. 33's 72 hours and a commitment
with no runbook is one that gets missed at 2am.

**And the whole document needs review by a qualified Croatian data-protection
lawyer before it is published.** Regulatory citations in it were written from an
engineering spec, not verified against primary sources.

---

## Verification

- `npx tsc --noEmit` clean · `npm run lint` 0 errors (7 pre-existing warnings,
  none in touched files) · **`npm run test` 796 passing, 43 files** (+1)
- `npm run build` clean; prerender manifest = `/hr`, `/en`, `/hr/privacy`,
  `/en/privacy`
- **Mutation-checked**: `privacyUrl()` pointing at `APP` instead of `APEX` fails
  exactly one named test. The mutation script asserts the search string was
  found before writing — a mutation that silently fails to apply looks identical
  to one no test catches, and this repo has hit that twice.
- Browser pass against `next start` (production build, not dev), hr + en:

| Assertion | Result |
|---|---|
| Exactly one `h1`, no skipped heading levels | ✅ 1, no skips |
| All 15 TOC anchors resolve to a real section | ✅ 0 dead |
| `href="#"` anywhere on the page or signup | ✅ 0 (was 4) |
| Tables carry `<caption>` and `th[scope]` | ✅ 8 / 8, 0 unscoped |
| Ballot table's two "No" rows are the two the spec forbids claiming | ✅ exact |
| No horizontal page scroll at 390px (tables scroll in their own container) | ✅ `scrollWidth === clientWidth`, all wrappers `overflow-x: auto` |
| `/en` fully English | ✅ 0 Croatian diacritics in `main` |
| Section L denies rather than asserts acceptance | ✅ |
| Console errors | 0 (3 font-preload warnings; 1 known zod/CSP eval notice on the dashboard host, pre-existing) |

Catalogs were injected behind the **byte-identical round-trip guard** — the
script aborts before writing unless `parse → serialise` reproduces each file
byte for byte, CRLF included. Result: a 381-line diff per catalog instead of the
~2400-line whole-file rewrite a stray LF produces.

---

## PR review — three findings, all taken

PR #9's automated review raised three MEDIUMs. All were real; all were fixed on
the branch.

**1 · `LandingNav` carried a dead anchor onto this page.** The nav's section
links are bare fragments (`#how`, `#contact`) that only resolve on the landing.
On `/privacy` there is no `id="how"`, so *"Kako funkcionira"* did nothing — and
`#contact` resolved to *this page's* §M Kontakt rather than the section its label
promises. The same diff enforces "a link that goes nowhere is a link that lies"
twice (the footer trust column, and the reason the full landing footer was **not**
reused here), so the nav got the opposite treatment by accident.

Fixed by making the nav cross-page aware rather than by hiding the links:
`LandingNav` takes `sectionsOnHome` (default `false`), and when set renders the
section links through `@/i18n/navigation`'s `Link` as `/hr#how`. Verified: the
privacy page now has **zero bare fragments and zero dead anchors**, and the
landing is unchanged — still `#how` / `#contact`, still resolving in-page, so
the default is a genuine no-op there.

**2 · The `"yes"` / `"no"` verdict sentinel lived in the catalogs.** It sat two
lines from `"yes": "Da"` — the display label — in a file whose whole contract is
*translate the strings*. A translator localizing `"yes"` → `"da"` would break
`verdict === "yes"`, and §E's **first** claim would publish as:

> Ne možemo saznati kako je netko glasao. — **Ne**

The page would then state that Electius *can* find out how someone voted, in the
one section the surrounding comments call the product's central promise. No type
error, no test failure, no build failure — the tuple is still `[string, string,
string]`. It ships.

Fixed by moving the verdicts into code as `BALLOT_HOLDS = [true, true, false,
false]` beside `SECTIONS`; catalog rows narrow to `[claim, why]` and
`legal.privacy` loses its only untranslatable string. A build-time length check
guards the pairing, and **it was mutation-checked**: dropping one element fails
the build with `legal.privacy.s.ballot.rows ima 4 redaka, a BALLOT_HOLDS 3`. An
assertion nobody has watched fire is not a guard.

**3 · Defect #1 was half-closed, not closed.** The zod gate on the Terms
checkbox still gates an unpublished document — what changed is that this is no
longer *also* true of the privacy policy. Kept the gate deliberately (it is
assent to a contractual relationship, and the acceptance record is worth having
from day one) and marked it: the comment now says the gate outlives the page and
is to be revisited with the Terms spec, not before.

---

## PR review round 2 — three more, all taken

**4 · De-linking Terms dropped it below WCAG AA — a regression I introduced.**
`muted` used `text-neutral-400` (2.5:1 on white) and `text-white/45` (3.7:1 on
`brand-900`); at 13px the bar is 4.5:1. Both variants ship on `/login` and
`/signup`, and `globals.css` only repairs `neutral-400` under the high-contrast
preference, which a signed-out visitor never has. The codebase's own token
comment calls it *"rezervirani tekst: pao je AA"* — and the name of a legal
document you are asking someone to tick a box about is not placeholder text.

`muted` now points at the same inks as `link`; non-interactivity is carried by
the absent underline and cursor, which is where it belonged. **Measured in the
browser after the fix: 7.56:1 light, 5.86:1 dark** — identical to the links
beside them.

**5 · The round-1 guard checked arity, but the pairing was by index.** Inserting
a claim at position 1 and appending `true` keeps the lengths equal and publishes
the round-1 sentence through a different door. Verdicts are now **keyed**
(`BALLOT_CLAIMS` as `{how, order, whether, identity}`) and the catalog's `rows`
array became a `claims` object, so the catalog can be reordered freely — the
same shape `SECTIONS` above already uses.

⚠ Worth knowing: the natural claim here — *"a missing key fails the build"* — is
**false**, and I nearly wrote it. Measured: next-intl logs `MISSING_MESSAGE` and
renders the key path, and the build **exits 0**, so the page would ship a table
cell reading `legal.privacy.s.ballot.claims.how.claim`. So the guard compares
**both key sets** explicitly. Mutation-checked in both directions:

| Mutation | Before | Now |
|---|---|---|
| Reorder the catalog | wrong verdict, silent | no-op ✅ |
| Remove a key | build exit 0, key path rendered | **build fails by name** |
| Add a fifth claim to the catalog only | never rendered, silent | **build fails by name** |

**6 · `sectionsOnHome` was named backwards.** Both call sites agree the sections
live on home, yet passed opposite values — on a nav whose whole fix was that a
link should not say one thing and do another. Renamed `sectionsElsewhere`, which
is true exactly when the current page is not the one holding the sections. The
unreachable `= {}` props default went with it.

---

## Notes for whoever touches this next

- **Croatian is the operative text.** If the two versions drift, the Croatian one
  is what a Croatian data subject and AZOP read. Change both or neither.
- **Adding a subprocessor means editing this page** — Art. 28(2), and the page
  commits to it in writing.
- **Never enable Resend click tracking.** It rewrites the `href` that *is* the
  raw magic-link token. The page states this as a promise.
- **Adding any analytics re-opens the cookie-banner decision** and falsifies
  three lines of §2.3 and §F.
- **Re-read the session duration on every `better-auth` bump.** 7 days is that
  library's default with no override in our config; the page publishes the
  number.
