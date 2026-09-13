# Launch infrastructure — deploy, environment and rollback

> 2026-09-13 · `mvp-launch.md` §3 (Data & infrastructure).
> **No source change, no migration, no dependency.** This was console/owner work plus one written
> deliverable. It is documented because two of its outcomes change how you are expected to work.

---

## 1. The one thing every contributor must know

**A merge to `main` applies database migrations to production, unattended.**

The Vercel Build Command is overridden to:

```
prisma generate && prisma migrate deploy && next build
```

This was verified on a real production build log on 2026-09-12 — not inferred from
`package.json`, which runs `prisma generate && next build` and is **not** what production runs.
It was then kept deliberately (CI/CD spec D2; the spec's own recommendation had been to remove it,
and that was overruled after being checked).

### What follows for you

| | |
| --- | --- |
| A PR that adds a migration | is a **production schema change** the moment it merges. Review it as one. |
| A deploy that carried a migration | **cannot be rolled back** by rolling back the deploy. See §3. |
| Before merging a migration | take a manual Neon snapshot. There is no pipeline step to hang this on — it depends on you remembering. That is the accepted cost of the decision. |
| Never `prisma db push` | unchanged, and now load-bearing: CI's `migration-presence` job fails a PR whose schema changed without a migration file. That is the only structural guard in this area. |

> Historical note worth carrying: this same setting had been recorded as "removed" twice before
> (2026-08-30, 2026-09-04) and was live both times. **Read a build log, not a record.**

---

## 2. Environment variables

Parity across environments was verified against **live Vercel** (`vercel env ls` / `vercel env pull`),
not against the local `.env.production` — that file never reaches Vercel and is therefore not
evidence of anything.

All required variables are present. Deliberately absent, and correct:

- **All five Stripe variables** — so the billing plugin does not mount at all.
- **`BILLING_ENABLED`** — absent means every organization resolves as Pro, which is the intended
  pre-launch posture while no legal entity exists.
- **`EMAIL_VERIFICATION_ENABLED`** — absent means on.

⚠ **Limit of this check, stated rather than implied.** Secret-typed variables return `[SENSITIVE]`
even to `env pull`. Parity of **names** is machine-checkable; parity of **values** is not. If a
secret is wrong, nothing here would have caught it.

Practical consequence: this app **cannot detect a missing environment variable** for several
integrations (Upstash, R2, Resend). They fail open or fail silent. When you add one, add it to
Vercel too — no test will tell you that you forgot.

---

## 3. Rolling back

Full procedure: **`docs/2026-09-13/rollback-plan.md`**. Summary only here.

The plan splits on exactly one question, and it is asked *before* you promote anything:

> **Did the bad deploy carry a migration?**

```
vercel inspect <deployment-url> --logs | grep -E "Applying migration|No pending"
```

- **No** → promote the previous production deployment. **Measured: 7 seconds** to roll back,
  6 seconds to restore forward (measured by doing it, polling the apex `Etag` until it changed).
- **Yes** → you are not rolling back a deploy, you are recovering a database. Go to
  `docs/2026-09-02/recovery-runbook.md`, whose §0 outranks everything: **never restore across a
  live voting window** (votes carry no `voterId`, so a destroyed ballot cannot be traced or
  individually re-solicited).

A rollback reverses code and routes. It does **not** reverse: environment variables, schema
changes, rows written, R2 objects, or emails already sent.

Because 7 seconds is the code half, essentially the entire budget in an incident goes on
*deciding* whether to roll back. That is why the grep comes first.

---

## 4. Deliberately deferred — do not re-derive these

Four items in this area are open **by decision**, not by oversight:

| Item | Why it is deferred |
| --- | --- |
| Split the shared dev/prod Upstash instance | Needs a second Upstash database, i.e. a paid tier. Not spending before revenue. Consequence while shared: `sweep:nextDue` and `ratelimit:*` keys cross environments — a locally-run cron ping can gate production's sweeps for up to the gate TTL. |
| Separate Preview and Production database scoping | Deferred for now; tracked with its full detail in the launch checklist (`context/`, gitignored). |
| Execute a restore drill on a copy | All three recovery tiers are configured and **unproven** — the runbook has never been run. Requires production-scoped console actions outside the agent guardrail. |
| Stripe Customer Portal plan-switching in **live** mode | No legal entity exists, so there is no live mode to configure yet. ⚠ When it arrives: **swap to live keys before flipping `BILLING_ENABLED=true`**, or `stripeClient()` throws at module evaluation and takes down every signed-in page, not just billing. |

---

## 5. Where things live now

| | |
| --- | --- |
| Launch state, canonical | `context/features/mvp-launch.md` (gitignored) — §13 records what is done and why |
| Deploy rollback | `docs/2026-09-13/rollback-plan.md` |
| Data loss / corruption | `docs/2026-09-02/recovery-runbook.md` |
| Backup tiers as configured | `docs/2026-09-13/neon-recovery-tiers.md` |

The external "Gate 10 console companion" artifact from the production-readiness phase is
**retired** — it had drifted into a false operational claim while simultaneously telling the reader
to go and check whether that claim was true. Two surfaces for one fact is the drift pattern this
project keeps designing against; the checklist wins, because a future session can read a file in
the repo and cannot read a URL it was never given.

---

## 6. Not covered

Provider outages, observability (error tracking, uptime, load smoke, billing alerts) and SEO all
live in their own sections of the launch checklist. Nothing here touches application behaviour.
