# Dashboard Empty State

Onboarding view shown on `/dashboard` when the signed-in admin has **no
elections yet** (first registration/login). Reuses the existing sidebar +
top-bar shell; only the main content area changes.
Spec: `context/features/dashboard-empty-state.md`.

## When it shows

`page.tsx` fetches once via `getDashboardData()` and short-circuits:

```tsx
const { elections, stats } = await getDashboardData();
if (elections.length === 0) return <DashboardEmptyState />;
```

Any elections → the normal dashboard (stat cards / hero / list / charts).

## Component

`src/components/dashboard/dashboard-empty-state.tsx` — a single server
component (no state, no client JS). Faithful port of the design prototype
`context/design/electious-app-design-prototype/project/Dashboard Empty State.dc.html`.

Structure, top to bottom:

| Element | Notes |
| ------- | ----- |
| Ring icon badge | `CircleCheckBig` (Lucide) in a `brand-50` circle with an 8px `ring-brand-700/5` halo |
| `h1` title | Poppins, "Create your first election" |
| Subtitle | one-line value prop |
| CTA button | `+ Create election` → `Link` to `/elections/new` |
| Feature grid | 2×2 (1-col on mobile) — Mail / QrCode / FileText / ShieldCheck |
| Trust caption | fine-print magic-link / anonymity note |

Feature cards are driven by a local `FEATURES` array (`key`, `Icon`,
`iconClass`, `pro`). The `pro` flag renders a PRO badge — all four are `false`
for the MVP (every listed feature is Free), but the badge path is wired for
when Pro-only features land here.

## i18n

New `dashboard.empty` namespace in `messages/hr.json` + `messages/en.json`.
All copy (title, subtitle, cta, trust, and each `features.<key>.{title,desc}`)
goes through `useTranslations("dashboard.empty")` — no hardcoded strings.
MVP renders `hr`; `en` is present and ready.

## Design notes

Layout values track the prototype, with a few readability adjustments made
against `context/design-system-spec.md`:

- Feature card padding `p-5`, icon gap `gap-4`, grid `sm:gap-5`, description
  `leading-normal` — a touch more breathing room than the raw prototype.
- Trust caption uses `text-neutral-600`, **not** `neutral-400`: the design
  system marks `neutral-400` (#9CA3AF, 2.9:1) as *placeholder only — never for
  real content* (fails WCAG AA).
- Vertical centering: `min-h-[calc(100dvh-8rem)]` accounts for the 64px top bar
  + the shell's 32px content padding (top+bottom), so the block sits centered in
  the scroll area.

## Files

- `src/components/dashboard/dashboard-empty-state.tsx` — the component
- `src/app/[locale]/dashboard/page.tsx` — zero-elections short-circuit
- `messages/hr.json`, `messages/en.json` — `dashboard.empty` namespace
