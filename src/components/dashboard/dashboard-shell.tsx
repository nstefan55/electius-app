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
import { AppToaster } from "@/components/ui/app-toaster";
import {
  accessibilityAttributes,
  type AccessibilityPrefs,
} from "@/lib/accessibility";

type CrumbKey =
  | "sidebar.nav.dashboard"
  | "sidebar.nav.elections"
  | "sidebar.nav.results"
  | "sidebar.nav.archive"
  | "sidebar.nav.voters"
  | "sidebar.account.profile"
  | "sidebar.account.settings";

function crumbLabelKey(pathname: string): CrumbKey {
  for (const key of ["elections", "results", "archive", "voters"] as const) {
    if (pathname === `/${key}` || pathname.startsWith(`/${key}/`)) {
      return `sidebar.nav.${key}`;
    }
  }
  for (const key of ["profile", "settings"] as const) {
    if (pathname === `/${key}` || pathname.startsWith(`/${key}/`)) {
      return `sidebar.account.${key}`;
    }
  }
  //TODO: Add support for election details and results pages
  // if (pathname.startsWith("/elections/" || pathname.startsWith("/results/")) {
  //   return "sidebar.elections.details";
  // }
  // "/" (host-root rewrite) or "/home"
  return "sidebar.nav.dashboard";
}

export interface ShellUser {
  name: string;
  image: string | null;
  organization: string;
}

export function DashboardShell({
  user,
  accessibility,
  children,
}: {
  user: ShellUser;
  accessibility: AccessibilityPrefs;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const t = useTranslations("dashboard");
  const crumbKey = crumbLabelKey(usePathname());

  return (
    // Atributi pristupačnosti: CSS ih hvata preko `html:has([data-…])`, pa
    // vrijede i za portale (dijalozi, izbornici, toastovi) izvan ove ljuske.
    <div
      {...accessibilityAttributes(accessibility)}
      className="flex h-screen overflow-hidden print:block print:h-auto print:overflow-visible"
    >
      {/* Desktop sidebar*/}
      <aside
        className={cn(
          "hidden shrink-0 bg-sidebar transition-[width] duration-200 ease-in-out md:block print:hidden",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <SidebarNav user={user} collapsed={collapsed} />
      </aside>

      {/* Mobile sidebar — always a drawer. */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-72 gap-0 overflow-hidden border-r-0 bg-sidebar p-0"
        >
          <SheetTitle className="sr-only">{t("sidebar.openMenu")}</SheetTitle>
          <SidebarNav user={user} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Right column: fixed top bar + scrollable content */}
      <div className="flex flex-1 flex-col overflow-hidden print:overflow-visible">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-4 md:px-8 print:hidden">
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
                {/* On the home overview the crumb IS "Home" — a "Home / Home"
                    pair would be noise, so render the single page crumb. */}
                {crumbKey === "sidebar.nav.dashboard" ? (
                  <BreadcrumbItem>
                    <BreadcrumbPage className="font-bold">
                      {t("topbar.home")}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                ) : (
                  <>
                    <BreadcrumbItem>
                    {/* TODO: IF possible: Change the breadcrumb link to marketing landing page */}
                      <BreadcrumbLink render={<Link href="/home" />}>
                        {t("topbar.home")}
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage className="font-bold">
                        {t(crumbKey)}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                )}
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
        <main className="flex-1 overflow-y-auto print:overflow-visible">
          <div className="mx-auto w-full max-w-content p-8 print:max-w-none print:p-0">{children}</div>
        </main>
      </div>

      {/* Toasts for dashboard mutations. */}
      <AppToaster />
    </div>
  );
}
