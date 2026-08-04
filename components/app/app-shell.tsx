"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  CalendarDays,
  Gavel,
  Images,
  LayoutDashboard,
  ListChecks,
  Menu,
  Settings,
  Store,
  Users,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { ProBadge } from "@/components/locked-feature";
import { LanguageToggle, ThemeToggle } from "@/components/toggles";
import { ArtAvatar } from "@/components/art-image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDict } from "@/lib/i18n/client";
import { creator, notifications } from "@/lib/mock/data";
import { formatRelative } from "@/lib/format";
import { useLocale } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { shopHref } from "@/lib/routes";

/** เมนูที่มี `pro: true` จะขึ้นป้าย Pro — การบังคับจริงต้องอยู่ใน Server Action */
function useNavItems() {
  const t = useDict();
  return [
    { href: "/dashboard", label: t.nav.dashboard, icon: LayoutDashboard },
    { href: "/orders", label: t.nav.orders, icon: ListChecks },
    { href: "/services", label: t.nav.services, icon: Store },
    { href: "/listings", label: t.nav.listings, icon: Gavel, pro: true },
    { href: "/portfolio", label: t.nav.portfolio, icon: Images },
    { href: "/clients", label: t.nav.clients, icon: Users, pro: true },
    { href: "/calendar", label: t.nav.calendar, icon: CalendarDays, pro: true },
    { href: "/analytics", label: t.nav.analytics, icon: BarChart3, pro: true },
    { href: "/settings", label: t.nav.settings, icon: Settings },
  ] as const;
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = useNavItems();

  return (
    <nav className="flex flex-col gap-0.5 p-2">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            <span className="flex-1 truncate">{item.label}</span>
            {"pro" in item && item.pro ? <ProBadge /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function NotificationBell() {
  const t = useDict();
  const { locale } = useLocale();
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t.notification.title}>
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="tabular absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          {t.notification.title}
          <span className="text-xs font-normal text-muted-foreground">
            {t.notification.markAllRead}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.map((n) => (
          <DropdownMenuItem key={n.id} asChild className="flex-col items-start gap-0.5 py-2.5">
            <Link href={n.href}>
              <span className="flex w-full items-center gap-2">
                {!n.read && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                <span className={cn("truncate text-sm", !n.read && "font-medium")}>{n.title}</span>
              </span>
              <span className="truncate text-xs text-muted-foreground">{n.body}</span>
              <span className="text-[11px] text-muted-foreground">
                {formatRelative(n.createdAt, locale)}
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useDict();

  return (
    <div className="flex min-h-full flex-1">
      {/* Sidebar — desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-14 items-center px-4">
          <Logo href="/dashboard" />
        </div>
        <NavList />

        <div className="mt-auto p-3">
          <div className="rounded-xl border bg-card p-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{t.plan.free}</Badge>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {t.dashboard.upgradeHint}
            </p>
            <Button asChild size="sm" className="mt-3 w-full">
              <Link href="/pricing">{t.common.upgrade}</Link>
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur-md">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t.nav.dashboard}>
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="flex h-14 items-center px-4">
                <Logo href="/dashboard" />
              </SheetTitle>
              <NavList />
            </SheetContent>
          </Sheet>

          <Link
            href={shopHref(creator.handle)}
            className="hidden text-sm text-muted-foreground hover:text-foreground sm:block"
          >
            commi.app/@{creator.handle}
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <LanguageToggle />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="ml-1 rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={creator.displayName}
                >
                  <ArtAvatar
                    seed={creator.avatarSeed}
                    alt={creator.displayName}
                    className="size-8"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>
                  <p className="text-sm">{creator.displayName}</p>
                  <p className="text-xs font-normal text-muted-foreground">@{creator.handle}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={shopHref(creator.handle)}>{t.nav.shop}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings">{t.nav.settings}</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/">{t.common.signOut}</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
