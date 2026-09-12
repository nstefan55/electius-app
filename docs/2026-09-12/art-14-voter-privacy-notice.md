# Art. 14 voter privacy notice (and the end of the invented Proof section)

Branch `feature/voter-privacy-notice` · v0.9.72 · 2026-09-12

Two boxes from `mvp-launch.md` §2, shipped together because one of them was a deletion. No
migration, no new dependency, no new server action, one new route.

---

## Findings, first

1. **`/privacy` had already taken a position, and it was the wrong one to leave standing.** §voters
   said Art. 14 is the organization's duty and ended *"she must give it to you"* — legally correct
   and practically empty. No organization writes that notice. The box existed because the voter got
   nothing.
2. **The notice has to travel in the invitation, not sit on a website.** Art. 14(3)(b) ties the
   deadline to the *first communication with the data subject*. That is the ballot email.
3. **The invitation named the controller but gave no way to reach it.** Art. 14(1)(a) wants identity
   *and* contact details; `Organization.contactEmail` existed and had never been sent to a voter.
4. **A required field is a better reviewer than a reviewer.** Making
   `InvitationElection.organizationEmail` required turned "did I update every construction site?"
   into five compile errors, all in `publication.service.ts` and `actions/voters.ts`.
5. **The Proof section had been commented out for five weeks against a day that never came.** A
   commented-out falsehood is one keystroke from publication. Deleted.

---

## What shipped

### The notice — `/hr/privacy/voters` and `/en/privacy/voters`

The app's fourth and fifth indexable pages, both `●` statically prerendered, self-canonical with
`hreflang` to the other locale (same reasoning as `/privacy` and `/terms`: the Croatian text is the
operative one, so canonicalising it away would de-index the version AZOP reads).

Ten sections, built on the `/terms` machinery: one `SECTIONS` const draws both the table of contents
and the body, so the two cannot drift, and a build-time guard compares the catalog's key set against
it **in both directions**. That guard is load-bearing rather than decorative — next-intl does not
throw on a missing key, it logs `MISSING_MESSAGE` and renders the **key path**, so without it a
clause could publish reading `legal.voterNotice.s.rights.body`. The reverse is worse for a notice
whose whole point is completeness: a section present only in the catalog renders **nowhere**,
silently. The page prerenders, so either failure breaks the **build**.

Section order is deliberate. `source` ("where we got your address") opens, because it is the
Art. 14-specific item and the first thing a voter actually wants to know; `who` follows, because
every request on the rest of the page is routed by it.

**What the page refuses to claim** matters as much as what it claims:

- It does not state the legal basis, because the *controller* determines it and the controller
  varies per election. It says so, and says only they can tell you.
- §secrecy repeats `/privacy`'s honest split: how you voted is unknowable, **that** you voted is
  visible and has to be.
- The retention figures are the real values in the system, not "as long as necessary".
- Cloudflare R2, Stripe and Google are **absent** from the recipients list — none of them is in the
  voter path (R2 holds PDF reports and images, which carry tallies and never voter identities).

### Delivery

`voterNoticeUrl(locale)` in `urls.ts` — apex, like its two siblings, but the **only one with a
locale prefix**. Not an inconsistency: the template that prints it has already chosen a language,
and an unprefixed URL 307s an English voter into Croatian legal text. Links *inside* the apex (the
`/privacy` pointer, the voter chrome) use the relative i18n `Link`, where the host is provably the
same. Pinned by a mutation-checked test.

`sendBallotLinkEmails` gained three variables: `NOTICE_URL`, and the pair `ORG_EMAIL` /
`ORG_EMAIL_HTML`. The pair is the house rule for any admin-controlled value, and it earns its keep
here specifically — the address renders inside `href="mailto:…"`, an attribute context where a
quote closes the attribute. Zod validates the shape at `/setup`; shape validation is not output
escaping.

All four voter-facing Resend templates (invite + reminder, hr + en) were edited and re-published.

### The voter chrome

`(voter)/layout.tsx` gained a one-line footer link. A deliberate deviation from design-system §8.2,
which draws no footer — Art. 12(1) wants the notice *easily accessible*, and a voter who deleted
the invitation otherwise has no path to it.

The layout now takes `params`, calls `setRequestLocale` and passes an **explicit** locale to
`getTranslations`. That is not style. This layout renders in the tree of `/results/[id]`, the only
ISR route in the app, where a header read is fatal (`DYNAMIC_SERVER_USAGE`, HTTP 500 on every
request, on a public page). Read from the installed source rather than assumed:
`getConfig(locale)` builds `{ locale, get requestLocale() { return locale ? Promise.resolve(locale)
: getRequestLocale() } }` — with an explicit locale the header read is never reached.

`static-route-boundaries.test.ts` gained a matching guard: any `layout.tsx` in that tree which
imports `next-intl/server` must call `setRequestLocale` and must pass `locale` in every
`getTranslations` call. Layouts were outside the old rule because they *can* receive params — but
only if they actually use them, and the difference is one omitted argument.

### The deletion

The commented-out Proof block in `(marketing)/page.tsx` (60 lines) and `marketing.placeholder.*`
in both catalogs (40 lines each). The `stats` / `quotes` / `quoteTints` variables had already gone.
`future-updates-spec.md`'s entry is closed as option 3.

---

## Verification

| What | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npm run lint` | 0 errors (7 pre-existing `window.location.assign` warnings, none in touched files) |
| `npm run test` | **828 passing / 46 files** (from 822 / 46) |
| `npm run build` | clean; `● /hr/privacy/voters` + `● /en/privacy/voters` |
| Prerender manifest | `/hr`, `/en`, both `/privacy`, both `/terms` still static — no Gate 13 regression; `/[locale]/results/[id]` still registered with `compute: "blocking"` |
| Browser, hr + en | one `h1`, no skipped levels, 10 TOC anchors all resolving, **0** `href="#"`, self-canonical + both `hreflang`, indexable, **0 console errors** |
| 390 px | `scrollWidth - clientWidth = 0`, no element past the viewport |
| Contrast | body and TOC ordinal both `rgb(75,85,99)` = `neutral-600`, 5.9:1 on white; no `neutral-400` text on the page |
| `/en` | no Croatian leftovers, no key-path leak |
| Voter chrome | footer link `/hr/privacy/voters`, below the card, `document.cookie` still **empty** |
| `/privacy` §voters | contradicting sentence gone, link renders, TOC entry intact |
| Marketing home | zero fabricated strings, sections either side render, no overflow |
| **Live send** | `delivered@resend.dev`, both senders: hr invite → `mailto:izbori@example.org` + `…/hr/privacy/voters`; en reminder → `…/en/privacy/voters`. No unrendered `{{{VAR}}}` in either part |

### Not verified — stated, not implied

- **The ISR route's runtime behaviour was not re-observed.** The only decisive check is
  `x-nextjs-cache` under `next start`, and a local production start loads `.env.production` and
  therefore talks to the **production database** (recorded 2026-09-12). The risk is closed by the
  next-intl source read above plus the new test, not by a request.
- **Cross-client rendering of the four templates** — read back from Resend's stored HTML and text,
  not opened in Outlook.
- No `purchased` entitlement path exists to exercise.

---

## Carry-forward

- ⚠ **The DPA must record that Electius publishes the voter notice on the controller's behalf.**
  Until it does, Electius is publishing on behalf of controllers who have not appointed it —
  harmless in effect, unpapered in fact. `mvp-launch.md` §2 carries the box.
- A change to what the product holds about a voter, to a retention period, or to the subprocessor
  list means **editing this page**, not only `/privacy`.
- Croatian is the operative text: change both locales or neither.
- A template copy edit is not live until the template is **re-published**.
- The four voter templates now carry 8–9 variables each. `update-template` **replaces** the variable
  array, so pass all of them.

---

## Traps hit

- **The ~9 KB heredoc ceiling**, twice — a `cat > file <<'EOF'` of the Croatian catalog was
  truncated mid-string and surfaced as `unexpected EOF while looking for matching '`, which reads
  like a quoting bug. Use the file tool for anything that size.
- **Double-encoded UTF-8**: `"…\xe2\x80\x94…".encode('utf-8')` in Python encodes *twice*. Write the
  text to a file as UTF-8 and read it as bytes instead.
- **`cat > /tmp/none` with no stdin hangs forever** and took a command into the background.
- **Substring matching across indentation levels**: `b'    organizationName:'` also matches inside
  `b'      organizationName:'`, so a count assertion read 4 where 3 was meant. Anchor on whole lines.
- The security hook still false-positives on a literal `RegExp.prototype.exec` call; `String.match`
  clears it.
- Playwright's Firefox needed its stray processes killed and `%LOCALAPPDATA%\ms-playwright-mcp`
  cleared before it would launch.
