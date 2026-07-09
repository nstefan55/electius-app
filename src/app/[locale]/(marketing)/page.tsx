// Marketing landing stub (apex host). Phase 2 wires only the two auth CTAs; the full
// landing design/content is Phase 4 (routing-structure-phase-4-spec.md), which also
// moves these links to the shared src/lib/urls.ts helper (signInUrl/signUpUrl).
//
// Cross-host links (apex → dashboard host): plain <a> with the absolute NEXT_PUBLIC_APP_URL,
// never the locale-aware <Link>, and never a hardcoded host (domain-architecture-spec §5, decision C).
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-bold text-neutral-800">Electious Landing Page</h1>
      <div className="flex items-center gap-4">
        <a
          href={`${APP_URL}/login`}
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          Sign In
        </a>
        <a
          href={`${APP_URL}/signup`}
          className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          Sign Up
        </a>
      </div>
    </main>
  );
}
