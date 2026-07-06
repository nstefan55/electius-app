import { DashboardShell } from "@/components/dashboard/dashboard-shell";

// Dashboard chrome: collapsible sidebar + top bar around page content.
export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <DashboardShell>{children}</DashboardShell>;
}