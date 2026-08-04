"use client";

import Link from "next/link";
import { LogoMark } from "@/components/brand";
import { useDict } from "@/lib/i18n/client";

export function SiteFooter() {
  const t = useDict();

  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LogoMark className="size-5" />
          <span>{t.brand.tagline}</span>
        </div>
        <nav className="flex flex-wrap gap-4 text-sm text-muted-foreground sm:ml-auto">
          <Link href="/pricing" className="hover:text-foreground">
            {t.nav.pricing}
          </Link>
          <Link href="/explore" className="hover:text-foreground">
            {t.nav.explore}
          </Link>
          <Link href="/legal/terms" className="hover:text-foreground">
            {t.legal.terms}
          </Link>
          <Link href="/legal/privacy" className="hover:text-foreground">
            {t.legal.privacy}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
