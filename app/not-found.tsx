import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";

export default async function NotFound() {
  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-6xl items-center px-4 py-4">
        <Logo />
      </div>
      <div className="grid flex-1 place-items-center px-4 pb-24 text-center">
        <div className="max-w-sm">
          <p className="tabular text-6xl font-semibold tracking-tight">404</p>
          <p className="mt-4 text-muted-foreground">
            {t.error.notFoundBody}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild>
              <Link href="/explore">{t.nav.explore}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">{t.brand.name}</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
