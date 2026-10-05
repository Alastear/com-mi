"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Gavel,
  Images,
  LayoutDashboard,
  ListChecks,
  Menu,
  Settings,
  Store,
  LayoutList,
  Users,
  Send,
  ExternalLink,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { ComingSoonBadge } from "@/components/locked-feature";
import { CAPABILITY_SURFACES, capabilityPresentation } from "@/lib/capabilities/registry";
import { planDisplay, type PlanId } from "@/lib/billing/plans";
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
import { useState } from "react";
import { NotificationBell } from "@/components/notification-bell";
import { useDict, useLocale } from "@/lib/i18n/client";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { shopHref } from "@/lib/routes";
import { shopUrlDisplay } from "@/lib/site";

/**
 * สถานะจาก registry ใช้ร่วมทั้ง desktop/mobile — planned/internal/beta/paused
 * ยังอยู่ในกลุ่ม upcoming; เมื่อ live จึงย้ายเข้ากลุ่มจัดการร้าน
 * ป้ายไม่ใช่ permission gate: query/action ของฟีเจอร์จริงต้องตรวจฝั่ง server เสมอ
 */
function useNavItems() {
  const t = useDict();
  const { locale } = useLocale();
  return [
    { href: "/dashboard", label: t.nav.dashboard, icon: LayoutDashboard },
    { href: "/orders", label: t.nav.orders, icon: ListChecks },
    { href: "/shop", label: t.nav.shop, icon: Store },
    { href: "/services", label: t.nav.services, icon: LayoutList },
    { href: "/invites", label: t.nav.invites, icon: Send },
    { href: "/listings", label: t.nav.listings, icon: Gavel, ...capabilityPresentation(CAPABILITY_SURFACES.nav["/listings"]) },
    { href: "/portfolio", label: t.nav.portfolio, icon: Images },
    { href: "/files", label: locale === "th" ? "จัดการไฟล์" : "Files", icon: Images },
    { href: "/clients", label: t.nav.clients, icon: Users, ...capabilityPresentation(CAPABILITY_SURFACES.nav["/clients"]) },
    { href: "/analytics", label: t.nav.analytics, icon: BarChart3, ...capabilityPresentation(CAPABILITY_SURFACES.nav["/analytics"]) },
    { href: "/settings", label: t.nav.settings, icon: Settings },
  ] as const;
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = useNavItems();
  const t = useDict();
  const groups = [
    { title: t.redesign.workspace, items: items.filter((i) => ["/dashboard", "/orders", "/invites"].includes(i.href)) },
    { title: t.redesign.manageShop, items: items.filter((i) => ["/shop", "/services", "/portfolio", "/files", "/settings"].includes(i.href) || ("capabilities" in i && !i.soon)) },
    { title: t.redesign.upcoming, items: items.filter((i) => "soon" in i && i.soon) },
  ];

  return (
    <nav className="flex flex-col gap-5 p-3">
      {groups.filter((group) => group.items.length > 0).map((group) => <div key={group.title}><p className="mb-2 px-3 text-xs font-medium tracking-wide text-muted-foreground">{group.title}</p>
      {group.items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "mb-1 flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
              active
                ? "bg-primary/10 font-semibold text-primary ring-1 ring-primary/15"
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">{item.label}</span>
            {"soon" in item && item.soon ? <ComingSoonBadge capabilities={item.capabilities} /> : null}
          </Link>
        );
      })}</div>)}
    </nav>
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
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const currentPage = useNavItems().find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  /**
   * ⚠️ ป้ายแพ็กเกจต้องมาจากแพ็กเกจที่ใช้จริง ไม่ใช่ค่าที่เก็บใน DB
   * เดิมอ่าน `user.plan` ตรง ๆ ช่วงเบต้าทุกคนจึงเห็น "Free" + ปุ่มอัปเกรดทุกหน้า
   * ทั้งที่ได้ลิมิตของ Pro อยู่แล้ว (effectivePlan) และข้อความชวนอัปเกรดก็สัญญา
   * "แจ้งเตือนทันที" ซึ่งยังไม่มีโค้ดรองรับ
   */
  const plan = planDisplay(user.plan as PlanId);
  const isPro = plan.shown !== "free";
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
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col overflow-y-auto border-r bg-sidebar lg:flex">
        <div className="flex h-18 shrink-0 items-center px-6">
          <Logo href="/dashboard" />
        </div>
        <NavList />

        <div className="mt-auto p-3">
          <div className="rounded-xl border bg-card p-3">
            <div className="flex items-center gap-2">
              <Badge variant={isPro ? "default" : "secondary"}>
                {t.plan[plan.shown]}
              </Badge>
            </div>
            {plan.offerUpgrade ? (
              <>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {t.dashboard.upgradeHint}
                </p>
                <Button asChild size="sm" className="mt-3 w-full">
                  <Link href="/pricing">{t.common.upgrade}</Link>
                </Button>
              </>
            ) : plan.viaBeta ? (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {t.settings.planBetaNote}
              </p>
            ) : null}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-18 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur-xl lg:px-8">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t.redesign.menu}>
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 data-[side=left]:w-72 max-w-[calc(100vw-2rem)] p-0">
              <SheetTitle className="flex h-18 shrink-0 items-center px-6">
                <Logo href="/dashboard" />
              </SheetTitle>
              <NavList onNavigate={() => setMenuOpen(false)} />
            </SheetContent>
          </Sheet>

          <p className="hidden text-sm font-semibold md:block">{currentPage?.label ?? t.redesign.workspace}</p>
          {user.handle ? (
            <Link
              href={shopPageHref}
              className="ml-4 hidden min-w-0 items-center gap-2 truncate border-l pl-4 text-xs text-muted-foreground hover:text-primary xl:flex"
            >
              {shopUrlDisplay(user.handle)}<ExternalLink className="size-3 shrink-0" aria-hidden />
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

        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 bg-muted/20">{children}</main>
      </div>
    </div>
  );
}
