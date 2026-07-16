import { AppToaster } from "@/components/ui/app-toaster";

// (auth) group layout — bare chrome for the account funnel (dashboard host).
// Pages own their full-screen layout (login/signup render the split-screen
// design; setup/onboarding center themselves). AppToaster hosts the zod +
// BetterAuth success/error toasts — the (app) shell's Toaster never reaches
// this group.
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      <AppToaster />
    </>
  );
}
