"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Bell, Menu, PanelLeft } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Toaster } from "react-hot-toast";

type CrumbKey =
  | "sidebar.nav.dashboard"
  | "sidebar.nav.elections"
  | "sidebar.nav.results"
  | "sidebar.nav.archive"
  | "sidebar.nav.voters"
  | "sidebar.account.settings";

function crumbLabelKey(pathname: string): CrumbKey {
  for (const key of ["elections", "results", "archive", "voters"] as const) {
    if (pathname === `/${key}` || pathname.startsWith(`/${key}/`)) {
      return `sidebar.nav.${key}`;
    }
  }
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return "sidebar.account.settings";
  }
  //TODO: Add support for election details and results pages
  // if (pathname.startsWith("/elections/" || pathname.startsWith("/results/")) {
  //   return "sidebar.elections.details";
  // }
  // "/" (dashboard root via the host rewrite) or "/dashboard"
  return "sidebar.nav.dashboard";
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const t = useTranslations("dashboard");
  const crumbKey = crumbLabelKey(usePathname());

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar*/}
      <aside
        className={cn(
          "hidden shrink-0 bg-sidebar transition-[width] duration-200 ease-in-out md:block",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <SidebarNav collapsed={collapsed} />
      </aside>

      {/* Mobile sidebar — always a drawer. */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-72 gap-0 overflow-hidden border-r-0 bg-sidebar p-0"
        >
          <SheetTitle className="sr-only">{t("sidebar.openMenu")}</SheetTitle>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Right column: fixed top bar + scrollable content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-4 md:px-8">
          <div className="flex items-center gap-3">
            {/* Mobile: open drawer */}
            <button
              type="button"
              aria-label={t("sidebar.openMenu")}
              onClick={() => setMobileOpen(true)}
              className="flex size-9.5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary md:hidden"
            >
              <Menu className="size-5" />
            </button>
            {/* Desktop: collapse/expand */}
            <button
              type="button"
              aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
              onClick={() => setCollapsed((c) => !c)}
              className="hidden size-9.5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary md:flex"
            >
              <PanelLeft className="size-5" />
            </button>

            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink render={<Link href="/" />}>
                    {t("topbar.home")}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-bold">
                    {t(crumbKey)}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
              <span className="size-1.75 animate-pulse rounded-full bg-status-active" />
              {t("topbar.updatedJustNow")}
            </div>
            <button
              type="button"
              aria-label={t("topbar.notifications")}
              className="flex size-9.5 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary"
            >
              <Bell className="size-4.75" />
            </button>
          </div>
        </header>

        {/* Main Area */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-content p-8">{children}</div>
        </main>
      </div>

      {/* Toasts for dashboard mutations. */}
      <Toaster
        position="top-center"
        toastOptions={{
          className:
            "!rounded-md !border !border-border !bg-card !text-sm !text-neutral-800 !shadow-md",
        }}
      />
    </div>
  );
}
