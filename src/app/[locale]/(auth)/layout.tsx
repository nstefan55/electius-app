// (auth) group layout — bare full-screen chrome for the account funnel (dashboard host).
// No admin sidebar/topbar (contrast the (app) shell, design-system-spec §8.1). Structural
// only — real auth-screen styling belongs to the separate auth spec.
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      {children}
    </main>
  );
}
