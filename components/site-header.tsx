"use client";

import Link from "next/link";
import type { Route } from "next";
import { shopHref } from "@/lib/routes";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/brand";
import { LanguageToggle, ThemeToggle } from "@/components/toggles";
import { useDict } from "@/lib/i18n/client";
import { creator } from "@/lib/mock/data";

export function SiteHeader() {
  const t = useDict();

  const links: Array<{ href: Route; label: string }> = [
    { href: "/explore", label: t.nav.explore },
    { href: "/pricing", label: t.nav.pricing },
    { href: shopHref(creator.handle), label: t.landing.heroCtaSecondary },
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
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/dashboard">{t.common.signIn}</Link>
          </Button>

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
                <Button asChild className="mt-3">
                  <Link href="/dashboard">{t.common.signIn}</Link>
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
