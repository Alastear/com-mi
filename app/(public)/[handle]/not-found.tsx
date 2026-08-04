import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";

export default async function CreatorNotFound() {
  const t = getDictionary(await getLocale());

  return (
    <div className="mx-auto grid w-full max-w-md flex-1 place-items-center px-4 py-24 text-center">
      <div>
        <p className="text-5xl font-semibold tracking-tight">404</p>
        <p className="mt-3 text-muted-foreground">{t.empty.noResults}</p>
        <Button asChild className="mt-6">
          <Link href="/explore">{t.nav.explore}</Link>
        </Button>
      </div>
    </div>
  );
}
