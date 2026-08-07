"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { LayoutDashboard, LogOut, Menu, Receipt, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/brand";
import { LanguageToggle, ThemeToggle } from "@/components/toggles";
import { useDict } from "@/lib/i18n/client";
import { signOut } from "@/lib/auth-client";
import { UserAvatar } from "@/components/user-avatar";

/**
 * ผู้ใช้ที่ล็อกอินอยู่ ส่งมาจาก layout ฝั่ง server
 *
 * ส่งเป็น prop แทนที่จะให้ header ยิง useSession() เอง เพราะ layout เป็น Server Component
 * ที่รู้ session อยู่แล้ว — ยิงซ้ำฝั่ง client จะได้ปุ่ม "เข้าสู่ระบบ" กระพริบก่อนหนึ่งจังหวะ
 * ทุกครั้งที่โหลดหน้า ทั้งที่ผู้ใช้ล็อกอินอยู่
 */
export type HeaderUser = {
  name: string;
  email: string;
  image?: string | null;
  /**
   * มี handle = เปิดร้านแล้ว = เป็นครีเอเตอร์
   *
   * ไม่ได้ใช้คอลัมน์ `role` แยก เพราะจะกลายเป็นความจริงชุดที่สองที่ขัดกับ
   * การมีอยู่ของหน้าร้านได้ — และคนคนเดียวเป็นทั้งคนซื้อและครีเอเตอร์พร้อมกันอยู่แล้ว
   */
  handle?: string | null;
};

export function SiteHeader({ user }: { user?: HeaderUser | null }) {
  const t = useDict();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  /** เมนูของคนที่ล็อกอินอยู่ — คนซื้อเห็น "เปิดร้าน" ครีเอเตอร์เห็น "หลังบ้าน" */
  const accountLinks: Array<{ href: Route; label: string; icon: typeof Receipt }> = [
    { href: "/my/requests", label: t.nav.myRequests, icon: Receipt },
    user?.handle
      ? { href: "/dashboard", label: t.nav.creatorArea, icon: LayoutDashboard }
      : { href: "/onboarding", label: t.nav.openShop, icon: Store },
  ];

  /**
   * หน้าแรกเป็นหน้าหาครีเอเตอร์แล้ว เมนูจึงพาไปที่ "รายการเต็ม" ไม่ใช่ย้อนกลับหน้าเดิม
   * และต้องมีทางเข้าฝั่งครีเอเตอร์ให้ชัด เพราะเนื้อหานั้นไม่ได้อยู่หน้าแรกอีกต่อไป
   */
  const links: Array<{ href: Route; label: string }> = [
    { href: "/explore", label: t.nav.explore },
    { href: "/for-creators", label: t.nav.forCreators },
    { href: "/pricing", label: t.nav.pricing },
  ];

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
        <Logo />

        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Button key={l.href} asChild variant="ghost" size="sm">
              <Link href={l.href}>{l.label}</Link>
            </Button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <LanguageToggle />
          <ThemeToggle />
          {user ? (
            /*
             * เดิมปุ่มนี้ลิงก์ตรงไป /dashboard ซึ่งบังคับให้ทุกคนต้องจอง handle ก่อน
             * คนที่มาจ้างวาดจึงถูกดันเป็นครีเอเตอร์ทั้งที่ไม่ได้ต้องการ — ตอนนี้เป็นเมนู
             * ที่พาไปคำขอของตัวเองก่อน ส่วนการเปิดร้านเป็นทางเลือกที่กดเองเมื่อไรก็ได้
             */
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="hidden gap-2 sm:inline-flex">
                  <UserAvatar user={user} className="size-6" />
                  <span className="max-w-32 truncate">{user.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                  {user.email}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {accountLinks.map((l) => (
                  <DropdownMenuItem key={l.href} asChild>
                    <Link href={l.href}>
                      <l.icon className="size-4" />
                      {l.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="size-4" />
                  {t.common.signOut}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href="/sign-in">{t.common.signIn}</Link>
            </Button>
          )}

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label={t.nav.explore}>
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetTitle className="px-4 pt-4">
                <Logo />
              </SheetTitle>
              <nav className="mt-4 flex flex-col gap-1 px-2">
                {links.map((l) => (
                  <Button key={l.href} asChild variant="ghost" className="justify-start">
                    <Link href={l.href}>{l.label}</Link>
                  </Button>
                ))}
                {user ? (
                  <>
                    <div className="mt-3 flex items-center gap-2 px-3 py-2">
                      <UserAvatar user={user} className="size-6" />
                      <span className="min-w-0 flex-1 truncate text-sm">{user.name}</span>
                    </div>
                    {accountLinks.map((l) => (
                      <Button key={l.href} asChild variant="ghost" className="justify-start gap-2">
                        <Link href={l.href}>
                          <l.icon className="size-4" />
                          {l.label}
                        </Link>
                      </Button>
                    ))}
                    <Button
                      variant="ghost"
                      className="justify-start gap-2 text-muted-foreground"
                      onClick={handleSignOut}
                    >
                      <LogOut className="size-4" />
                      {t.common.signOut}
                    </Button>
                  </>
                ) : (
                  <Button asChild className="mt-3">
                    <Link href="/sign-in">{t.common.signIn}</Link>
                  </Button>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
