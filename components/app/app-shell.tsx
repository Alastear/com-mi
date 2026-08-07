"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  LayoutList,
  Users,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { ProBadge } from "@/components/locked-feature";
import { LanguageToggle, ThemeToggle } from "@/components/toggles";
import { UserAvatar } from "@/components/user-avatar";
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
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { shopHref } from "@/lib/routes";
import { shopUrlDisplay } from "@/lib/site";

/** เมนูที่มี `pro: true` จะขึ้นป้าย Pro — การบังคับจริงต้องอยู่ใน Server Action */
function useNavItems() {
  const t = useDict();
  return [
    { href: "/dashboard", label: t.nav.dashboard, icon: LayoutDashboard },
    { href: "/orders", label: t.nav.orders, icon: ListChecks },
    { href: "/shop", label: t.nav.shop, icon: Store },
    { href: "/services", label: t.nav.services, icon: LayoutList },
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

/**
 * กระดิ่งแจ้งเตือน
 *
 * ตาราง `notification` ยังไม่มี (Phase 1c) — เดิมตรงนี้อ่านจากข้อมูลจำลอง
 * ทำให้ครีเอเตอร์ใหม่เห็นเลข 3 บนกระดิ่งตั้งแต่วินาทีแรกที่ล็อกอิน
 * แล้วกดเข้าไปเจอการแจ้งเตือนของคนอื่นที่ไม่เคยเกิดขึ้น
 *
 * ตอนนี้แสดงสถานะว่างตามความจริง ต่อกับข้อมูลจริงเมื่อทำตารางเสร็จ
 */
function NotificationBell() {
  const t = useDict();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t.notification.title}>
          <Bell className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>{t.notification.title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">
          {t.notification.empty}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type SessionUser = {
  name: string;
  email: string;
  image: string | null;
  handle: string | null;
  plan: string;
};

export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const t = useDict();
  const router = useRouter();
  const isPro = user.plan !== "free";
  // ยังไม่ได้ตั้ง handle = ยังไม่ได้ทำ onboarding — ชี้ไปหน้า onboarding แทนหน้าร้าน
  const shopPageHref = user.handle ? shopHref(user.handle) : "/onboarding";

  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

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
              <Badge variant={isPro ? "default" : "secondary"}>
                {isPro ? t.plan.pro : t.plan.free}
              </Badge>
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

          {user.handle ? (
            <Link
              href={shopPageHref}
              className="hidden text-sm text-muted-foreground hover:text-foreground sm:block"
            >
              {shopUrlDisplay(user.handle)}
            </Link>
          ) : (
            <Link href="/onboarding" className="hidden text-sm text-primary sm:block">
              {t.auth.finishSetup}
            </Link>
          )}

          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <LanguageToggle />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="ml-1 rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={user.name}
                >
                  <UserAvatar user={user} className="size-8" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>
                  <p className="truncate text-sm">{user.name}</p>
                  <p className="truncate text-xs font-normal text-muted-foreground">
                    {user.handle ? `@${user.handle}` : user.email}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={shopPageHref}>{t.nav.shop}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings">{t.nav.settings}</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>{t.common.signOut}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
