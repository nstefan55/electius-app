"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Menu } from "@base-ui/react/menu";
import {
  LayoutDashboard,
  CheckCircle2,
  BarChart3,
  Archive,
  Users,
  ChevronsUpDown,
  Settings,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import type { ShellUser } from "@/components/dashboard/dashboard-shell";

interface NavItem {
  key: "dashboard" | "elections" | "results" | "archive" | "voters";
  href: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", href: "/", icon: LayoutDashboard },
  { key: "elections", href: "/elections", icon: CheckCircle2 },
  { key: "results", href: "/results", icon: BarChart3 },
  { key: "archive", href: "/archive", icon: Archive },
  { key: "voters", href: "/voters", icon: Users },
];

const MENU_ITEM =
  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-neutral-700 outline-none data-highlighted:bg-neutral-100";

interface SidebarNavProps {
  user: ShellUser;
  /** Desktop icon-only collapse. The mobile drawer is always expanded. */
  collapsed?: boolean;
  /** Fired on any nav click — used to close the mobile drawer. */
  onNavigate?: () => void;
}

export function SidebarNav({
  user,
  collapsed = false,
  onNavigate,
}: SidebarNavProps) {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("dashboard.sidebar");

  async function signOut() {
    await authClient.signOut();
    // Full navigation (not client nav) so the proxy gate re-runs without the cookie.
    window.location.assign(`/${locale}/login`);
  }

  return (
    <div className="flex h-full flex-col text-sidebar-foreground">
      {/* Logo + brand*/}
      <div
        className={cn(
          "flex h-16 shrink-0 items-center gap-2.5 px-6",
          collapsed && "justify-center px-0",
        )}
      >
        <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-md">
          <Image
            src="/logo/logo-mark-white.png"
            alt="Electius"
            width={30}
            height={30}
            className="size-full object-contain"
            priority
          />
        </span>
        {!collapsed && (
          <span className="font-heading text-xl font-bold tracking-tight">
            Electius
          </span>
        )}
      </div>

      {/* Primary nav*/}
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
        {NAV_ITEMS.map(({ key, href, icon: Icon }) => {
          const active =
            href === "/"
              ? pathname === href
              : pathname.startsWith(href);
          const label = t(`nav.${key}`);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-md px-4 text-base transition-colors",
                collapsed && "justify-center px-0",
                active
                  ? "bg-sidebar-primary font-semibold text-white"
                  : "text-white/75 hover:bg-white/[0.07] hover:text-white",
              )}
            >
              <Icon className="size-5 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Account block — dropdown-up with Settings + Sign out (auth-phase-4). */}
      <div className="mt-auto border-t border-sidebar-border p-3">
        <Menu.Root>
          <Menu.Trigger
            title={collapsed ? user.name : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-white/[0.07] data-popup-open:bg-white/[0.07]",
              collapsed && "justify-center px-0",
            )}
          >
            <InitialsAvatar name={user.name} />
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">
                    {user.name}
                  </div>
                  <div className="text-xs leading-snug wrap-break-word text-white/60">
                    {user.organization}
                  </div>
                </div>
                <ChevronsUpDown className="size-4 shrink-0 text-white/60" />
              </>
            )}
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner
              side="top"
              align="start"
              sideOffset={8}
              className="z-50 outline-none"
            >
              <Menu.Popup className="min-w-52 rounded-lg border border-border bg-white p-1.5 shadow-md outline-none">
                <Menu.Item
                  className={MENU_ITEM}
                  render={<Link href="/settings" onClick={onNavigate} />}
                >
                  <Settings className="size-4" />
                  {t("account.settings")}
                </Menu.Item>
                <Menu.Separator className="my-1 h-px bg-border" />
                <Menu.Item
                  className={cn(
                    MENU_ITEM,
                    "text-error-700 data-highlighted:bg-error-50",
                  )}
                  onClick={signOut}
                >
                  <LogOut className="size-4" />
                  {t("account.logout")}
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
    </div>
  );
}
