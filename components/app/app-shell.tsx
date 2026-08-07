"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
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
import { useEffect, useRef, useState } from "react";
import { useDict, useLocale } from "@/lib/i18n/client";
import { formatRelative } from "@/lib/format";
import { dynamicHref } from "@/lib/routes";
import { notificationText } from "@/lib/notifications/labels";
import { markNotificationsRead } from "@/lib/notifications/actions";
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
 * **Polling ไม่ใช่ SSE** — Vercel Fluid Compute คิดเงินตาม active CPU + memory ที่จอง
 * สตรีมค้างหนึ่งเส้นต่อผู้ใช้ที่เปิดแท็บทิ้งไว้แพงกว่าประโยชน์มาก (docs/01 §6)
 *
 * สามอย่างที่ทำให้ polling ถูกจริง:
 *   1. ไม่ยิงเลยเมื่อแท็บไม่ได้อยู่หน้าจอ — คนเปิดทิ้งไว้ข้ามคืนไม่กินอะไรเลย
 *   2. ถอยจังหวะเป็นทวีคูณเมื่อไม่มีอะไรใหม่ (5 วิ → 10 → 20 … สูงสุด 60)
 *      แล้วรีเซ็ตกลับทันทีที่มีของใหม่
 *   3. ส่ง If-None-Match — ถ้าไม่มีอะไรเปลี่ยน ได้ 304 ตัวเปล่า ไม่มี payload
 */
function NotificationBell() {
  const { t, locale } = useLocale();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const etag = useRef<string | null>(null);
  const emptyPolls = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    async function poll() {
      if (document.visibilityState !== "visible") return schedule();
      try {
        const res = await fetch("/api/notifications", {
          headers: etag.current ? { "If-None-Match": etag.current } : {},
        });
        if (res.status === 304) {
          emptyPolls.current++;
        } else if (res.ok) {
          const data = (await res.json()) as { unread: number; items: NotificationItem[] };
          const changed = data.unread !== unread || data.items[0]?.id !== items[0]?.id;
          emptyPolls.current = changed ? 0 : emptyPolls.current + 1;
          etag.current = res.headers.get("ETag");
          if (!cancelled) {
            setUnread(data.unread);
            setItems(data.items);
          }
        }
      } catch {
        // เน็ตหลุดชั่วคราวไม่ใช่เรื่องต้องแจ้งผู้ใช้ — รอบหน้าลองใหม่เอง
        emptyPolls.current++;
      }
      schedule();
    }

    function schedule() {
      if (cancelled) return;
      timer = setTimeout(poll, Math.min(60_000, 5_000 * 2 ** emptyPolls.current));
    }

    void poll();
    // กลับมาที่แท็บแล้วต้องเห็นของใหม่ทันที ไม่ใช่รอจังหวะถัดไปที่อาจนานถึงนาที
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        emptyPolls.current = 0;
        clearTimeout(timer);
        void poll();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // ตั้งใจให้รันครั้งเดียว — ค่าที่ใช้ข้างในอ่านผ่าน ref หรือ setState แบบ callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t.notification.title}>
          <Bell className="size-4" />
          {unread > 0 ? (
            <span className="tabular absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          {t.notification.title}
          {unread > 0 ? (
            <button
              type="button"
              onClick={() => {
                setUnread(0);
                setItems((prev) => prev.map((n) => ({ ...n, read: true })));
                void markNotificationsRead();
              }}
              className="text-xs font-normal text-muted-foreground hover:text-foreground"
            >
              {t.notification.markAllRead}
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {t.notification.empty}
          </p>
        ) : (
          items.map((n) => {
            const text = notificationText(t, n.type, n.data);
            if (!text) return null;
            return (
              <DropdownMenuItem key={n.id} asChild className="flex-col items-start gap-0.5 py-2.5">
                <Link href={dynamicHref(n.url)}>
                  <span className="flex w-full items-center gap-2">
                    {!n.read ? (
                      <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                    ) : null}
                    <span className={cn("truncate text-sm", !n.read && "font-medium")}>{text}</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatRelative(n.createdAt, locale)}
                  </span>
                </Link>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type NotificationItem = {
  id: string;
  type: string;
  data: Record<string, string | number>;
  url: string;
  read: boolean;
  createdAt: string;
};

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
