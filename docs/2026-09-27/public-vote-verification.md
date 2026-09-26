# Public Vote Verification (`/verify/[id]`)

**Version:** 0.9.83 · **Branch:** `feature/vote-verification` · **Date:** 2026-09-27

A voter can now check their verification code on a public, sessionless page on the apex:
`/{locale}/verify/[electionId]`. After the election is sealed, the check runs **in the voter's
browser** against the published Merkle root, so it does not require trusting Electius.

Before this, screen 5 asked voters to keep the code "so you can confirm your vote was counted",
and nothing could check it: `merkleProof` / `verifyMerkleProof` had no callers outside
`merkle.service.ts`, and the downloaded receipt carried no election id and no URL.

No migration, no new dependency.

---

## What the check proves (read before editing copy)

The seal commits to the **set of receipts** (`voteHash` values), not to per-option tallies —
`VoteToOption` is outside the tree. A passing check means:

> your ballot is among the sealed ballots, and the sealed set has not changed since.

It does **not** mean "your vote was counted for X". Do not put that wording on this page. Binding a
receipt to a choice would turn the receipt into a vote-buying proof. For the same reason screen 5
now says "zabilježen" (recorded), not "prebrojen" (counted).

---

## Flow

```
voter ──POST /api/verify { electionId, code }──▶ verification.service.verifyReceipt
                                                     │
      ◀── { kind, election, root?, sealedAt?, path? } ┘
      │
      └─ kind === "sealed" → verifyProofInBrowser(code, path, root)   (Web Crypto)
```

The server returns the voter's **sibling path only** (log₂ n hashes) plus the published root.
It never returns `proofData.leaves` or `tree`, and there is no endpoint that dumps them. The server
cannot forge a path to a root it has already published, so the fold in the browser is the proof.

| `kind` | When | What the page shows |
| --- | --- | --- |
| `notFound` | unknown code, unknown election, or a real code under another election | one answer for all three — no existence oracle |
| `recorded` | code is in the DB, election not sealed yet | "recorded", verification available after sealing (server-trusted) |
| `sealed` | archive exists, path served | browser fold → ✓ verified with root + seal date, or ✗ "Provjera nije uspjela" |
| `legacy` | election started before `RANDOM_RECEIPTS_SINCE` | sealed, but no independent proof |
| `pruned` | Free archive whose tree was pruned | sealed, but no independent proof |

Every state explains itself; none 404s. The page itself reads nothing from the database and is
identical for every id, with a constant `noindex` metadata block, so the URL does not reveal
whether an election exists.

---

## Files

| File | Role |
| --- | --- |
| `lib/merkle-verify.ts` | client-safe: `VerifyResult`, `RECEIPT_PATTERN`, `normalizeReceipt`, `verifyProofInBrowser` (Web Crypto fold) |
| `lib/services/verification.service.ts` | `server-only`: `verifyReceipt`, `RANDOM_RECEIPTS_SINCE` |
| `app/api/verify/route.ts` | `POST`, zod shape check → 400, rate limit → 429, `Cache-Control: no-store` |
| `app/[locale]/(voter)/verify/[id]/page.tsx` | renders `VerifyForm`, no DB read |
| `components/voter/verify-form.tsx` | client form, all result states, `#code` fragment handling |
| `lib/rate-limit.ts` | `verifyReceipt` limiter, 60 / 15 min per IP |
| `proxy.ts` | `/verify` joins `/vote` in the dashboard-host → apex redirect |
| `messages/{hr,en}.json` → `voter.verify`, `voter.flow.receipt.verify` | copy |

Entry points: a link on the confirmation screen (screen 5, new tab), the verify URL printed in the
downloaded `.txt` receipt, a CTA on the `used` and `closed` state screens, and a link on the public
results page.

---

## Rules to keep

- **The code never goes in a URL path or query.** It travels in the POST body. Links from screen 5
  and the receipt carry it in the **fragment** (`/verify/<id>#<code>`), which browsers never send to
  the server; the form reads it, runs the check, then removes it with `history.replaceState`.
- **The form listens for `hashchange` too.** Opening a second receipt link in a tab already on
  `/verify/[id]` changes only the fragment — a same-document navigation with no reload — so without
  the listener the second check never ran.
- **Shape is checked at the route.** `verifyMerkleProof` does no shape checking by design, so a bad
  input must get a 400 there, not a silent "no". Inputs are capped (`electionId` ≤ 64, raw code ≤ 200
  before normalising to 64 hex).
- **Two implementations of one algorithm are intentional.** `merkle.service.ts` uses Node `crypto`
  and is `server-only`; the browser needs `crypto.subtle`. `merkle-verify.test.ts` runs both over the
  same trees (every leaf of 1, 2, 3, 4, 5, 7, 8 and 9-leaf trees, plus the asymmetric 3-leaf case). Change the algorithm string
  and both must change together.
- **`public-results.tsx` uses a plain `<a>`** built from the locale it already has. `/results/[id]`
  is the app's only ISR route, so it must not gain new next-intl server calls.

---

## `RANDOM_RECEIPTS_SINCE` — why old elections get no path

Before v0.9.78 a receipt was `SHA-256(electionId + sortedOptionIds + ISO timestamp)`. Any such leaf
can be brute-forced in minutes. A sibling path always contains exactly one other voter's leaf
(level 0), so serving it would reveal that neighbour's choice and the exact millisecond they voted —
and a millisecond next to an IP in the request log is a deanonymisation.

Random receipts reached `origin` on 2026-09-14. Any election whose `startsAt` is before
`2026-09-15T00:00Z` may hold old receipts and gets `legacy`. The cutoff is by `startsAt`, which is
conservative on purpose. Do not move it earlier.

---

## Known limitations

- Nothing seals automatically. An election that stays `CLOSED` forever only ever answers
  `recorded`. Auto-seal at close is a follow-up and would change what `ARCHIVED` means in the admin UI.
- `verifyReceipt` reads the whole stored tree to build one path (O(n) hashes). Fine at MVP scale;
  store paths at seal time if it becomes slow.
- `crypto.subtle` exists only in a secure context. Over plain HTTP on a LAN the check reads as a
  connection error. Production is HTTPS.
- An election archived before the seal existed (dev data only) answers `recorded` with
  "available after sealing", which never comes.
- Path length reveals the ballot count within a power of two. Accepted; padding would change the
  algorithm string.

---

## Checking it

- Unit: `npx vitest run src/lib/merkle-verify.test.ts src/lib/services/verification.service.test.ts`
- Browser: cast a ballot on a dev election, click **Provjerite svoj glas** on screen 5. Before the
  seal it answers "recorded". Archive the election from the dashboard, reload: ✓ with the Merkle
  root, which must match the root in the election's PDF report.
- Tamper check: insert a vote row after sealing and verify its code — the page must say
  "Provjera nije uspjela" (the code is in the DB but not in the tree, so the path is empty).
