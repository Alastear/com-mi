"use client";

import Link from "next/link";
import type { Route } from "next";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/brand";
import { LanguageToggle, ThemeToggle } from "@/components/toggles";
import { useDict } from "@/lib/i18n/client";
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
  handle?: string | null;
};

export function SiteHeader({ user }: { user?: HeaderUser | null }) {
  const t = useDict();

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
            <Button asChild variant="ghost" size="sm" className="hidden gap-2 sm:inline-flex">
              <Link href="/dashboard">
                <UserAvatar user={user} className="size-6" />
                <span className="max-w-32 truncate">{user.name}</span>
              </Link>
            </Button>
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
                  <Button asChild variant="outline" className="mt-3 justify-start gap-2">
                    <Link href="/dashboard">
                      <UserAvatar user={user} className="size-5" />
                      <span className="truncate">{user.name}</span>
                    </Link>
                  </Button>
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
