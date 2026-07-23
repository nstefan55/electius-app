# Election Wizard — QR Code (Phase 3)

> Branch `feature/wizard-qr-code` · Spec `context/features/elections-page-phase-3-spec.md` · Design `Election Wizard.dc.html` (success section)

Adds a **"Create QR code"** toggle to the wizard's confirmation screen (the "Election created" page after Step 5). Clicking it reveals a centered QR panel; clicking again hides it.

## What it looks like

Button row on the success screen is now: **Create another · Create QR code · Go to election**. The QR button (Lucide `QrCode`, blue secondary style) toggles a panel between the summary box and the buttons containing:

- 196px scannable QR code (SVG)
- Election title + election-type chip (`Standardni` / `Anketa` / `Brza anketa`)
- One-line summary: voting method · voter count · closes date
- The encoded URL in monospace
- Anonymity caption ("the code links to the election, never to a person")

## QR payload — important caveat

The QR encodes `electionVoteUrl(electionId)` → **`{APEX}/vote/{electionId}`** (e.g. `https://electius.com/vote/cmrx…`).

This is **prototype-faithful but forward-looking**: the voter flow is per-voter magic links (`/vote/[token]`, tokens minted at publish), and an *election-level* ballot landing route does not exist yet. Scanning the code today lands on the ballot scaffold with an id that no token matches — effectively a dead link until that route ships. This was a deliberate product call (recorded in `src/lib/urls.ts`): printed QR codes stay stable, and the future route just has to match the shape. **Do not** confuse `electionVoteUrl(electionId)` with `voteUrl(token)` — same URL shape, different semantics.

## Files

| File | Change |
| --- | --- |
| `src/lib/urls.ts` | New `electionVoteUrl(electionId)` — the single place to change the payload |
| `src/lib/urls.test.ts` | Assertion for the new helper |
| `src/components/elections/wizard/wizard-success.tsx` | `qrShown` state, toggle button (`aria-expanded`), QR panel |
| `messages/hr.json` / `messages/en.json` | `dashboard.wizard.success.{qrShow,qrHide,qrCaption}` |
| `package.json` | New dep **qrcode.react 4.2.0** |

## Implementation notes

- **qrcode.react** renders a pure SVG (`<QRCodeSVG value={url} level="M" className="size-full" />`) with a viewBox, so it scales losslessly inside the fixed box — no canvas, no refs/effects (unlike the prototype's imperative `qrcode-generator` wiring).
- The summary line composes **existing** i18n keys (`step1.methods.*`, `step5.voterCount`, `success.closes`) — only the three genuinely new strings were added.
- Caption color diverges from the prototype's `neutral-400` to `neutral-600` — `neutral-400` fails WCAG AA for real content per the design system (same call as the dashboard empty state).
- Client-side generation only; nothing is persisted. The QR is derived from `createdId`, so it survives the "Create another" reset naturally (state lives in `WizardSuccess`, which unmounts).

## Verification

- `npm run test` 40/40 · `npm run build` passes
- Playwright walk-through (hr, seeded dev DB): full wizard → create → QR panel renders all elements with a scannable code → toggle hides it → test election deleted via the app's delete flow (seed restored)
