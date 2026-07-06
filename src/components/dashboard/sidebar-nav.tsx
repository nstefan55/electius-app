"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import {
  LayoutDashboard,
  CheckCircle2,
  BarChart3,
  Archive,
  Users,
  Settings,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { currentUser } from "@/lib/mock-data";

interface NavItem {
  key: "dashboard" | "elections" | "results" | "archive" | "voters";
  href: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
  { key: "elections", href: "/dashboard/elections", icon: CheckCircle2 },
  { key: "results", href: "/dashboard/results", icon: BarChart3 },
  { key: "archive", href: "/dashboard/archive", icon: Archive },
  { key: "voters", href: "/dashboard/voters", icon: Users },
];

// Avatar initials
const initials = currentUser.name
  .split(" ")
  .map((part) => part[0])
  .slice(0, 2)
  .join("")
  .toUpperCase();

interface SidebarNavProps {
  /** Desktop icon-only collapse. The mobile drawer is always expanded. */
  collapsed?: boolean;
  /** Fired on any nav click — used to close the mobile drawer. */
  onNavigate?: () => void;
}

export function SidebarNav({ collapsed = false, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const t = useTranslations("dashboard.sidebar");

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
            alt="Electious"
            width={30}
            height={30}
            className="size-full object-contain"
            priority
          />
        </span>
        {!collapsed && (
          <span className="font-heading text-xl font-bold tracking-tight">
            Electious
          </span>
        )}
      </div>

      {/* Primary nav*/}
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
        {NAV_ITEMS.map(({ key, href, icon: Icon }) => {
          const active =
            href === "/dashboard"
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

      {/* Account block, settings, logout */}
      <div className="mt-auto p-3">
        <div
          className={cn(
            "mb-1.5 flex items-center gap-3 border-t border-sidebar-border px-3 pt-3 pb-3.5",
            collapsed && "justify-center px-0",
          )}
        >
          <span className="flex size-9.5 shrink-0 items-center justify-center rounded-full bg-brand-500 font-heading text-[15px] font-semibold text-white">
            {initials}
          </span>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">
                {currentUser.name}
              </div>
              <div className="text-xs leading-snug wrap-break-word text-white/60">
                {currentUser.organization}
              </div>
            </div>
          )}
        </div>

        <Link
          href="/dashboard/settings"
          onClick={onNavigate}
          title={collapsed ? t("account.settings") : undefined}
          className={cn(
            "flex h-10.5 items-center gap-3 rounded-md px-4 text-[15px] text-white/75 transition-colors hover:bg-white/[0.07] hover:text-white",
            collapsed && "justify-center px-0",
          )}
        >
          <Settings className="size-4.75 shrink-0" />
          {!collapsed && <span>{t("account.settings")}</span>}
        </Link>
        {/* ponytail: logout is a no-op until BetterAuth lands; wire signOut() then. */}
        <button
          type="button"
          title={collapsed ? t("account.logout") : undefined}
          className={cn(
            "flex h-10.5 w-full items-center gap-3 rounded-md px-4 text-left text-[15px] text-white/75 transition-colors hover:bg-white/[0.07] hover:text-white",
            collapsed && "justify-center px-0",
          )}
        >
          <LogOut className="size-4.75 shrink-0" />
          {!collapsed && <span>{t("account.logout")}</span>}
        </button>
      </div>
    </div>
  );
}
