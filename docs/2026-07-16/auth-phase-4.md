# Auth Phase 4 — BetterAuth UI: Sign In, Register, Sign Out & Toasts

> Branch `feature/auth-phase-4` (2026-07-16).
> Spec: `context/features/auth-phase-4-spec.md`.
> Design source: `context/design/electius-app-auth-pages-design/` (Login / Sign Up, EN + HR).

The auth surfaces get their real faces. `/login` and `/signup` move from the
minimal phase-1/3 forms to the **split-screen design-system UI** (form panel
left, navy brand-feature panel right), all form validation goes through
**zod 4** with **toast** feedback, and the sidebar account block becomes a
live session widget: initials avatar, real name + organization, and a
dropdown-up menu that finally wires the **real BetterAuth sign-out** (a no-op
since dashboard phase 2).

## What was built

| File | Role |
| --- | --- |
| `src/components/auth/auth-split-layout.tsx` | Shared split-screen chrome for login/signup (new) |
| `src/components/auth/google-icon.tsx` | Four-color Google "G" from the prototype (new) |
| `src/components/auth/login-form.tsx` | Redesigned sign-in form: zod + toasts + rememberMe (rewritten) |
| `src/components/auth/signup-form.tsx` | Redesigned registration form: zod + toasts + terms (rewritten) |
| `src/components/ui/initials-avatar.tsx` | Reusable initials avatar ("Nikola Štefančić" → "NŠ") (new) |
| `src/components/ui/app-toaster.tsx` | Shared react-hot-toast host, one visual config (new) |
| `src/components/dashboard/sidebar-nav.tsx` | Account block → dropdown-up (Settings · Sign out), real signOut (modified) |
| `src/components/dashboard/dashboard-shell.tsx` | Inline `<Toaster>` → `<AppToaster>` (modified) |
| `src/app/[locale]/(auth)/layout.tsx` | Centered chrome → passthrough + `<AppToaster>` (modified) |
| `src/app/[locale]/(auth)/login/page.tsx` · `signup/page.tsx` | Compose `AuthSplitLayout` + form + cross-links (rewritten) |
| `src/app/[locale]/(auth)/setup/page.tsx` · `onboarding/page.tsx` | Now self-center (the layout no longer does) (modified) |
| `src/lib/urls.ts` | New `marketingHomeUrl()` — auth-page logo → apex landing (modified) |
| `messages/hr.json` · `messages/en.json` | `auth.{login,signup}` rebuilt from prototype copy + `auth.footer` (modified) |
| `package.json` | **zod ^4.4.3** added |

## The split-screen layout (`auth-split-layout.tsx`)

One server component renders both pages' chrome, ported from the `.dc.html`
prototypes: logo header (clickable → apex marketing landing via
`marketingHomeUrl()`, a plain `<a>` because it's cross-host), centered
400px form column (title, subtitle, `children`), and the `brand-900` right
panel — headline, subtitle, three feature bullets (lucide icon in a
`white/10` rounded square, `brand-500` stroke), footer links. Below `lg` the
brand panel disappears and the footer links re-appear under the form
(prototype's 920px breakpoint ≈ Tailwind `lg`).

Pages pass everything as props (`title`, `subtitle`,
`brand.{title,subtitle,features[]}`) built from their own i18n namespaces, so
the component stays dumb and the copy stays in `messages/*.json` — the HR
strings are verbatim from the HR prototype variants.

Deliberate omissions (ponytail-noted in code):

- **Privacy/terms links are `#`** — the legal pages don't exist yet.
- **Forgot-password link is `#`** — OTP/forgot-password is its own open thread.
- **The prototype's language link (top-right) was skipped** — the language
  switcher is gated and destined for Settings (dashboard phase 2 decision).

## zod 4 validation + toast pattern (both forms)

zod is now installed (`^4.4.3`) — this replaces phase 3's "plain guards until
zod lands" note. The v4 API differs from v3 (relevant here):

```ts
z.email({ error: t("errors.email") })       // top-level, not z.string().email()
z.string().min(8, { error: t("…") })        // { error }, not { message }
z.literal(true, { error: t("errors.terms") }) // terms checkbox
.refine((d) => d.password === d.confirmPassword, { error: …, path: ["confirmPassword"] })
```

Schemas are built inside the component so messages come from
`useTranslations`. On submit, `schema.safeParse(...)`:

- **Invalid** → walk `parsed.error.issues` (v4 deprecates `.flatten()`;
  issues are the stable API), flag each `issue.path[0]` field, and
  `toast.error(issues[0].message)`. Flagged fields get
  `aria-invalid` — the input class carries `aria-invalid:border-error-500`,
  so the design-system error border is pure CSS.
- **Valid** → the existing phase-1/3 wiring runs unchanged
  (`authClient.signIn.email` / `POST /api/auth/register`), API failures
  become toasts (the phase-3 `ERROR_BY_CODE` map now feeds `toast.error`),
  success fires `toast.success` and hard-navigates (full navigation so the
  proxy re-runs with the new cookie).

Forms are `noValidate` — browser validation bubbles would preempt the zod
toasts. `required`/`minLength` attributes were dropped for the same reason;
zod owns validation.

Two functional additions surfaced by the design:

- **"Keep me signed in"** is real: it feeds BetterAuth's `rememberMe` option
  on `signIn.email` (unchecked → session-lived cookie).
- **Terms checkbox** gates signup via `z.literal(true)` (toast if unchecked).

A11y note: the password helper ("Use 8 or more characters.") sits **outside**
its `<label>` and is attached with `aria-describedby` — inside the label it
polluted the field's accessible name (caught during Playwright testing).

### Spec deviation — signup success target

The spec said "redirect to sign-in on success", but registration auto-signs-in
(BetterAuth `autoSignIn`), and the phase-1 gate bounces signed-in users off
`/login` — the literal reading would just be extra hops to the same place.
Kept the verified phase-3 funnel: success → `/{locale}/setup`. Same reason the
prototype's "Organization name" field was omitted: org creation belongs to the
setup-page spec and `/api/auth/register` doesn't accept it.

## Sidebar account block (`sidebar-nav.tsx`)

The account block (initials avatar + name + org + `ChevronsUpDown`) is now a
Base UI `Menu.Trigger`; the menu opens **upward** (`side="top"`, same popup
styling as the archive/recent-elections row menus) with two items:

- **Settings** → `/settings` (locale-aware `Link`). The spec floated
  `/profile`, but no such route exists in any `context/` spec —
  `project-overview.md`'s "Settings Tab" owns account settings, and the old
  standalone sidebar link already pointed there. (The page itself is still a
  future spec; the destination is now correct in one place.)
- **Sign out** → `authClient.signOut()` then a **full navigation** to
  `/{locale}/login` so the proxy gate re-runs without the cookie. This
  replaces the phase-2 no-op logout button.

The old standalone Settings/Log out rows were consolidated into the menu —
one account surface instead of three rows. Collapsed mode shows the avatar
only (menu still works; `title` tooltip carries the name).

`InitialsAvatar` (`src/components/ui/initials-avatar.tsx`) is the reusable
piece: first letter of the first two words, uppercased — diacritics survive
("NŠ"). **Google `image` support is deliberately deferred**: the `(app)`
layout's `{ name, organization }` projection is the PII guard from the
2026-07-11 audit and stays untouched (user decision 2026-07-16 — no email,
no image in the sidebar).

## Toast host (`app-toaster.tsx`)

The `(auth)` group renders outside `DashboardShell`, so the shell's `<Toaster>`
never reached login/signup. The one visual config (top-center, bordered card
style — the dashboard-phase-4 decision) moved into a shared `AppToaster`,
mounted in both `dashboard-shell.tsx` and `(auth)/layout.tsx`. The two never
coexist on a page (different route groups).

Side effect: `(auth)/layout.tsx` is now a passthrough (login/signup own the
full viewport), so `setup/page.tsx` and `onboarding/page.tsx` carry their own
centering wrapper — visually unchanged.

## Verified (dev server, seeded dev DB, Playwright)

- **Login (hr)**: split-screen renders with prototype copy; empty submit →
  toast "Unesite ispravnu e-mail adresu." + error borders + `aria-invalid` on
  both fields; seeded admin sign-in → success toast → dashboard.
- **Sidebar**: real session user ("NŠ" avatar, name, org from the DB); menu
  opens up with Postavke (`/hr/settings`) + Odjava; **Odjava → lands on
  `/hr/login`, and `/hr/dashboard` afterwards bounces to login** (session
  revoked server-side, not just cookie-dropped). Keyboard access works
  (focus + Enter opens the menu).
- **Signup (hr)**: terms unchecked → "Za nastavak prihvatite uvjete
  korištenja."; mismatch → "Lozinke se ne podudaraju." + `aria-invalid` on
  confirm; full registration → success toast → `/hr/setup` (org-less funnel
  intact). Smoke user deleted from the dev DB afterwards.
- **EN locale**: `/en/login` renders "Welcome back" / "Elections your members
  can trust" / "Continue with Google".
- **Mobile (390px)**: brand panel hidden, footer links under the form.
- Logo click-through: both pages render `<a href="{apex}/">` around the logo.
- `npm run build` passes (TypeScript included, 26 routes, no collisions).

## Phase boundary → next

- `/setup` + `/onboarding` content (org creation — the funnel dead-end for
  fresh accounts) — setup-page + onboarding-page specs.
- OTP / forgot-password (the login link is `#` until then).
- Legal pages (terms/privacy — the checkbox links are `#` until then).
- `/settings` page content (the menu destination exists, the page is a stub).
- Google avatar `image` in the sidebar: requires a deliberate widening of the
  PII projection — revisit when profile UI lands.
