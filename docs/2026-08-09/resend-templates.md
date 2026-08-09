# Resend Templates — Phase 2 of the email delivery work

**Branch** `feature/resend-templates` · **Version** 0.9.25 → **0.9.26** (patch, one per phase)
**Spec** `context/features/email-delivery-and-admin-turnout-spec.md` §Phase 2
**Follows** phase 1 (v0.9.25, `docs/2026-08-09/resend-transport.md`)

Email copy stops being code. All five emails now live as **published Resend templates**
referenced by a stable alias, so a copy fix is a dashboard edit — no code change, no deploy,
no version bump. That was finding **2.2**: "all five emails are string-concatenated HTML
inside a `server-only` module."

**No migration, no new route, no new dependency, no schema change.**

---

## Findings index

| # | Finding | Where |
| --- | --- | --- |
| F1 | **Triple-brace does not escape** — proven by sending, not assumed. An admin-controlled election title reaches the voter's inbox as live markup unless escaped first | §2 |
| F2 | **One template serves subject + text + HTML from one variable set**, so a single `{{{TITLE}}}` cannot be both raw and escaped. Solved with a raw/escaped **pair** | §2 |
| F3 | **Subject and text DO interpolate variables** — so the invite/reminder subjects keep the election title and the catalogs could be retired in full | §2 |
| F4 | **TipTap cannot express this design** — forbids custom `font-family` and sub-14px text, and has no node for the OTP block. Settles raw-HTML authoring by evidence | §1 |
| F5 | The OTP "no link" test was a **naive substring check**; `<meta http-equiv>` contains `http`. False positive, caught live, assertion tightened — the property itself holds | §5 |
| F6 | Re-running verification **accidentally proved idempotency**: the 8 batch messages were suppressed as duplicates while the 6 auth messages went through, exactly as designed | §5 |
| F7 | `ChainableTemplateResult.publish()` is **lost once you `await`** the thenable — it resolves to the plain response | §3 |
| F8 | Deviation: templates created by a recorded **SDK script**, not ten MCP calls, to keep the shared shell from drifting. Verified and inspected through MCP | §3 |

---

## 1. The decision that was NOT a coin flip

Spec §5.2's copy-ownership question (option **A** — copy in Resend, locale in the alias) was
already answered by the user at phase 1's `start`. What remained was *how* the template content
is authored: Resend's MCP offers **raw HTML** (`update-template`) or **TipTap**
(`compose-template`, which the tooling calls "recommended" because it is visually editable in
the dashboard). Switching between them is explicitly lossy, so it is worth getting right once.

Rather than guess, a throwaway template was created and its TipTap schema fetched. TipTap
forbids exactly what this design is made of:

- **"NO custom `font-family` definitions"** → the Poppins / Noto Sans / Roboto Mono stack is
  unexpressible
- **"NO font sizes below 14px"**, and typography locked to *exactly* 14 → the 12px fallback-URL
  and expiry lines cannot survive
- No node expresses the OTP code block (`Roboto Mono`, 32px, `letter-spacing:8px`). `codeBlock`
  is a syntax-highlighting block, not that. The `htmlContent` escape hatch exists, but using it
  forfeits the visual editing that was TipTap's only advantage

`design-system-spec.md` is the source of truth for design, so TipTap would have violated it.
Spec §2.2 had already implied the answer — "table-based layout, inline styles only, explicit
`width`/`height`" is a description of raw email HTML. **Raw HTML.**

The probe was then repurposed into `electius-otp-hr` rather than deleted, so no scratch was
left in the account.

> D2's actual payoff survives intact: copy is edited in the Resend dashboard with no deploy.
> It is edited as HTML rather than visually — which, for a template whose fidelity is the point,
> is the correct trade.

---

## 2. The escaping problem this phase creates — and how it is solved

This is the part worth reading before touching `email.service.ts` again.

**Before:** the code rendered two bodies itself and passed *escaped* values into the HTML while
leaving subject and plain text *raw*. Two renderings, two values, no conflict.

**After:** a template holds subject, HTML and text, and Resend fills all three **from one
variable set**. So `{{{TITLE}}}` cannot be raw and escaped at the same time:

- pass it **escaped** → the plain-text part shows `Izbori &lt;b&gt;2026&lt;/b&gt;` literally
- pass it **raw** → an admin-controlled election title injects live markup into a voter's inbox

Three facts had to be established before designing around this, and all three were established
**by sending a real email and reading it back**, not from documentation:

| Question | Answer |
| --- | --- |
| Does the subject interpolate variables? | **Yes** — `SUBJ[O'Brien & <b>Co</b> "quoted"]` |
| Does the plain-text part interpolate? | **Yes** |
| Does `{{{triple-brace}}}` escape? | **No** — the raw `<b>` arrived intact in the HTML |

The subject answer is load-bearing: had it been *no*, the invite and reminder subjects (which
carry `{title}`) would have had to stay in the catalogs, and 2.5 could not have been completed.

**The rule that shipped:** any value under **admin control** travels as a pair — `TITLE` /
`TITLE_HTML`, `ORG` / `ORG_HTML`. The template uses the raw one in subject and text and the
escaped one in the HTML body. `escapeHtml()` stays in the code (§5.3), it just feeds a variable
now instead of a string concatenation.

`CLOSES` deliberately has **no** twin: it is the output of our own `formatVotingDateTime`
(Intl), not admin text, and contains nothing to escape. The rule is "admin-controlled gets a
twin", not "everything gets a twin", and the code says so at the call site.

---

## 3. How the ten templates were authored

Five emails × two locales, locale in the alias:

```
electius-otp-hr             electius-otp-en
electius-reset-hr           electius-reset-en
electius-delete-account-hr  electius-delete-account-en
electius-voter-invite-hr    electius-voter-invite-en
electius-voter-reminder-hr  electius-voter-reminder-en
```

**Deviation from D7, stated plainly (F8).** D7 chose MCP over the SDK. The templates were
instead created by a **recorded throwaway script**, then verified and inspected through MCP.
Two reasons: the four action emails must share one shell byte-for-byte (the drift §2.2 warns
about — "port deliberately; do not paste the current string"), and hand-authoring eight
near-identical 2.5 KB HTML blobs through separate tool calls is precisely how that drift starts.
D7's stated objection was to the *dashboard by hand*, "because nothing then records what was
created"; a script records it more completely than ten calls do. The templates are identical in
Resend either way.

**The copy was read straight from `messages/{hr,en}.json` by the generator**, so the port could
not introduce a transcription error — the ported text is the shipped text by construction.

Structure: one `shell()` builder, one `actionHtml()` shared by four emails (mirroring what
`actionEmailHtml` did in code), and a separate `otpHtml()` because the code *is* the content.
Email-HTML rules followed as required: `<!DOCTYPE>`, table-based layout, inline styles only, no
CSS shorthand, `bgcolor` beside `background-color` for Outlook, web-safe font fallbacks.

Design ported faithfully — 480px column, `#1F2937` heading, `#1D4ED8` CTA, `#4B5563` secondary,
`#F3F4F6` OTP block. **No card/grey-page treatment was invented**: the current email has none,
and §2.2 says the current HTML *is* the design.

**F7:** `resend.templates.create()` returns a `ChainableTemplateResult` whose `.publish()`
disappears the moment you `await` it — awaiting resolves the thenable to the plain response.
Publish by id instead. A draft template is **not sendable**, so this is not a cosmetic detail.
The loop was then made an upsert keyed on alias, which is also what makes the script re-runnable.

---

## 4. What changed in the code

| File | Change |
| --- | --- |
| `src/lib/services/email.service.ts` | Senders switch to `template: { id: alias, variables }`. `actionEmailHtml` · `otpEmailHtml` · `actionEmailText` · `sendActionEmail` · `ActionEmailCopy` · `OtpEmailCopy` · `fill()` all deleted. **Both catalog imports gone.** New `TEMPLATE` map + `templateId()` |
| `src/lib/services/email.service.test.ts` | Copy assertions become alias + variable assertions; +3 net (16 → 19) |
| `messages/hr.json` · `messages/en.json` | Five email blocks retired, −39 lines each |

`Locale` now comes from `@/i18n/config` instead of being derived from the catalog imports —
one fewer definition of the same union, and the catalogs are no longer imported at all.

**Phase 1's transport is untouched**: one `send()`/`sendBatch()`, the tags, the token-derived
idempotency key, and `sender()` throwing rather than falling back to a sandbox domain.

**`turnout` is deliberately absent from the `TEMPLATE` map.** It is a member of `EmailType`
but the map is typed `Record<Exclude<EmailType, "turnout">, string>`, so phase 3 gets a
*compile error* until it adds both the template and the entry — rather than a runtime send to
an alias Resend does not know.

---

## 5. Verification

`npm run lint` · `npx tsc --noEmit` · `npm run build` all clean.
`npm run test` — **580 passing** (from 577; the email file went 16 → 19).

Unit tests can no longer assert on rendered copy, because there is none in the payload. Two
assertions actually got **stronger**:

- the escaping test now pins the **pair** (`TITLE` raw *and* `TITLE_HTML` escaped) rather than
  inspecting a concatenated string
- a new test pins **locale → alias**, which is now the only thing selecting the language of a
  message. A wrong alias is silently the wrong language in someone's inbox

The OTP "no link" guarantee moved into the template, where a unit test cannot see it. The
code-side half is still pinned — `CODE` is asserted to be the *only* variable, so a URL is not
expressible — and the template half is covered live below.

### Live, against the real Resend account

A script called the **real senders** (not reconstructed payloads), then read every message back
and compared it against the original catalog copy taken from `git HEAD` — so this checks the
port did not lose or alter a word, not merely that something rendered.

**40 assertions, 40 passed**, across both locales:

- subject, body and expiry copy identical to the pre-migration catalogs
- OTP: code in both parts, and **no anchor, no `href`, no URL scheme** anywhere
- invite + reminder: subject carries the **raw** title, HTML carries the **escaped** one, plain
  text raw — F1/F2 confirmed end to end
- **`batch.send` with a template** — the least-travelled corner of the API, and the one carrying
  the magic links — with **each recipient receiving their own link** from their own variables
- no unrendered `{{{VAR}}}` left in any body; the reminder's closing date rendered

**F5 — the one failure, and why it was not a defect.** The OTP link check failed in both
locales. The cause was the assertion: `<meta http-equiv="X-UA-Compatible">` contains the
substring `http`, and the old markup was a bare `<div>` with no `<head>`, so a naive
`includes("http")` was safe before and is not now. Confirmed by dumping every match — anchors
came back `null`, the text part had no URL. Assertion tightened to anchor / `href` / URL scheme.
Worth recording because the naive check would have passed forever on a template that *did*
grow a link.

**F6 — idempotency proved itself by accident.** The corrected run reported only 6 of 14
messages. The missing 8 were the batch sends, reusing the same tokens and therefore the same
`invite:`/`reminder:` key, and Resend suppressed them as duplicates inside its 24 h window. The
6 that went through were the auth emails, which deliberately carry **no** key because a resend
there is a request for a *new* message. Both designed behaviours, observed rather than argued.
Re-run with fresh tokens: 40/40.

### Tracking

`electius.com` re-read **before and after** all template work: **Open Tracking `false`, Click
Tracking `false`** (§8 asks for both readings; the spec's own R12 flagged the previous reading
as stale). This is not housekeeping — click tracking rewrites every `href`, and the invitation's
href **is** the raw magic-link token, so enabling it would push single-use voting tokens into a
third party's click logs against invariant #2.

---

## 6. Ceilings and handover

- **Every outbound email is still Croatian.** No caller passes a locale (2.5). The `-en`
  templates were authored anyway, because 2.5 retires the `en` catalog blocks and that copy
  would otherwise only exist in git history. Threading is **phase 4**; the templates are ready
  for it.
- **The templates are now a launch-review surface.** Ten of them must be read before
  `BILLING_ENABLED=true`, the same way the marketing Proof section is tracked. Copy no longer
  passes through code review because it no longer passes through code.
- **A copy edit needs re-publishing.** Editing a published template does not make the change
  live until `publish-template` runs again.
- **Unchanged from phase 1:** `RESEND_FROM_EMAIL` and `RESEND_WEBHOOK_SECRET` must be set in
  Vercel. The app cannot detect either. Without the sender every send now *throws* instead of
  silently using a sandbox domain — which is the improvement, but it is a hard dependency.
- Rendered emails were verified by reading the API's stored HTML/text, **not** by opening them
  in a mail client. Cross-client rendering (Outlook in particular) is unverified.

---

## 7. Next

**Phase 3 — admin turnout emails.** It now inherits a template-shaped world: the turnout email
is *born* as `electius-admin-turnout-{hr,en}` instead of being written inline and migrated
later, which is exactly why D1 ordered 1 → 2 → 3. Phase 3 must add the `TEMPLATE` map entry
(the `Exclude<EmailType, "turnout">` will not compile until it does), the `adminTurnoutNotifiedPct`
migration, `turnoutMilestoneDue`, the sweep's fifth pass, `canUseAdminTurnout` (D8), and the
Resend **topic** for opt-out — the one email of the six that gets one, since the other five are
transactional and must never be unsubscribable (§3.2).
