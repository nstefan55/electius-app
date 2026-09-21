# Gitleaks canary allowlist — the Sentry-scrub fixtures

**Branch:** `fix/gitleaks-canary-allowlist` · **Version:** 0.9.80 · **Date:** 2026-09-21
**Closes:** the red `secret-scan` job on the weekly scheduled CI run.

---

## What was wrong

The Monday full-history scan failed with two findings, both in one test file:

```
RuleID:   generic-api-key
File:     src/lib/sentry-scrub.test.ts
Line:     103, 104
Entropy:  3.773557
```

Both are **false positives**. The flagged string is `RAWT0KEN_canary` — the fixture in the test
asserting that a raw voting token never survives Sentry scrubbing:

```ts
const event = scrubEvent({
  request: {
    url: "/hr/vote/RAWT0KEN_canary?token=RAWT0KEN_canary",
    data: { token: "RAWT0KEN_canary" },
    ...
```

Nothing is leaked. The zero in `RAWT0KEN` is deliberate: the string is unmistakably a fixture.

### Why only 2 of its 10 occurrences fired

`generic-api-key` is not a "looks random" detector. It needs **both**:

1. a keyword (`token`, `key`, `secret`, …) immediately before the separator, and
2. a captured value of **>= 10 characters** with high entropy.

That explains the whole file at a glance:

| Occurrence | Outcome |
| --- | --- |
| `token: "RAWT0KEN_canary"` (lines 103, 104) | keyword + 15 chars -> **fires** |
| `"RAWT0KEN"` (61, 88) | 8 chars, under the minimum |
| `"/hr/vote/RAWT0KEN_abc123"` (11, 16) | higher entropy, but no keyword |
| `cookies: { s: ... }`, `headers: { cookie: ... }` (105, 106) | `s` and `cookie` are not rule keywords |

### Why the push scan never caught it

`ci.yml` already documents this, and it behaved exactly as written: on `push`, gitleaks scans only
the pushed range with `--first-parent`, so a locally merged `--no-ff` branch contributes **zero**
commits. The offending commit landed 2026-09-13; the weekly schedule (`cron: "17 3 * * 1"`) is the
structural backstop and caught it on the first Monday after. The backstop did its job.

## The fix

One entry appended to `.gitleaks.toml`:

```toml
[[allowlists]]
description = "Sentry-scrub canaries in sentry-scrub.test.ts - RAWT0KEN_* fixtures ..."
regexes = ['''^RAWT0KEN[\w.=-]*$''']
```

### Anchored on the secret, not on the path

`[[allowlists]].regexes` matches the **captured secret**, not the line and not the file path. That
is the entire design decision: a path allowlist over `*.test.ts` would silence this finding *and*
blind the scanner to a real credential pasted into any test file.

Proven rather than assumed — a Stripe-shaped key planted beside the canary still fires:

```
CAUGHT rule=stripe-access-token file=src/lib/sentry-scrub.test.ts line=105
```

The regex is a **prefix family** (`RAWT0KEN*`) rather than the enumerated-literal style of the
existing wizard-keys entry, so the next canary variant does not reopen this.

## Verification

Against the CI-pinned binary (8.30.1), full history, 179 commits:

| Run | Result |
| --- | --- |
| Before the change | `leaks found: 2` |
| After the change | `no leaks found`, exit 0 |
| Stripe-shaped key planted beside the canary | still `CAUGHT` |

Gates: `tsc --noEmit` exit 0 · `eslint` 0 errors (7 pre-existing warnings) · 852 tests / 49 files.

## Things to know

- **The version pin is load-bearing.** `gitleaks-action@v3` installs **8.24.3** by default, which
  silently ignores `[[allowlists]]` — the allowlist would appear to do nothing at all. `ci.yml`
  pins `GITLEAKS_VERSION: "8.30.1"`; `.gitleaks.toml` declares `minVersion = "8.25.0"`.
- **Name new canaries `RAWT0KEN...`.** Any other prefix falls outside the allowlist and reopens this.
- **A config change only takes effect on `origin`.** The scheduled job runs from the default branch
  on GitHub, so an unpushed `.gitleaks.toml` leaves the scan red.
- **Never paste realistic credentials into docs or fixtures.** A document *about* secret scanning is
  itself scanned. The planted Stripe key is written `sk_live_...` here for that reason.

## Reproducing locally

gitleaks is not a project dependency. Match the CI pin:

```bash
# full history - the same command CI runs
gitleaks detect --redact --exit-code=2 --no-banner

# working tree incl. uncommitted changes
gitleaks detect --no-git --redact --no-banner
```

WARNING: `--no-git` ignores `.gitignore`, so it reports your real `.env.*` files and `.next/`
build output. Those are not in git history — the full-history scan above returns clean — so they
are not a CI problem.
