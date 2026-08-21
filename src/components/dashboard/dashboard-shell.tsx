"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Bell, Menu, PanelLeft, Sparkles } from "lucide-react";
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
  // "/" (host-root rewrite) or "/home"
  return "sidebar.nav.dashboard";
}

export interface ShellUser {
  name: string;
  image: string | null;
  organization: string;
  /** Presuda razrješivača prava, ne stupac isPro — vidi showProBadge(). */
  showPro: boolean;
  /** Ista presuda kojom se čuva /upgrade — vidi showUpgradeCta(). Nije `!showPro`:
   *  dok je naplata isključena showPro je false SVIMA, pa bi negacija nudila
   *  nadogradnju i računima koje /upgrade odbija. */
  canUpgrade: boolean;
}

export function DashboardShell({
  user,
  accessibility,
  beta,
  children,
}: {
  user: ShellUser;
  accessibility: AccessibilityPrefs;
  beta: boolean;
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
        <SidebarNav user={user} beta={beta} collapsed={collapsed} />
      </aside>

      {/* Mobile sidebar — always a drawer. */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-72 gap-0 overflow-hidden border-r-0 bg-sidebar p-0"
        >
          <SheetTitle className="sr-only">{t("sidebar.openMenu")}</SheetTitle>
          <SidebarNav
            user={user}
            beta={beta}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Right column: fixed top bar + scrollable content */}
      <div className="flex flex-1 flex-col overflow-hidden print:overflow-visible">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-4 md:px-8 print:hidden">
          {/* min-w-0: gumb „Nadogradi" je shrink-0, pa se pod pritiskom skraćuje
              mrvica, a ne poziv na nadogradnju. */}
          <div className="flex min-w-0 items-center gap-3">
            {/* Mobile: open drawer */}
            <button
              type="button"
              aria-label={t("sidebar.openMenu")}
              onClick={() => setMobileOpen(true)}
              className="flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary md:hidden"
            >
              <Menu className="size-5" />
            </button>
            {/* Desktop: collapse/expand */}
            <button
              type="button"
              aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
              onClick={() => setCollapsed((c) => !c)}
              className="hidden size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary md:flex"
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

          <div className="flex shrink-0 items-center gap-4">
            <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
              <span className="size-1.75 animate-pulse rounded-full bg-status-active" />
              {t("topbar.updatedJustNow")}
            </div>
            {/* Jedini stalno vidljiv put do nadogradnje. Vodi na /upgrade, nikad
                izravno u Checkout: administrator prvo mora vidjeti ŠTO kupuje.
                Prikazuje se samo kad postoji plan iznad ovoga — dok je naplata
                isključena razrješivač svima vraća pro, pa gumba nema. */}
            {user.canUpgrade && (
              <Link
                href="/upgrade"
                className="flex h-11 shrink-0 items-center gap-2 rounded-md bg-brand-700 px-4 font-heading text-[0.9375rem] font-semibold whitespace-nowrap text-white transition-colors hover:bg-brand-600"
              >
                <Sparkles aria-hidden="true" className="size-4.25" />
                {t("topbar.upgrade")}
              </Link>
            )}
            <button
              type="button"
              aria-label={t("topbar.notifications")}
              className="flex size-11 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary"
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
